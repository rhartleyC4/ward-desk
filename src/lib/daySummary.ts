// The day-ahead summary a bishopric member gets the evening before: standing meetings, sacrament
// meeting duties, and appointments for that day. Pure so it can be unit tested, and shared by the
// app and the scheduled sender (scripts/notify).
//
// Notifications show on lock screens, so lines never name a member or say what an appointment is
// for. They say what kind of thing it is, when, and how many.

import { releasesOn, sustainingsOn, type CallingNeed, type Candidate, type Meeting } from './agenda'
import { leadersScheduledBy, type SecretaryAssignment } from './appointments'
import { blockLabel, hhmm, timeLabel, WEEKDAYS } from './availability'
import { longDate, weekday, type IsoDate } from './dates'
import type { Enums } from './database.types'
import { awayOn, eventsOn, type Absence, type RecurringEvent } from './schedule'
import { endsAt, wardParts, type Booked } from './slots'

export type SummaryPerson = { id: string; office: Enums<'bishopric_office'> | null }

export type DaySummaryInput = {
  date: IsoDate
  timeZone: string
  person: SummaryPerson
  events: RecurringEvent[]
  meetings: Pick<Meeting, 'meeting_date' | 'meeting_type' | 'title' | 'conducting_id'>[]
  appointments: Booked[]
  /** Who schedules for whom, with the default secretary already filled in (withDefaultSecretary). */
  assignments: SecretaryAssignment[]
  needs: CallingNeed[]
  candidates: Candidate[]
  absences: Absence[]
}

/** One line of the summary. `time` ("HH:MM") orders the timed lines; untimed ones follow. */
export type SummaryLine = { time?: string; text: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "and" between the last two: "1 release and 2 sustainings". */
function joinAnd(parts: string[]): string {
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '')
}

/** "3 appointments, 10–11:15 AM": the first start to the last end, in the ward's time zone. */
function appointmentsLine(booked: Booked[], timeZone: string, suffix = ''): SummaryLine | undefined {
  if (!booked.length) return undefined
  const sorted = [...booked].sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!))
  const start = wardParts(sorted[0].scheduled_at!, timeZone).time
  const end = sorted.map((a) => endsAt(a.scheduled_at!, a.duration_minutes)).sort().at(-1)!
  const range = blockLabel({ starts_at: start, ends_at: wardParts(end, timeZone).time })
  return { time: start, text: `${plural(sorted.length, 'appointment')}${suffix}, ${range}` }
}

function sacramentLines(input: DaySummaryInput): SummaryLine[] {
  const meeting = input.meetings.find((m) => m.meeting_date === input.date)
  if (!meeting || meeting.conducting_id !== input.person.id) return []
  const kind = meeting.meeting_type === 'fast_sunday' ? 'fast and testimony meeting' : 'sacrament meeting'
  const releases = releasesOn(input.date, input.needs).length
  const sustainings = sustainingsOn(input.date, input.needs, input.candidates).length
  const business = joinAnd([releases && plural(releases, 'release'), sustainings && plural(sustainings, 'sustaining')].filter((x): x is string => !!x))
  return [{ text: `Conducting ${kind}${meeting.title ? ` (${meeting.title})` : ''}${business ? `, with ${business}` : ''}` }]
}

/** Everything on this person's day, timed lines first in order, then the rest. */
export function daySummary(input: DaySummaryInput): SummaryLine[] {
  const { date, timeZone, person } = input
  const onDate = input.appointments.filter((a) => a.status === 'scheduled' && a.scheduled_at && wardParts(a.scheduled_at, timeZone).date === date)

  const lines: SummaryLine[] = []
  for (const e of eventsOn(date, input.events)) {
    lines.push(e.start_time ? { time: hhmm(e.start_time), text: `${timeLabel(e.start_time)} ${e.title}` } : { text: e.title })
  }
  lines.push(...sacramentLines(input))

  const mine = appointmentsLine(onDate.filter((a) => a.interviewer_id === person.id), timeZone)
  if (mine) lines.push(mine)

  // Secretaries hear about the appointments they booked for the leaders they cover.
  const leaders = leadersScheduledBy(person.id, input.assignments).filter((id) => id !== person.id)
  const covered = appointmentsLine(onDate.filter((a) => a.interviewer_id && leaders.includes(a.interviewer_id)), timeZone, ' you scheduled')
  if (covered) lines.push(covered)

  const sorted = [...lines.filter((l) => l.time).sort((a, b) => a.time!.localeCompare(b.time!)), ...lines.filter((l) => !l.time)]
  if (sorted.length && awayOn(date, input.absences).some((a) => a.user_id === person.id)) {
    sorted.unshift({ text: "You're marked away this day" })
  }
  return sorted
}

/** "Sunday, November 8th" */
export const dayHeading = (date: IsoDate) => `${WEEKDAYS[weekday(date)]}, ${longDate(date)}`

export type PushMessage = { title: string; body: string; url: string; tag: string }

/** The notification itself. `tag` replaces an earlier one for the same day instead of stacking. */
export function pushMessage(date: IsoDate, lines: SummaryLine[]): PushMessage {
  return {
    title: `Tomorrow: ${dayHeading(date)}`,
    body: lines.map((l) => l.text).join('\n'),
    url: '/',
    tag: `day-summary-${date}`,
  }
}
