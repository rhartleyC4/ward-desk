// Open appointment times: a leader's hours for each day, filled with appointments of a given
// length around the ones already booked (each as long as it was booked for), minus anything past. Hours are wall-clock times in the ward's time zone; booked
// appointments are timestamps, so both are compared as ward dates and times. Pure so it can be
// unit tested.

import { blockLabel, daysFor, hhmm, timeLabel, WEEKDAYS, type DayChange, type UsualHours } from './availability'
import { longDate, weekday, type IsoDate } from './dates'
import type { Enums, Tables } from './database.types'
import type { Absence } from './schedule'

export type Booked = Pick<Tables<'interviews'>, 'id' | 'interviewer_id' | 'scheduled_at' | 'status' | 'duration_minutes'>
export type Slot = { leaderId: string; date: IsoDate; time: string; at: string; minutes: number }
type Purpose = Enums<'interview_purpose'>

/** Most appointments take 10 minutes. The secretary adjusts it in 5-minute steps. */
export const DEFAULT_MINUTES = 10
export const STEP_MINUTES = 5
export const MAX_MINUTES = 120

/** Temple recommend interviews take at least 10 minutes; extending a calling can take 5. Matches the database checks. */
export const minMinutes = (purpose: Purpose) => (purpose === 'temple_recommend' ? 10 : STEP_MINUTES)

/** A length moved up or down a step, kept within what that kind of appointment allows. */
export function adjustMinutes(minutes: number, steps: number, purpose: Purpose): number {
  return Math.min(MAX_MINUTES, Math.max(minMinutes(purpose), minutes + steps * STEP_MINUTES))
}

/** "10 min", or "1 hr 15 min" for the long ones. */
export function minutesLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h && `${h} hr`, m && `${m} min`].filter(Boolean).join(' ')
}

const parts = (timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** How far the ward's clock is ahead of UTC at an instant, in minutes (negative in the Americas). */
function offsetMinutes(utcMs: number, timeZone: string): number {
  const p = Object.fromEntries(parts(timeZone).formatToParts(new Date(utcMs)).map((x) => [x.type, Number(x.value)]))
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utcMs) / 60_000
}

