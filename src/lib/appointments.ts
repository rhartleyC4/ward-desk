// Appointments the bishopric hands to the executive secretaries. An appointment with no time is
// waiting to be scheduled. Pure functions so they can be unit tested.

import type { CallingNeed, Candidate } from './agenda'
import { isSecretaryOffice } from './access'
import type { Enums, Tables } from './database.types'

export type Appointment = Pick<Tables<'interviews'>, 'id' | 'interviewer_id' | 'scheduled_at' | 'person_name' | 'purpose' | 'candidate_id' | 'status' | 'created_at'>
export type SecretaryAssignment = Pick<Tables<'secretary_assignments'>, 'leader_id' | 'secretary_id'>

export const PURPOSE_LABELS: Record<Enums<'interview_purpose'>, string> = {
  calling: 'calling',
  temple_recommend: 'temple recommend',
  ppi: 'PPI',
  youth: 'youth interview',
  tithing_declaration: 'tithing declaration',
  advancement: 'advancement',
  other: '',
}

/** Candidate statuses where someone in the bishopric is meeting with the person. */
export const NEEDS_APPOINTMENT: Candidate['status'][] = ['approved']

/** The calling appointment for a name: the open one if there is one, otherwise the latest met. */
export function appointmentFor<T extends Appointment>(candidateId: string, appointments: T[]): T | undefined {
  const mine = appointments.filter((a) => a.candidate_id === candidateId && a.purpose === 'calling')
  return mine.find((a) => a.status === 'scheduled') ?? mine.filter((a) => a.status === 'completed').sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
}

/**
 * Who schedules for each leader, filling in the gaps: a leader nobody has been picked for falls to
 * the executive secretary when there's only one, so a ward with one secretary needs no setup.
 * Leaders someone was picked for keep that choice.
 */
export function withDefaultSecretary(
  assignments: SecretaryAssignment[],
  leaderIds: string[],
  secretaries: { id: string; office: Enums<'bishopric_office'> | null }[],
): SecretaryAssignment[] {
  const execs = secretaries.filter((s) => s.office === 'executive_secretary')
  if (execs.length !== 1) return assignments
  const uncovered = leaderIds.filter((id) => !assignments.some((a) => a.leader_id === id))
  return [...assignments, ...uncovered.map((leader_id) => ({ leader_id, secretary_id: execs[0].id }))]
}

/** The executive secretary who covers a leader by default, when no one was picked for them. */
export function defaultSecretaryFor<S extends { id: string; office: Enums<'bishopric_office'> | null }>(leaderId: string, assignments: SecretaryAssignment[], secretaries: S[]): S | undefined {
  if (assignments.some((a) => a.leader_id === leaderId)) return undefined
  const execs = secretaries.filter((s) => s.office === 'executive_secretary')
  return execs.length === 1 ? execs[0] : undefined
}

type Office = { id: string; office: Enums<'bishopric_office'> | null }

/**
 * Who can be picked to schedule for a leader: the executive and assistant executive secretaries,
 * plus anyone already picked, so an older choice still shows and can be undone.
 */
export function schedulersFrom<S extends Office>(secretaries: S[], assignments: SecretaryAssignment[]): S[] {
  return secretaries.filter((s) => isSecretaryOffice(s.office) || assignments.some((a) => a.secretary_id === s.id))
}

/**
 * Whether the only executive secretary does all the scheduling, with no assistant to split the
 * leaders with, so there's no reason to ask who schedules for whom.
 */
export function soleScheduler(assignments: SecretaryAssignment[], secretaries: Office[]): boolean {
  const schedulers = schedulersFrom(secretaries, assignments)
  return schedulers.length === 1 && schedulers[0].office === 'executive_secretary'
}

/** The leaders this person schedules for. */
export function leadersScheduledBy(userId: string, assignments: SecretaryAssignment[]): string[] {
  return assignments.filter((a) => a.secretary_id === userId).map((a) => a.leader_id)
}

/** The leaders this secretary schedules for, or everyone when they haven't been assigned any. */
export function myLeaderIds(
  userId: string,
  data: { assignments: SecretaryAssignment[]; bishopric: { id: string }[]; secretaries: { id: string; office: Enums<'bishopric_office'> | null }[] },
): { leaderIds: string[]; assigned: boolean } {
  const assigned = leadersScheduledBy(userId, withDefaultSecretary(data.assignments, data.bishopric.map((l) => l.id), data.secretaries))
  const leaderIds = assigned.length ? data.bishopric.filter((l) => assigned.includes(l.id)).map((l) => l.id) : data.bishopric.map((l) => l.id)
  return { leaderIds, assigned: assigned.length > 0 }
}

/** Open appointments, split into those waiting for a time (oldest first) and those booked (soonest first). */
export function splitAppointments<T extends Appointment>(appointments: T[], leaderIds?: string[]): { toSchedule: T[]; scheduled: T[] } {
  const open = appointments.filter((a) => a.status === 'scheduled' && (!leaderIds || (a.interviewer_id && leaderIds.includes(a.interviewer_id))))
  return {
    toSchedule: open.filter((a) => !a.scheduled_at).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    scheduled: open.filter((a) => a.scheduled_at).sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!)),
  }
}

/** What the appointment is for: "Extend call: Primary Teacher", or the interview purpose. */
export function appointmentPurpose(a: Appointment, needs: CallingNeed[], candidates: Candidate[]): string {
  if (a.purpose === 'calling' && a.candidate_id) {
    const c = candidates.find((x) => x.id === a.candidate_id)
    const calling = needs.find((n) => n.id === c?.need_id)?.calling_title ?? c?.calling_title
    if (calling) return `Extend call: ${calling}`
  }
  const label = PURPOSE_LABELS[a.purpose]
  return label ? label[0].toUpperCase() + label.slice(1) : 'Other'
}

/** "Sun, Nov 8, 10:00 AM" in the ward's time zone. */
export function whenLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

/** Date and time inputs (browser local time, which is the ward's for anyone using this) to a timestamp. */
export function toTimestamp(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString()
}

/** A timestamp back to date and time input values in browser local time. */
export function toInputs(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}
