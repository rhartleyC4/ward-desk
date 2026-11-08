// The scheduled notifications that aren't about appointments:
// - From late morning, anyone with a request due tomorrow that isn't done yet.
// - Sunday afternoon, the ward clerk: the callings sustained and people released that day, so the
//   church's records can be updated.
// - In the daytime, a ward leader whose calling request the bishopric started on or finished.
// notification_log (once per person and day) and push_events (once per request and stage) keep
// each from going twice. Connects as the database owner, so it reads past RLS.

import type { Sql } from 'postgres'
import { releasesOn, sustainingsOn } from '../../src/lib/agenda'
import { addDays } from '../../src/lib/dates'
import type { Enums } from '../../src/lib/database.types'
import type { DaySummaryInput } from '../../src/lib/daySummary'
import { wardNow } from '../../src/lib/followUp'
import {
  DUE_FROM_HOUR,
  DUE_UNTIL_HOUR,
  progressMessage,
  PROGRESS_FROM_HOUR,
  PROGRESS_UNTIL_HOUR,
  RECORD_FROM_HOUR,
  RECORD_UNTIL_HOUR,
  requestsDueMessage,
  toRecordMessage,
  type RequestStage,
} from '../../src/lib/notices'
import type { NotificationKind } from '../../src/lib/notifications'
import { deliver, loadMuted, sendToDevices, type Device, type Sender } from './deliver'

type Outcome = 'sent' | 'no-devices' | 'muted' | 'failed' | 'dry-run'

export type DailyReport = { userId: string; office: Enums<'bishopric_office'> | null; kind: NotificationKind; devices: number; outcome: Outcome }

export type DailyOptions = { sql: Sql; now: Date; timeZone: string; send: Sender; dryRun?: boolean; only?: string[] }

const between = (hour: number, from: number, until: number) => hour >= from && hour < until

/** Accepted names count; one still being considered on that Sunday wasn't sustained. */
const ACCEPTED = ['accepted', 'set_apart']

export async function sendDaily({ sql, now, timeZone, send, dryRun = false, only }: DailyOptions): Promise<DailyReport[]> {
  const { date: today, hour } = wardNow(now, timeZone)
  const dueWindow = between(hour, DUE_FROM_HOUR, DUE_UNTIL_HOUR)
  const recordWindow = between(hour, RECORD_FROM_HOUR, RECORD_UNTIL_HOUR)
  const progressWindow = between(hour, PROGRESS_FROM_HOUR, PROGRESS_UNTIL_HOUR)
  if (!dueWindow && !recordWindow && !progressWindow) return []

  const tomorrow = addDays(today, 1)
  const [devices, offices, muted, logged] = await Promise.all([
    sql<Device[]>`select id, user_id, endpoint, p256dh, auth from public.push_subscriptions`,
    sql<{ id: string; office: Enums<'bishopric_office'> | null }[]>`select id, office from public.profiles`,
    loadMuted(sql),
    sql<{ user_id: string; kind: string }[]>`
      select user_id, kind from public.notification_log
      where (kind = 'request_due' and for_date = ${tomorrow}) or (kind = 'callings_to_record' and for_date = ${today})`,
  ])
  const sent = new Set(logged.map((l) => `${l.user_id}:${l.kind}`))
  const reports: DailyReport[] = []

  /** Sends to the person's devices with `go`, unless they turned it off. Says what happened. */
  const notify = async (userId: string, kind: NotificationKind, go: (mine: Device[]) => Promise<'sent' | 'failed'>): Promise<Outcome | null> => {
    if (only && !only.includes(userId)) return null
    const mine = devices.filter((d) => d.user_id === userId)
    const outcome: Outcome = muted(userId, kind) ? 'muted' : !mine.length ? 'no-devices' : dryRun ? 'dry-run' : await go(mine)
    reports.push({ userId, office: offices.find((o) => o.id === userId)?.office ?? null, kind, devices: mine.length, outcome })
    return outcome
  }

  if (dueWindow) {
    const due = await sql<{ to_id: string; count: number }[]>`
      select to_id, count(*)::int as count from public.requests where due_on = ${tomorrow} and status in ('sent', 'seen') and to_id is not null group by to_id`
    for (const d of due) {
      if (sent.has(`${d.to_id}:request_due`)) continue
      const message = requestsDueMessage(tomorrow, d.count)
      await notify(d.to_id, 'request_due', (mine) => deliver(sql, send, mine, d.to_id, 'request_due', tomorrow, message))
    }
  }

  if (recordWindow) {
    const [clerks, needs, candidates] = await Promise.all([
      sql<{ id: string }[]>`
        select p.id from public.profiles p join public.roles r on r.user_id = p.id and r.role = 'bishopric' where p.office = 'ward_clerk'`,
      sql<DaySummaryInput['needs']>`
        select id, calling_title, release_name, release_on::text, release_only, status from public.calling_needs
        where release_on = ${today} or id in (select need_id from public.calling_candidates where sustain_on = ${today})`,
      sql<DaySummaryInput['candidates']>`
        select id, need_id, calling_title, person_name, status, sustain_on::text, set_apart_on::text from public.calling_candidates
        where sustain_on = ${today} and status in ${sql(ACCEPTED)}`,
    ])
    const released = releasesOn(today, [...needs]).length
    const sustained = sustainingsOn(today, [...needs], [...candidates]).length
    if (released || sustained) {
      const message = toRecordMessage(today, sustained, released)
      for (const clerk of clerks) {
        if (sent.has(`${clerk.id}:callings_to_record`)) continue
        await notify(clerk.id, 'callings_to_record', (mine) => deliver(sql, send, mine, clerk.id, 'callings_to_record', today, message))
      }
    }
  }

  if (progressWindow) {
    const moved = await sql<{ id: string; requested_by: string; stage: RequestStage }[]>`
      select r.id, r.requested_by, s.stage from public.calling_requests r
      cross join lateral (select public.calling_request_stage(r.id) as stage) s
      where s.stage in ('in_progress', 'finished') and r.requested_by is not null
        and not exists (select 1 from public.push_events e where e.key = format('calling:%s:stage:%s', r.id, s.stage))`
    for (const r of moved) {
      // Finishing also covers having started, so a request that went straight to finished tells once.
      const keys = r.stage === 'finished' ? [`calling:${r.id}:stage:in_progress`, `calling:${r.id}:stage:finished`] : [`calling:${r.id}:stage:in_progress`]
      const outcome = await notify(r.requested_by, 'calling_request_progress', (mine) => sendToDevices(sql, send, mine, progressMessage(r.id, r.stage)))
      // Recorded unless it failed, so turning it on later doesn't send old news.
      if (outcome && outcome !== 'failed' && outcome !== 'dry-run') {
        await sql`insert into public.push_events ${sql(keys.map((key) => ({ key })))} on conflict (key) do nothing`
      }
    }
  }

  return reports
}