/** A timestamp as the ward's date and "HH:MM" time. */
export function wardParts(iso: string, timeZone: string): { date: IsoDate; time: string } {
  const p = Object.fromEntries(parts(timeZone).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

/** A ward date and wall-clock time as a timestamp, correct across daylight saving changes. */
export function wardTimestamp(date: IsoDate, time: string, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = hhmm(time).split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  let at = guess - offsetMinutes(guess, timeZone) * 60_000
  // The offset at the real instant can differ from the guess's on the day the clocks change.
  const second = offsetMinutes(at, timeZone)
  at = guess - second * 60_000
  return new Date(at).toISOString()
}

const toMinutes = (time: string) => {
  const [h, m] = hhmm(time).split(':').map(Number)
  return h * 60 + m
}
const fromMinutes = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`

export type SlotInput = {
  leaderId: string
  from: IsoDate
  days: number
  hours: UsualHours[]
  changes: DayChange[]
  absences: Absence[]
  booked: Booked[]
  now: Date
  timeZone: string
  /** How long the appointment being scheduled takes. */
  minutes?: number
  /** The appointment being moved, so its current time doesn't block itself. */
  ignoreId?: string
}

/**
 * Times a leader could start an appointment of the given length, soonest first. Each block of
 * hours fills from its start, one appointment after another; when a time would run into a booked
 * appointment, the next one starts right after that appointment ends. So longer or shorter
 * bookings shift the open times around them, and nothing runs past the end of the hours.
 */
export function openSlots({ leaderId, from, days, hours, changes, absences, booked, now, timeZone, minutes = DEFAULT_MINUTES, ignoreId }: SlotInput): Slot[] {
  const taken = booked
    .filter((b) => b.status === 'scheduled' && b.interviewer_id === leaderId && b.scheduled_at && b.id !== ignoreId)
    .map((b) => {
      const { date, time } = wardParts(b.scheduled_at!, timeZone)
      return { date, start: toMinutes(time), end: toMinutes(time) + b.duration_minutes }
    })

  const slots: Slot[] = []
  for (const day of daysFor(leaderId, from, days, hours, changes, absences)) {
    const busy = taken.filter((t) => t.date === day.date)
    for (const block of day.blocks) {
      const end = toMinutes(block.ends_at)
      let start = toMinutes(block.starts_at)
      while (start + minutes <= end) {
        const clash = busy.filter((b) => start < b.end && b.start < start + minutes)
        if (clash.length) {
          start = Math.max(...clash.map((b) => b.end))
          continue
        }
        const time = fromMinutes(start)
        const at = wardTimestamp(day.date, time, timeZone)
        if (new Date(at) > now) slots.push({ leaderId, date: day.date, time, at, minutes })
        start += minutes
      }
    }
  }
  return slots
}

/** Slots grouped by date, in order, for a day-by-day picker. */
export function slotsByDay(slots: Slot[]): { date: IsoDate; slots: Slot[] }[] {
  const days = new Map<IsoDate, Slot[]>()
  for (const s of slots) days.set(s.date, [...(days.get(s.date) ?? []), s])
  return [...days.entries()].map(([date, daySlots]) => ({ date, slots: daySlots }))
}

/** "Sun, November 8th at 9:15 AM", the way a message offers a time. */
export function slotLabel(slot: Pick<Slot, 'date' | 'time'>): string {
  return `${WEEKDAYS[weekday(slot.date)].slice(0, 3)}, ${longDate(slot.date)} at ${timeLabel(slot.time)}`
}

/** When an appointment ends. */
export const endsAt = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()

/** "9:00–9:10 AM" for a booked appointment, in the ward's time zone. */
export function bookedRange(iso: string, minutes: number, timeZone: string): string {
  const start = wardParts(iso, timeZone).time
  const end = wardParts(endsAt(iso, minutes), timeZone).time
  return blockLabel({ starts_at: start, ends_at: end })
}

/**
 * Booked appointments that overlap another with the same leader, which happens when one is made
 * longer. Open times move on their own; booked ones don't, so the secretary needs to see these.
 */
export function overlapping(booked: Booked[]): Set<string> {
  const timed = booked.filter((b) => b.status === 'scheduled' && b.scheduled_at && b.interviewer_id)
  const out = new Set<string>()
  for (const a of timed) {
    const aStart = new Date(a.scheduled_at!).getTime()
    const aEnd = aStart + a.duration_minutes * 60_000
    for (const b of timed) {
      if (a.id === b.id || a.interviewer_id !== b.interviewer_id) continue
      const bStart = new Date(b.scheduled_at!).getTime()
      if (aStart < bStart + b.duration_minutes * 60_000 && bStart < aEnd) out.add(a.id)
    }
  }
  return out
}

/** How long times offered to someone are kept from everyone else while they reply. */
export const HOLD_DAYS = 3

type Offered = Booked & Pick<Tables<'interviews'>, 'offered_at' | 'offered_times'>

/** When the hold on someone's offered times ends. */
export const holdEnds = (offeredAt: string, days = HOLD_DAYS) => new Date(new Date(offeredAt).getTime() + days * 86_400_000)

/** Whether someone still waiting for a time has offered times on hold. */
export const isHolding = (a: Offered, now: Date, days = HOLD_DAYS) =>
  a.status === 'scheduled' && !a.scheduled_at && !!a.offered_at && a.offered_times.length > 0 && holdEnds(a.offered_at, days) > now

/**
 * Times offered to people still waiting, as if booked, so the picker doesn't offer them to anyone
 * else. Each carries the appointment's id, so that appointment's own picker (which ignores its own
 * id) still shows them. The hold ends when the person is booked, released, or after a few days.
 */
export function heldTimes(appointments: Offered[], now: Date, days = HOLD_DAYS): Booked[] {
  return appointments
    .filter((a) => isHolding(a, now, days))
    .flatMap((a) => a.offered_times.map((at) => ({ id: a.id, interviewer_id: a.interviewer_id, scheduled_at: at, status: a.status, duration_minutes: a.duration_minutes })))
}
