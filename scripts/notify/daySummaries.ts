// Loads one day from the database and sends each bishopric member their day-ahead summary on
// every device they turned it on for. Connects as the database owner, so it reads past RLS; keep
// what it writes to notification_log and stale push_subscriptions. Run by tick.ts and send.ts.

import type { Sql } from 'postgres'
import { withDefaultSecretary } from '../../src/lib/appointments'
import { keepsHours } from '../../src/lib/availability'
import { daySummary, pushMessage, type DaySummaryInput, type SummaryLine, type SummaryPerson } from '../../src/lib/daySummary'
import type { IsoDate } from '../../src/lib/dates'
import { deliver, loadMuted, type Device, type Sender } from './deliver'

export type { Device, SendResult, Sender } from './deliver'

type DayData = Omit<DaySummaryInput, 'person' | 'date' | 'timeZone'> & { people: SummaryPerson[]; devices: Device[]; alreadySent: Set<string> }

export async function loadDay(sql: Sql, date: IsoDate): Promise<DayData> {
  const [people, devices, events, rotations, meetings, appointments, assignments, needs, candidates, absences, sent, requests, callingRequests] = await Promise.all([
    sql<SummaryPerson[]>`
      select p.id, p.office from public.profiles p
      join public.roles r on r.user_id = p.id and r.role = 'bishopric'`,
    sql<Device[]>`
      select s.id, s.user_id, s.endpoint, s.p256dh, s.auth from public.push_subscriptions s
      join public.roles r on r.user_id = s.user_id and r.role = 'bishopric'`,
    sql<DaySummaryInput['events']>`select title, weekday, week_of_month, start_time::text from public.recurring_events`,
    sql<DaySummaryInput['rotations']>`select title, months, assignee_id, assignee_label, weekday, week_of_month from public.rotations`,
    sql<DaySummaryInput['meetings']>`
      select meeting_date::text, meeting_type, title, conducting_id from public.meetings where meeting_date = ${date}`,
    // A day either side, since the ward's day doesn't line up with UTC's. The summary keeps the ward's.
    sql<(Omit<DaySummaryInput['appointments'][number], 'scheduled_at'> & { scheduled_at: Date })[]>`
      select id, interviewer_id, scheduled_at, status, duration_minutes from public.interviews
      where status = 'scheduled' and scheduled_at >= ${date}::date - 1 and scheduled_at < ${date}::date + 2`,
    sql<DaySummaryInput['assignments']>`select leader_id, secretary_id from public.secretary_assignments`,
    sql<DaySummaryInput['needs']>`
      select id, calling_title, release_name, release_on::text, release_only, status from public.calling_needs where release_on = ${date}`,
    sql<DaySummaryInput['candidates']>`
      select id, need_id, calling_title, person_name, status, sustain_on::text, set_apart_on::text from public.calling_candidates where sustain_on = ${date}`,
    sql<DaySummaryInput['absences']>`
      select user_id, starts_on::text, ends_on::text, location from public.absences where starts_on <= ${date} and ends_on >= ${date}`,
    sql<{ user_id: string }[]>`select user_id from public.notification_log where kind = 'day_summary' and for_date = ${date}`,
    sql<NonNullable<DaySummaryInput['requests']>>`select to_id, status::text, due_on::text from public.requests where status in ('sent', 'seen')`,
    sql<NonNullable<DaySummaryInput['callingRequests']>>`select routed_to, received_at::text from public.calling_requests where received_at is null`,
  ])
  const leaders = people.filter((p) => keepsHours(p.office)).map((p) => p.id)
  return {
    people: [...people],
    devices: [...devices],
    events: [...events],
    rotations: [...rotations],
    meetings: [...meetings],
    appointments: appointments.map((a) => ({ ...a, scheduled_at: a.scheduled_at.toISOString() })),
    assignments: withDefaultSecretary([...assignments], leaders, [...people]),
    needs: [...needs],
    candidates: [...candidates],
    absences: [...absences],
    requests: [...requests],
    callingRequests: [...callingRequests],
    alreadySent: new Set(sent.map((s) => s.user_id)),
  }
}

export type PersonReport = { userId: string; office: SummaryPerson['office']; lines: SummaryLine[]; devices: number; outcome: 'sent' | 'nothing-on' | 'muted' | 'no-devices' | 'already-sent' | 'failed' | 'dry-run' }

export type RunOptions = {
  sql: Sql
  date: IsoDate
  timeZone: string
  send: Sender
  /** Build and report, but send and log nothing. */
  dryRun?: boolean
  /** Send even to people already sent this day's summary. */
  force?: boolean
  /** Only these people (profile ids), to test without notifying everyone. */
  only?: string[]
}

export async function sendDaySummaries({ sql, date, timeZone, send, dryRun = false, force = false, only }: RunOptions): Promise<PersonReport[]> {
  const [day, muted] = await Promise.all([loadDay(sql, date), loadMuted(sql)])
  const reports: PersonReport[] = []
  for (const person of day.people) {
    if (only && !only.includes(person.id)) continue
    const lines = daySummary({ ...day, date, timeZone, person })
    const devices = day.devices.filter((d) => d.user_id === person.id)
    const report = (outcome: PersonReport['outcome']) => reports.push({ userId: person.id, office: person.office, lines, devices: devices.length, outcome })

    if (!lines.length) report('nothing-on')
    else if (muted(person.id, 'day_summary')) report('muted')
    else if (!devices.length) report('no-devices')
    else if (day.alreadySent.has(person.id) && !force) report('already-sent')
    else if (dryRun) report('dry-run')
    else report(await deliver(sql, send, devices, person.id, 'day_summary', date, pushMessage(date, lines)))
  }
  return reports
}
