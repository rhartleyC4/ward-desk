// Meeting assignments: who gives the prayers and the spiritual thought, and whether they've said
// yes. Pure so it can be unit tested; queries.ts loads and saves them.

import { longDate, type IsoDate } from './dates'
import type { Database, Enums, Tables } from './database.types'
import { meetingWhen } from './followUp'
import { firstName } from './messages'
import { formatTime } from './schedule'

export type MeetingPart = Enums<'meeting_part'>
export type AssignmentAnswer = Enums<'assignment_answer'>
export type AgendaAssignment = Tables<'agenda_assignments'>
type MyAssignmentRow = Database['public']['Functions']['my_meeting_assignments']['Returns'][number]
/** The generated type calls every column non-null; these can be null. */
export type MyAssignment = Omit<MyAssignmentRow, 'reply' | 'assigned_by' | 'start_time'> & { reply: string | null; assigned_by: string | null; start_time: string | null }

/** In the order they come in the meeting. */
export const MEETING_PARTS: MeetingPart[] = ['opening_prayer', 'spiritual_thought', 'closing_prayer']

export const PART_LABELS: Record<MeetingPart, string> = {
  opening_prayer: 'Opening prayer',
  spiritual_thought: 'Spiritual thought',
  closing_prayer: 'Closing prayer',
}

/** For a sentence: "give the opening prayer". */
export const PART_TASKS: Record<MeetingPart, string> = {
  opening_prayer: 'give the opening prayer',
  spiritual_thought: 'share the spiritual thought',
  closing_prayer: 'give the closing prayer',
}

export const ANSWER_LABELS: Record<AssignmentAnswer, string> = {
  asked: 'Waiting for an answer',
  accepted: 'Accepted',
  declined: 'Declined',
}

/** The chip color for each answer. */
export const ANSWER_COLORS = { asked: 'warning', accepted: 'success', declined: 'error' } as const satisfies Record<AssignmentAnswer, string>

/** Who has each part, for the agenda's picker. A part with no one is left out. */
export function byPart<T extends Pick<AgendaAssignment, 'part'>>(assignments: T[]): Partial<Record<MeetingPart, T>> {
  return Object.fromEntries(assignments.map((a) => [a.part, a]))
}

export type AssignmentChange = { part: MeetingPart; to: string | null }

/**
 * What saving the picker changes: a part given to someone new, or taken away (to: null). A part
 * left with the same person isn't touched, so their answer stands.
 */
export function assignmentChanges(current: Pick<AgendaAssignment, 'part' | 'assignee_id'>[], chosen: Partial<Record<MeetingPart, string | null>>): AssignmentChange[] {
  const now = byPart(current)
  return MEETING_PARTS.flatMap((part) => {
    if (!(part in chosen)) return []
    const to = chosen[part] || null
    return (now[part]?.assignee_id ?? null) === to ? [] : [{ part, to }]
  })
}

/** Assignments still to come for the person asked: unanswered first, then by date. */
export function upcomingForMe<T extends Pick<MyAssignment, 'meeting_date' | 'status'>>(assignments: T[], today: IsoDate): T[] {
  return assignments
    .filter((a) => a.meeting_date >= today && a.status !== 'declined')
    .sort((a, b) => Number(b.status === 'asked') - Number(a.status === 'asked') || a.meeting_date.localeCompare(b.meeting_date))
}

/** Unanswered ones, for the badge and the Home card. */
export const waitingAnswer = <T extends Pick<MyAssignment, 'meeting_date' | 'status'>>(assignments: T[], today: IsoDate) =>
  upcomingForMe(assignments, today).filter((a) => a.status === 'asked')

/** "Ward Council · November 8th, 9:15" */
export const meetingLine = (a: Pick<MyAssignment, 'meeting_name' | 'meeting_date' | 'start_time'>) =>
  `${a.meeting_name} · ${longDate(a.meeting_date)}${a.start_time ? `, ${formatTime(a.start_time)}` : ''}`

/**
 * What the secretary texts or emails someone who doesn't use the app, to ask them to take a part:
 * "Hi Sister Young, would you be willing to give the opening prayer in Ward Council on Sunday,
 * November 8th at 9:15 AM? ..."
 */
export function assignmentMessage(v: { name: string; part: MeetingPart; meeting: string; date: IsoDate; startTime: string | null; myName: string }): string {
  const hi = firstName(v.name)
  return [
    `Hi${hi ? ` ${hi}` : ''}, would you be willing to ${PART_TASKS[v.part]} in ${v.meeting} on ${meetingWhen(v.date, v.startTime)}? Please let me know either way, or if you'll be away that day.`,
    '',
    `Thanks!${v.myName.trim() ? `\n${v.myName.trim()}` : ''}`,
  ].join('\n')
}

/** "Ward Council, November 8th", for the email's subject. */
export const assignmentSubject = (meeting: string, date: IsoDate) => `${meeting}, ${longDate(date)}`
