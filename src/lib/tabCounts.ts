// How many things on each main tab need this person's attention, for the badges on the tab bar.
// Each item is counted on one tab only, the one where it's dealt with, so the badges add up to
// what's waiting. Pure so the unit tests can cover the rules; queries.ts loads the rows.

import { nothingToPlan } from './agenda'
import { splitAppointments, myLeaderIds, type Appointment, type SecretaryAssignment } from './appointments'
import type { Enums, Tables } from './database.types'
import type { IsoDate } from './dates'
import { toReport, type FollowUpAppointment } from './followUp'
import { isAway } from './schedule'

export type TabCounts = Partial<Record<'/home' | '/agenda' | '/sacrament' | '/appointments' | '/requests', number>>

/** A bishop's or counselor's Home: appointments that are over and still need "how did it go?". */
export function leaderHomeCount(userId: string, appointments: FollowUpAppointment[], now: Date): number {
  return toReport(userId, appointments, now).length
}

type HomeAppointment = Appointment & FollowUpAppointment

/** A secretary's Home: names still needing a time, for their leaders. */
export function secretaryHomeCount(
  userId: string,
  data: {
    appointments: HomeAppointment[]
    assignments: SecretaryAssignment[]
    bishopric: { id: string }[]
    secretaries: { id: string; office: Enums<'bishopric_office'> | null }[]
  },
): number {
  const { leaderIds } = myLeaderIds(userId, data)
  return splitAppointments(data.appointments, leaderIds).toSchedule.length
}

type Suggestion = Pick<Tables<'calling_candidates'>, 'need_id' | 'status' | 'request_id'>

/**
 * The bishopric agenda: names suggested for a calling and not yet sorted onto one. A name that came
 * with a calling request nobody has marked received is left out, since the Requests tab counts that.
 */
export function meetingsCount(candidates: Suggestion[], unreceivedRequestIds: string[]): number {
  return candidates.filter((c) => c.need_id == null && c.status === 'suggested' && !(c.request_id && unreceivedRequestIds.includes(c.request_id))).length
}

type Sunday = Pick<Tables<'meetings'>, 'meeting_date' | 'meeting_type' | 'conducting_id'>

/** For whoever plans sacrament meeting: what's missing for the coming Sunday (unplanned, no one conducting, or they're away). */
export function sacramentCount(sunday: IsoDate, meeting: Sunday | undefined, absences: Tables<'absences'>[]): number {
  if (!meeting) return 1
  if (nothingToPlan(meeting.meeting_type)) return 0
  if (!meeting.conducting_id) return 1
  return isAway(meeting.conducting_id, sunday, absences) ? 1 : 0
}

/** Everything across the tabs, for the badge on the installed app's icon. */
export const totalCount = (counts: TabCounts) => Object.values(counts).reduce<number>((n, c) => n + (c ?? 0), 0)
