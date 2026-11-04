// When the bishop and counselors are free for appointments: usual weekly hours, changed dates and
// away dates combined into the hours that actually apply on a day. Pure so it can be unit tested.

import { addDays, weekday, type IsoDate } from './dates'
import type { Enums, Tables } from './database.types'
import { isAway, type Absence } from './schedule'

export type UsualHours = Pick<Tables<'availability'>, 'id' | 'user_id' | 'weekday' | 'starts_at' | 'ends_at'>
export type DayChange = Pick<Tables<'availability_changes'>, 'id' | 'user_id' | 'on_date' | 'starts_at' | 'ends_at'>
export type Block = { starts_at: string; ends_at: string }

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** The offices that meet with people, so they keep appointment hours. */
export const LEADER_OFFICES: Enums<'bishopric_office'>[] = ['bishop', 'first_counselor', 'second_counselor']

export const keepsHours = (office: Enums<'bishopric_office'> | null | undefined) => !!office && LEADER_OFFICES.includes(office)

/**
 * How a day's hours were decided: the usual weekly hours, a change for that date, marked not
 * available, away on a trip, or no hours that weekday.
 */
export type DayKind = 'usual' | 'changed' | 'off' | 'away' | 'none'
export type Day = { date: IsoDate; kind: DayKind; blocks: Block[]; away?: Absence }

/** "19:00:00" or "19:00" to "19:00", so times from Postgres and from inputs compare equal. */
export const hhmm = (time: string) => time.slice(0, 5)

const byStart = (a: Block, b: Block) => hhmm(a.starts_at).localeCompare(hhmm(b.starts_at))

/** A leader's usual hours on a weekday, earliest first. */
export function usualOn(userId: string, day: number, hours: UsualHours[]): UsualHours[] {
  return hours.filter((h) => h.user_id === userId && h.weekday === day).sort(byStart)
}

/** The hours that apply to a leader on a date. Away beats a change, and a change beats the usual hours. */
export function dayFor(userId: string, date: IsoDate, hours: UsualHours[], changes: DayChange[], absences: Absence[]): Day {
  const away = isAway(userId, date, absences)
  if (away) return { date, kind: 'away', blocks: [], away }
  const changed = changes.filter((c) => c.user_id === userId && c.on_date === date)
  if (changed.some((c) => !c.starts_at)) return { date, kind: 'off', blocks: [] }
  if (changed.length) return { date, kind: 'changed', blocks: changed.map((c) => ({ starts_at: c.starts_at!, ends_at: c.ends_at! })).sort(byStart) }
  const usual = usualOn(userId, weekday(date), hours)
  return { date, kind: usual.length ? 'usual' : 'none', blocks: usual.map(({ starts_at, ends_at }) => ({ starts_at, ends_at })) }
}

/** A run of days from a date, for the week-by-week view. */
export function daysFor(userId: string, from: IsoDate, count: number, hours: UsualHours[], changes: DayChange[], absences: Absence[]): Day[] {
  return Array.from({ length: count }, (_, i) => dayFor(userId, addDays(from, i), hours, changes, absences))
}

/** Whether a new block would overlap one already there. Touching ends (7:00–8:00, 8:00–9:00) is fine. */
export function overlaps(blocks: Block[], block: Block): boolean {
  return blocks.some((b) => hhmm(block.starts_at) < hhmm(b.ends_at) && hhmm(b.starts_at) < hhmm(block.ends_at))
}

/** "19:00:00" to "7:00 PM"; on the hour reads "7 PM". */
export function timeLabel(time: string): string {
  const [h, m] = hhmm(time).split(':').map(Number)
  const hour = h % 12 || 12
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}

/** "9–11 AM", or "11 AM–1 PM" when it crosses noon. */
export function blockLabel(block: Block): string {
  const start = timeLabel(block.starts_at)
  const end = timeLabel(block.ends_at)
  const sameHalf = start.slice(-2) === end.slice(-2)
  return `${sameHalf ? start.slice(0, -3) : start}–${end}`
}

/** A day's hours in a few words, for lists. */
export function dayLabel(day: Day): string {
  if (day.kind === 'away') return day.away?.location ? `Away (${day.away.location})` : 'Away'
  if (day.kind === 'off') return 'Not available'
  if (day.kind === 'none') return 'No hours'
  return day.blocks.map(blockLabel).join(', ')
}
