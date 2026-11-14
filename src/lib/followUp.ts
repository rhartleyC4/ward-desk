// What happens to an appointment after it's booked: the secretary reminds the person the day
// before (unless they've turned reminders off), and afterwards the leader reports how it went.
// Also the meeting reminders a secretary sends for standing meetings, and the notifications that
// ask for each. Pure so the app, the scheduled sender (scripts/notify) and the unit tests share it.
//
// Notifications show on lock screens, so they say how many and when, never who or what for.

import { timeLabel, WEEKDAYS } from './availability'
import { addDays, longDate, weekday, type IsoDate } from './dates'
import type { Tables } from './database.types'
import { eventsOn } from './schedule'
import { endsAt, wardParts } from './slots'

/** How long after a leader's last appointment of the day to ask how they went. */
export const REPORT_AFTER_MINUTES = 30
/** The secretary is asked to send tomorrow's reminders from this hour of the ward's day (24-hour)... */
export const REMIND_FROM_HOUR = 10
/** ...until this one, so a job that couldn't run at 10 still asks later that day, but never at night. */
export const REMIND_UNTIL_HOUR = 20

export type FollowUpAppointment = Pick<Tables<'interviews'>, 'id' | 'interviewer_id' | 'scheduled_at' | 'duration_minutes' | 'status' | 'reminded_at'>
export type RemindedEvent = Pick<Tables<'recurring_events'>, 'id' | 'title' | 'weekday' | 'week_of_month' | 'start_time' | 'reminder_by' | 'agenda_template_id'>
/** A meeting's agenda on one date: who has the prayers and the spiritual thought. */
export type AgendaAssignments = Pick<Tables<'agendas'>, 'template_id' | 'opening_prayer' | 'spiritual_thought' | 'closing_prayer'>
export type MeetingReminder = Pick<Tables<'meeting_reminders'>, 'event_id' | 'for_date'>

const booked = <A extends FollowUpAppointment>(a: A): a is A & { scheduled_at: string } => a.status === 'scheduled' && !!a.scheduled_at
const ended = (a: FollowUpAppointment & { scheduled_at: string }, now: Date) => new Date(endsAt(a.scheduled_at, a.duration_minutes)) <= now
const byTime = (a: { scheduled_at: string | null }, b: { scheduled_at: string | null }) => a.scheduled_at!.localeCompare(b.scheduled_at!)

/** A leader's appointments that are over and still waiting to be marked done or missed, oldest first. */
export function toReport<A extends FollowUpAppointment>(leaderId: string, appointments: A[], now: Date): A[] {
  return appointments.filter((a) => booked(a) && a.interviewer_id === leaderId && ended(a, now)).sort(byTime)
}

/** Appointments on this ward date for these leaders, with the ones not reminded yet first. */
export function appointmentsOn<A extends FollowUpAppointment>(appointments: A[], leaderIds: string[], date: IsoDate, timeZone: string): A[] {
  return appointments.filter((a) => booked(a) && a.interviewer_id && leaderIds.includes(a.interviewer_id) && wardParts(a.scheduled_at, timeZone).date === date).sort(byTime)
}

/** The standing meetings on this date that this person sends reminders for. */
export function meetingsToRemind<E extends RemindedEvent>(userId: string, date: IsoDate, events: E[]): E[] {
  return (eventsOn(date, events) as E[]).filter((e) => e.reminder_by === userId)
}

export const meetingReminded = (eventId: string, date: IsoDate, sent: MeetingReminder[]) => sent.some((s) => s.event_id === eventId && s.for_date === date)

/** "Sunday, November 8th at 9:15 AM", or without the time when the meeting has none. For {when}. */
export function meetingWhen(date: IsoDate, startTime: string | null): string {
  const day = `${WEEKDAYS[weekday(date)]}, ${longDate(date)}`
  return startTime ? `${day} at ${timeLabel(startTime)}` : day
}

/**
 * How many of a leader's appointments today to ask about now, or 0 for not yet. The ask comes once
 * the day's last appointment has been over for REPORT_AFTER_MINUTES, so a leader who reports
 * straight away is never asked.
 */
export function reportDue(leaderId: string, appointments: FollowUpAppointment[], now: Date, timeZone: string): number {
  const today = wardParts(now.toISOString(), timeZone).date
  const mine = appointments.filter((a) => a.scheduled_at && a.status !== 'cancelled' && a.interviewer_id === leaderId && wardParts(a.scheduled_at, timeZone).date === today)
  if (!mine.length) return 0
  const last = Math.max(...mine.map((a) => new Date(endsAt(a.scheduled_at!, a.duration_minutes)).getTime()))
  if (now.getTime() < last + REPORT_AFTER_MINUTES * 60_000) return 0
  return toReport(leaderId, mine, now).length
}

/** The ward's date and hour now. */
export function wardNow(now: Date, timeZone: string): { date: IsoDate; hour: number } {
  const p = wardParts(now.toISOString(), timeZone)
  return { date: p.date, hour: Number(p.time.slice(0, 2)) }
}

/** Whether it's time to ask secretaries for tomorrow's reminders, and which day that is. */
export function remindersWindow(now: Date, timeZone: string): IsoDate | null {
  const { date, hour } = wardNow(now, timeZone)
  return hour >= REMIND_FROM_HOUR && hour < REMIND_UNTIL_HOUR ? addDays(date, 1) : null
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

export type PushMessage = { title: string; body: string; url: string; tag: string }

export function reportMessage(date: IsoDate, count: number): PushMessage {
  return {
    title: 'How did your appointments go?',
    body: `${plural(count, 'appointment')} today ${count === 1 ? 'is' : 'are'} ready to mark done or missed.`,
    url: '/home',
    tag: `report-${date}`,
  }
}

/** Meeting titles are general ("Ward Council"), so they're safe to show. */
export function remindersMessage(date: IsoDate, appointments: number, meetings: string[]): PushMessage {
  const lines = [appointments && `${plural(appointments, 'appointment reminder')} to send`, ...meetings.map((m) => `${m}: reminder to send`)].filter(Boolean)
  return {
    title: `Reminders for tomorrow`,
    body: lines.join('\n'),
    url: `/reminders?date=${date}`,
    tag: `reminders-${date}`,
  }
}
