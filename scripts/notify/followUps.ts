// The follow-up nudges: a leader is asked how today's appointments went half an hour after the
// last one ends, and a secretary is asked, from late morning the day before, to send tomorrow's
// appointment and meeting reminders (appointments only if they send them: profiles.sends_reminders).
// Each goes once per person and day (notification_log), and only
// when something is still left to do. Connects as the database owner, so it reads past RLS.

import type { Sql } from 'postgres'
import { withDefaultSecretary, leadersScheduledBy } from '../../src/lib/appointments'
import { isSecretaryOffice } from '../../src/lib/access'
import { keepsHours } from '../../src/lib/availability'
import type { IsoDate } from '../../src/lib/dates'
import type { Enums } from '../../src/lib/database.types'
import {
  appointmentsOn,
  meetingReminded,
  meetingsToRemind,
  remindersMessage,
  remindersWindow,
  reportDue,
  reportMessage,
  wardNow,
  type FollowUpAppointment,
  type MeetingReminder,
  type RemindedEvent,
} from '../../src/lib/followUp'
import { deliver, loadMuted, type Device, type PushMessage, type Sender } from './deliver'

type Person = { id: string; office: Enums<'bishopric_office'> | null; sends_reminders: boolean }

export type FollowUpReport = { userId: string; office: Person['office']; kind: 'report_due' | 'reminders'; body: string; devices: number; outcome: 'sent' | 'no-devices' | 'muted' | 'failed' | 'dry-run' }

export type FollowUpOptions = { sql: Sql; now: Date; timeZone: string; send: Sender; dryRun?: boolean; only?: string[] }

async function load(sql: Sql, today: IsoDate, tomorrow: IsoDate) {
  const [people, devices, appointments, assignments, events, sent, logged] = await Promise.all([
    sql<Person[]>`
      select p.id, p.office, p.sends_reminders from public.profiles p
      join public.roles r on r.user_id = p.id and r.role = 'bishopric'`,
    sql<Device[]>`select id, user_id, endpoint, p256dh, auth from public.push_subscriptions`,
    // A day either side, since the ward's day doesn't line up with UTC's.
    sql<(Omit<FollowUpAppointment, 'scheduled_at' | 'reminded_at'> & { scheduled_at: Date; reminded_at: Date | null })[]>`
      select id, interviewer_id, scheduled_at, duration_minutes, status, reminded_at from public.interviews
      where status <> 'cancelled' and scheduled_at >= ${today}::date - 1 and scheduled_at < ${tomorrow}::date + 2`,
    sql<{ leader_id: string; secretary_id: string }[]>`select leader_id, secretary_id from public.secretary_assignments`,
    sql<RemindedEvent[]>`select id, title, weekday, week_of_month, start_time::text, reminder_by, agenda_template_id from public.recurring_events where reminder_by is not null`,
    sql<MeetingReminder[]>`select event_id, for_date::text from public.meeting_reminders where for_date = ${tomorrow}`,
    sql<{ user_id: string; kind: string; for_date: string }[]>`
      select user_id, kind, for_date::text from public.notification_log
      where (kind = 'report_due' and for_date = ${today}) or (kind = 'reminders' and for_date = ${tomorrow})`,
  ])
  const iso = (d: Date | null) => (d ? d.toISOString() : null)
  return {
    people: [...people],
    devices: [...devices],
    appointments: appointments.map((a) => ({ ...a, scheduled_at: a.scheduled_at.toISOString(), reminded_at: iso(a.reminded_at) })),
    assignments: [...assignments],
    events: [...events],
    sent: [...sent],
    logged: new Set(logged.map((l) => `${l.user_id}:${l.kind}`)),
  }
}

/**
 * Who schedules for each leader. A leader no one covers (and there's no single executive
 * secretary to fall back on) is everyone's, the way an unassigned secretary's Home shows everyone.
 */
function schedulers(leaderIds: string[], secretaries: Person[], assignments: { leader_id: string; secretary_id: string }[]) {
  const filled = withDefaultSecretary(assignments, leaderIds, secretaries)
  const uncovered = leaderIds.filter((id) => !filled.some((a) => a.leader_id === id))
  return [...filled, ...uncovered.flatMap((leader_id) => secretaries.map((s) => ({ leader_id, secretary_id: s.id })))]
}

export async function sendFollowUps({ sql, now, timeZone, send, dryRun = false, only }: FollowUpOptions): Promise<FollowUpReport[]> {
  const { date: today } = wardNow(now, timeZone)
  const tomorrow = remindersWindow(now, timeZone)
  const [data, muted] = await Promise.all([load(sql, today, tomorrow ?? today), loadMuted(sql)])
  const reports: FollowUpReport[] = []

  const nudge = async (person: Person, kind: FollowUpReport['kind'], forDate: IsoDate, message: PushMessage) => {
    const devices = data.devices.filter((d) => d.user_id === person.id)
    const report = (outcome: FollowUpReport['outcome']) => reports.push({ userId: person.id, office: person.office, kind, body: message.body, devices: devices.length, outcome })
    if (muted(person.id, kind)) return report('muted')
    if (!devices.length) return report('no-devices')
    if (dryRun) return report('dry-run')
    report(await deliver(sql, send, devices, person.id, kind, forDate, message))
  }
  const wanted = (p: Person, kind: FollowUpReport['kind']) => (!only || only.includes(p.id)) && !data.logged.has(`${p.id}:${kind}`)

  const leaders = data.people.filter((p) => keepsHours(p.office))
  for (const leader of leaders) {
    if (!wanted(leader, 'report_due')) continue
    const count = reportDue(leader.id, data.appointments, now, timeZone)
    if (count) await nudge(leader, 'report_due', today, reportMessage(today, count))
  }

  if (tomorrow) {
    const secretaries = data.people.filter((p) => isSecretaryOffice(p.office))
    const covers = schedulers(leaders.map((l) => l.id), secretaries, data.assignments)
    for (const secretary of secretaries) {
      if (!wanted(secretary, 'reminders')) continue
      const appointments = secretary.sends_reminders ? appointmentsOn(data.appointments, leadersScheduledBy(secretary.id, covers), tomorrow, timeZone).filter((a) => !a.reminded_at) : []
      const meetings = meetingsToRemind(secretary.id, tomorrow, data.events).filter((e) => !meetingReminded(e.id, tomorrow, data.sent))
      if (appointments.length || meetings.length) await nudge(secretary, 'reminders', tomorrow, remindersMessage(tomorrow, appointments.length, meetings.map((m) => m.title)))
    }
  }
  return reports
}
