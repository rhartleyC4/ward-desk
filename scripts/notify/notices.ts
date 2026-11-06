// Sends what notification_outbox is waiting to tell: changes to appointments and away dates. A
// trigger asks the notify function to run as soon as a change is recorded, and the 10-minute run
// picks up anything that call missed. Each row is claimed before it's planned, so two runs at once
// can't send it twice. Connects as the database owner, so it reads past RLS.

import type { Sql } from 'postgres'
import { addDays } from '../../src/lib/dates'
import type { Enums } from '../../src/lib/database.types'
import { wardNow } from '../../src/lib/followUp'
import { planNotices, type NoticeContext, type OutboxRow } from '../../src/lib/notices'
import type { NotificationKind } from '../../src/lib/notifications'
import { loadMuted, sendToDevices, type Device, type Sender } from './deliver'

export type NoticeReport = { userId: string; office: Enums<'bishopric_office'> | null; kind: NotificationKind; devices: number; outcome: 'sent' | 'no-devices' | 'muted' | 'failed' | 'dry-run' }

export type NoticeOptions = { sql: Sql; now: Date; timeZone: string; send: Sender; dryRun?: boolean; only?: string[] }

/** Older than this, a change is no longer news; it's claimed and dropped. */
const STALE_HOURS = 24

export async function sendNotices({ sql, now, timeZone, send, dryRun = false, only }: NoticeOptions): Promise<NoticeReport[]> {
  // A dry run looks without claiming, so a real run still sends.
  const rows = dryRun
    ? await sql<(OutboxRow & { created_at: Date })[]>`select * from public.notification_outbox where claimed_at is null order by id`
    : await sql<(OutboxRow & { created_at: Date })[]>`
        update public.notification_outbox set claimed_at = now() where claimed_at is null returning *`
  if (!dryRun) await sql`delete from public.notification_outbox where claimed_at < now() - interval '7 days'`
  const fresh = rows
    .filter((r) => now.getTime() - r.created_at.getTime() < STALE_HOURS * 3_600_000)
    .map((r) => ({ ...r, id: Number(r.id), scheduled_at: iso(r.scheduled_at), old_scheduled_at: iso(r.old_scheduled_at) }))
    .sort((a, b) => a.id - b.id)
  if (!fresh.length) return []

  const { date: today } = wardNow(now, timeZone)
  const interviewIds = [...new Set(fresh.map((r) => r.interview_id).filter((id): id is string => !!id))]
  const absenceIds = [...new Set(fresh.map((r) => r.absence_id).filter((id): id is string => !!id))]
  const none = ['00000000-0000-0000-0000-000000000000']
  const [people, assignments, appointments, absences, summarized, devices, muted] = await Promise.all([
    sql<NoticeContext['people']>`
      select p.id, p.office from public.profiles p join public.roles r on r.user_id = p.id and r.role = 'bishopric'`,
    sql<NoticeContext['assignments']>`select leader_id, secretary_id from public.secretary_assignments`,
    sql<{ id: string; interviewer_id: string | null; scheduled_at: Date | null; status: Enums<'interview_status'> }[]>`
      select id, interviewer_id, scheduled_at, status from public.interviews
      where id in ${sql(interviewIds.length ? interviewIds : none)}
        or (${absenceIds.length > 0} and status = 'scheduled' and scheduled_at > now())`,
    sql<NoticeContext['absences']>`
      select id, user_id, starts_on::text, ends_on::text from public.absences where id in ${sql(absenceIds.length ? absenceIds : none)}`,
    sql<{ user_id: string; for_date: string }[]>`
      select user_id, for_date::text from public.notification_log where kind = 'day_summary' and for_date in (${today}, ${addDays(today, 1)})`,
    sql<Device[]>`select id, user_id, endpoint, p256dh, auth from public.push_subscriptions`,
    loadMuted(sql),
  ])

  const notices = planNotices(fresh, {
    people: [...people],
    assignments: [...assignments],
    appointments: appointments.map((a) => ({ ...a, scheduled_at: iso(a.scheduled_at) })),
    absences: [...absences],
    summarized: new Set(summarized.map((s) => `${s.user_id}:${s.for_date}`)),
    now,
    timeZone,
  })

  const reports: NoticeReport[] = []
  for (const n of notices) {
    if (only && !only.includes(n.to)) continue
    const mine = devices.filter((d) => d.user_id === n.to)
    const report = (outcome: NoticeReport['outcome']) =>
      reports.push({ userId: n.to, office: people.find((p) => p.id === n.to)?.office ?? null, kind: n.kind, devices: mine.length, outcome })
    if (muted(n.to, n.kind)) report('muted')
    else if (!mine.length) report('no-devices')
    else if (dryRun) report('dry-run')
    else report(await sendToDevices(sql, send, mine, n.message))
  }
  return reports
}

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null)
