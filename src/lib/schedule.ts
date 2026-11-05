import { addDays, monthOf, weekday, weekOfMonth, type IsoDate } from './dates'
import type { Tables } from './database.types'

export type RecurringEvent = Pick<Tables<'recurring_events'>, 'title' | 'weekday' | 'week_of_month' | 'start_time'>
export type Rotation = Pick<Tables<'rotations'>, 'title' | 'months' | 'assignee_id' | 'assignee_label' | 'weekday' | 'week_of_month'>
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
export function rotationsDue<R extends Rotation>(date: IsoDate, rotations: R[]): R[] {
  const month = monthOf(date)
  return rotations.filter((r) => r.months.includes(month))
}

/** Whether a rotation falls on a set day ("3rd Sunday") rather than any time in its months. */
export const hasDay = (r: Pick<Rotation, 'weekday' | 'week_of_month'>) => r.weekday != null && r.week_of_month != null

/** Rotations that fall on this very date (the Primary message on the 3rd Sunday of its months). */
export function rotationsOn<R extends Rotation>(date: IsoDate, rotations: R[]): R[] {
  const day = weekday(date)
  const week = weekOfMonth(date)
  return rotationsDue(date, rotations).filter((r) => hasDay(r) && r.weekday === day && r.week_of_month === week)
}

/** The date a rotation falls on in this date's month, if it has a set day and that day exists (a 5th Sunday may not). */
export function rotationDateIn<R extends Rotation>(date: IsoDate, r: R): IsoDate | undefined {
  if (!hasDay(r) || !r.months.includes(monthOf(date))) return undefined
  const first = `${date.slice(0, 8)}01`
  const day = addDays(first, (7 + r.weekday! - weekday(first)) % 7 + 7 * (r.week_of_month! - 1))
  return monthOf(day) === monthOf(date) ? day : undefined
}

/**
 * Who a rotation reminds: its assignee when that's someone in the app, otherwise the whole
 * bishopric (a PPI with the EQ president, named only by a label).
 */
export const reminds = (r: Pick<Rotation, 'assignee_id'>, userId: string) => !r.assignee_id || r.assignee_id === userId

/** This person's rotations due this month: those with a set day by date, then the ones for any time in the month. */
export function myRotationsThisMonth<R extends Rotation>(userId: string, date: IsoDate, rotations: R[]): { rotation: R; date?: IsoDate }[] {
  const mine = rotationsDue(date, rotations).filter((r) => reminds(r, userId))
  const dated = mine.flatMap((rotation) => {
    const on = rotationDateIn(date, rotation)
    return on ? [{ rotation, date: on }] : []
  })
  const anyTime = mine.filter((r) => !hasDay(r)).map((rotation) => ({ rotation }))
  return [...dated.sort((a, b) => a.date.localeCompare(b.date)), ...anyTime]
}

/** "3rd Sunday" for a rotation with a set day; '' for one due any time that month. */
export function rotationDayLabel(r: Pick<Rotation, 'weekday' | 'week_of_month'>): string {
  return hasDay(r) ? `${NTH[r.week_of_month!]} ${DAY_NAMES[r.weekday!]}` : ''
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Mar, Jun, Sep, Dec", in calendar order. */
export const monthsLabel = (months: number[]) => [...months].sort((a, b) => a - b).map((m) => MONTH_NAMES[m - 1]).join(', ')

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

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const NTH = ['', '1st', '2nd', '3rd', '4th', '5th']

/** "Every Sunday", "2nd and 4th Sundays", "1st, 3rd and 5th Tuesdays". */
export function describePattern(pattern: MeetingPattern): string {
  const day = DAY_NAMES[pattern.weekday]
  const weeks = [...(pattern.weeks_of_month ?? [])].sort()
  if (!weeks.length) return `Every ${day}`
  const nth = weeks.map((w) => NTH[w])
  const list = nth.length > 1 ? `${nth.slice(0, -1).join(', ')} and ${nth[nth.length - 1]}` : nth[0]
  return `${list} ${day}${nth.length > 1 ? 's' : ''}`
}
