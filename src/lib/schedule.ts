import { addDays, monthOf, weekday, weekOfMonth, type IsoDate } from './dates'
import type { Tables } from './database.types'

export type RecurringEvent = Pick<Tables<'recurring_events'>, 'title' | 'weekday' | 'week_of_month' | 'start_time'>
export type Rotation = Pick<Tables<'rotations'>, 'title' | 'months' | 'assignee_id' | 'assignee_label'>
export type Absence = Pick<Tables<'absences'>, 'user_id' | 'starts_on' | 'ends_on' | 'location'>
export type MeetingPattern = Pick<Tables<'agenda_templates'>, 'weekday' | 'weeks_of_month'>

/** Standing meetings that fall on this date, earliest first ("First Sunday - 8:30 Bishopric, 9:15 Welfare"). */
export function eventsOn(date: IsoDate, events: RecurringEvent[]): RecurringEvent[] {
  const day = weekday(date)
  const week = weekOfMonth(date)
  return events
    .filter((e) => e.weekday === day && (e.week_of_month == null || e.week_of_month === week))
    .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'))
}

/** Rotations due in the month of this date (PPIs, Primary message). */
export function rotationsDue(date: IsoDate, rotations: Rotation[]): Rotation[] {
  const month = monthOf(date)
  return rotations.filter((r) => r.months.includes(month))
}

/** "08:30:00" -> "8:30" */
export function formatTime(time: string | null): string {
  if (!time) return ''
  const [h, m] = time.split(':')
  return `${Number(h)}:${m}`
}

/** Absences covering this date. */
export function awayOn(date: IsoDate, absences: Absence[]): Absence[] {
  return absences.filter((a) => date >= a.starts_on && date <= a.ends_on)
}

export function isAway(userId: string | null, date: IsoDate, absences: Absence[]): Absence | undefined {
  if (!userId) return undefined
  return awayOn(date, absences).find((a) => a.user_id === userId)
}

/** Whether a meeting held on this pattern (every Sunday, or 2nd and 4th Sundays) falls on this date. */
export function meetsOn(pattern: MeetingPattern, date: IsoDate): boolean {
  return weekday(date) === pattern.weekday && (!pattern.weeks_of_month?.length || pattern.weeks_of_month.includes(weekOfMonth(date)))
}

/** The first meeting on or after this date. */
export function nextMeeting(pattern: MeetingPattern, from: IsoDate): IsoDate {
  let date = addDays(from, (7 + pattern.weekday - weekday(from)) % 7)
  // Every weekday occurs at least four times a month, so a valid pattern matches within ten weeks.
  for (let i = 0; i < 10 && !meetsOn(pattern, date); i++) date = addDays(date, 7)
  return date
}

/** The meeting after this one. */
export function followingMeeting(pattern: MeetingPattern, date: IsoDate): IsoDate {
  return nextMeeting(pattern, addDays(date, 1))
}

/** The meeting before this one. */
export function previousMeeting(pattern: MeetingPattern, date: IsoDate): IsoDate {
  let prev = addDays(date, -1 - ((7 + weekday(date) - pattern.weekday - 1) % 7))
  for (let i = 0; i < 10 && !meetsOn(pattern, prev); i++) prev = addDays(prev, -7)
  return prev
}
