// Who hears about a change to an appointment or to someone's away dates, and what it says. The
// database records each change in notification_outbox; the notify job (scripts/notify/notices.ts)
// loads the rows with what they need and asks planNotices what to send.
//
// Notifications show on lock screens, so they never name the person meeting or say what an
// appointment is for. They say which leader, when, and how many.
//
// Away dates that leave a Sunday with only one of the bishop and counselors, or none, also tell the
// rest of the bishopric (short_sunday), by office and date only.

import { withDefaultSecretary } from './appointments'
import { shortSundays, type ShortLevel } from './coverage'
import { addDays, isBetween, type IsoDate } from './dates'
import type { Enums } from './database.types'
import { isSecretaryOffice, LEADER_OFFICES } from './access'
import { timeLabel } from './availability'
import type { PushMessage } from './followUp'
import type { NotificationKind } from './notifications'
import { wardParts } from './slots'

type Office = Enums<'bishopric_office'> | null

export type OutboxEvent = 'added' | 'booked' | 'moved' | 'unbooked' | 'cancelled' | 'sent_back' | 'handed_over' | 'away'

export type OutboxRow = {
  id: number
  event: OutboxEvent
  actor_id: string | null
  interview_id: string | null
  absence_id: string | null
  leader_id: string | null
  old_leader_id: string | null
  scheduled_at: string | null
  old_scheduled_at: string | null
}

export type NoticeContext = {
  /** The bishopric, with offices. */
  people: { id: string; office: Office }[]
  assignments: { leader_id: string; secretary_id: string }[]
  /** The appointments the rows are about, as they are now, plus every booked one (for away dates). */
  appointments: { id: string; interviewer_id: string | null; scheduled_at: string | null; status: Enums<'interview_status'> }[]
  /**
   * The away dates the rows are about, as they are now (deleted ones are missing), plus every one
   * that hasn't ended when there are away rows, to see who else is gone those Sundays.
   */
  absences: { id: string; user_id: string; starts_on: IsoDate; ends_on: IsoDate }[]
  /** Leaders already sent a summary for a day, as `${userId}:${date}`. */
  summarized: Set<string>
  now: Date
  timeZone: string
}

export type Notice = { to: string; kind: NotificationKind; message: PushMessage }

const OFFICE_NAMES: Record<Exclude<Office, null>, string> = {
  bishop: 'the bishop',
  first_counselor: 'the first counselor',
  second_counselor: 'the second counselor',
  executive_secretary: 'the executive secretary',
  assistant_executive_secretary: 'the assistant executive secretary',
  ward_clerk: 'the ward clerk',
}

const officeName = (office: Office) => (office ? OFFICE_NAMES[office] : 'a leader')
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Tue, Nov 10" */
function dayLabel(date: IsoDate): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MONTHS[m - 1]} ${d}`
}

/** "today at 3 PM", "tomorrow at 9:30 AM", or "Tue, Nov 10 at 3 PM", in the ward's time. */
export function whenLabel(iso: string, now: Date, timeZone: string): string {
  const { date, time } = wardParts(iso, timeZone)
  const today = wardParts(now.toISOString(), timeZone).date
  const day = date === today ? 'today' : date === addDays(today, 1) ? 'tomorrow' : dayLabel(date)
  return `${day} at ${timeLabel(time)}`
}

/** "Nov 10" or "Nov 10–12". */
function rangeLabel(start: IsoDate, end: IsoDate): string {
  const [, sm, sd] = start.split('-').map(Number)
  const [, em, ed] = end.split('-').map(Number)
  if (start === end) return `${MONTHS[sm - 1]} ${sd}`
  return sm === em ? `${MONTHS[sm - 1]} ${sd}–${ed}` : `${MONTHS[sm - 1]} ${sd}–${MONTHS[em - 1]} ${ed}`
}

/** Short, plain tags: a notification with the same tag replaces the earlier one on the device. */
const tagFor = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)

/** Who books for each leader: the assigned secretaries, the one executive secretary, or else every secretary. */
export function bookersFor(leaderId: string, people: NoticeContext['people'], assignments: NoticeContext['assignments']): string[] {
  const secretaries = people.filter((p) => isSecretaryOffice(p.office))
  const leaders = people.filter((p) => p.office && LEADER_OFFICES.includes(p.office)).map((p) => p.id)
  const filled = withDefaultSecretary(assignments, leaders.includes(leaderId) ? leaders : [...leaders, leaderId], secretaries)
  const mine = filled.filter((a) => a.leader_id === leaderId).map((a) => a.secretary_id)
  return mine.length ? mine : secretaries.map((s) => s.id)
}

/** One thing to say to one person; several of the same kind become one notification. */
type Item = { to: string; kind: NotificationKind; text: string; rowId: number; title?: [one: string, many: string] }

const SHORT_TITLES: Record<ShortLevel, [string, string]> = {
  none: ['No bishopric on Sunday', 'No bishopric on Sundays'],
  one: ['Short-handed Sunday', 'Short-handed Sundays'],
}

export function planNotices(rows: OutboxRow[], ctx: NoticeContext): Notice[] {
  const { now, timeZone } = ctx
  const office = (id: string | null) => ctx.people.find((p) => p.id === id)?.office ?? null
  const isLeader = (id: string | null) => {
    const o = office(id)
    return !!o && LEADER_OFFICES.includes(o)
  }
  const appointment = (id: string | null) => ctx.appointments.find((a) => a.id === id)
  const future = (iso: string | null) => !!iso && new Date(iso).getTime() > now.getTime()
  const today = wardParts(now.toISOString(), timeZone).date
  const items: Item[] = []

  const tell = (to: string[], row: OutboxRow, kind: NotificationKind, text: string, title?: Item['title']) => {
    for (const id of new Set(to)) if (id !== row.actor_id) items.push({ to: id, kind, text, rowId: row.id, title })
  }
  const leaderIds = ctx.people.filter((p) => p.office && LEADER_OFFICES.includes(p.office)).map((p) => p.id)
  // Each Sunday once, however many of these away dates cover it. They're all read as they are
  // now, so every row sees the same level for a Sunday.
  const sundaysTold = new Set<IsoDate>()

  for (const row of rows) {
    if (!row.leader_id || !isLeader(row.leader_id)) continue
    const leader = officeName(office(row.leader_id))
    const current = appointment(row.interview_id)
    const bookers = () => bookersFor(row.leader_id!, ctx.people, ctx.assignments)

    switch (row.event) {
      case 'added':
        // Still waiting for a time, with the same leader.
        if (current?.status === 'scheduled' && !current.scheduled_at && current.interviewer_id === row.leader_id) {
          tell(bookers(), row, 'appointment_to_book', `${capital(leader)} has a new appointment to book.`)
        }
        break
      case 'sent_back':
        if (current?.status === 'scheduled' && !current.scheduled_at && current.interviewer_id === row.leader_id) {
          tell(bookers(), row, 'appointment_sent_back', `${capital(leader)} sent back a missed appointment to find a new time.`)
        }
        break
      case 'booked': {
        // Only the latest time is worth telling, and only when tomorrow's summary can't.
        if (current?.status !== 'scheduled' || current.scheduled_at !== row.scheduled_at || !future(row.scheduled_at)) break
        const day = wardParts(row.scheduled_at!, timeZone).date
        const soon = day === today || (day === addDays(today, 1) && ctx.summarized.has(`${row.leader_id}:${day}`))
        if (soon) tell([row.leader_id], row, 'appointment_booked', `An appointment was booked for you ${whenLabel(row.scheduled_at!, now, timeZone)}.`)
        break
      }
      case 'moved':
        if (current?.status !== 'scheduled' || current.scheduled_at !== row.scheduled_at) break
        if (!future(row.scheduled_at) && !future(row.old_scheduled_at)) break
        tell(
          [row.leader_id],
          row,
          'appointment_changed',
          `Your appointment ${whenLabel(row.old_scheduled_at!, now, timeZone)} moved to ${whenLabel(row.scheduled_at!, now, timeZone)}.`,
        )
        break
      case 'unbooked':
      case 'cancelled':
        if (!future(row.old_scheduled_at)) break
        // Unbooked and booked again since: the new booking says so.
        if (row.event === 'unbooked' && current?.scheduled_at) break
        tell([row.leader_id], row, 'appointment_changed', `Your appointment ${whenLabel(row.old_scheduled_at!, now, timeZone)} was cancelled.`)
        break
      case 'handed_over': {
        if (current?.status !== 'scheduled' || current.interviewer_id !== row.leader_id) break
        const at = current.scheduled_at && future(current.scheduled_at) ? whenLabel(current.scheduled_at, now, timeZone) : null
        tell([row.leader_id], row, 'appointment_handed_over', at ? `You were given an appointment ${at}.` : 'You were given an appointment. Your secretary will book a time.')
        tell(
          bookers(),
          row,
          'appointment_to_book',
          at ? `An appointment ${at} was handed to ${leader}. Check that the time still works.` : `${capital(leader)} has a new appointment to book.`,
        )
        if (row.old_leader_id && isLeader(row.old_leader_id) && at) tell([row.old_leader_id], row, 'appointment_changed', `Your appointment ${at} was handed to ${leader}.`)
        break
      }
      case 'away': {
        const away = ctx.absences.find((a) => a.id === row.absence_id)
        if (!away) break
        const from = away.starts_on > today ? away.starts_on : today
        for (const s of shortSundays(from, away.ends_on, leaderIds, ctx.absences)) {
          if (sundaysTold.has(s.date)) continue
          sundaysTold.add(s.date)
          const here = leaderIds.filter((id) => !s.awayIds.includes(id))
          const text =
            s.level === 'none'
              ? `No one in the bishopric will be at church ${dayLabel(s.date)}. Someone will need to preside.`
              : `Only ${officeName(office(here[0]))} will be at church ${dayLabel(s.date)}.`
          tell(ctx.people.map((p) => p.id), row, 'short_sunday', text, SHORT_TITLES[s.level])
        }
        const covered = ctx.appointments.filter(
          (a) =>
            a.status === 'scheduled' &&
            a.interviewer_id === away.user_id &&
            future(a.scheduled_at) &&
            isBetween(wardParts(a.scheduled_at!, timeZone).date, away.starts_on, away.ends_on),
        )
        if (!covered.length) break
        tell(
          bookers(),
          row,
          'away_conflict',
          `${capital(leader)} will be away ${rangeLabel(away.starts_on, away.ends_on)}, when ${plural(covered.length, 'appointment')} ${covered.length === 1 ? 'is' : 'are'} booked.`,
        )
        break
      }
    }
  }

  return group(items)
}

const TITLES: Partial<Record<NotificationKind, [one: string, many: string]>> = {
  appointment_to_book: ['Appointment to book', 'Appointments to book'],
  appointment_sent_back: ['Appointment to rebook', 'Appointments to rebook'],
  away_conflict: ['Appointments to move', 'Appointments to move'],
  appointment_booked: ['Appointment booked', 'Appointments booked'],
  appointment_changed: ['Appointment changed', 'Appointments changed'],
  appointment_handed_over: ['Appointment for you', 'Appointments for you'],
}

const MANY: Partial<Record<NotificationKind, (n: number) => string>> = {
  appointment_to_book: (n) => `${n} new appointments to book.`,
  appointment_sent_back: (n) => `${n} missed appointments were sent back to find new times.`,
  appointment_booked: (n) => `${n} appointments were booked for you today or tomorrow.`,
  appointment_changed: (n) => `${n} of your appointments were moved or cancelled.`,
  appointment_handed_over: (n) => `You were given ${n} appointments.`,
}

/** One notification per person and kind. Several items list each one, or count them past three. */
function group(items: Item[]): Notice[] {
  const byKey = new Map<string, Item[]>()
  for (const i of items) {
    const key = `${i.to}|${i.kind}`
    byKey.set(key, [...(byKey.get(key) ?? []), i])
  }
  return [...byKey.values()].map((list) => {
    const { to, kind } = list[0]
    const texts = [...new Set(list.map((i) => i.text))]
    // Short-handed Sundays are titled by the worst of them.
    const titled = list.find((i) => i.title === SHORT_TITLES.none) ?? list.find((i) => i.title)
    const [one, many] = titled?.title ?? TITLES[kind] ?? ['Ward Desk', 'Ward Desk']
    const body = texts.length <= 3 || !MANY[kind] ? texts.join('\n') : MANY[kind]!(texts.length)
    return { to, kind, message: { title: texts.length === 1 ? one : many, body, url: kind === 'short_sunday' ? '/away' : '/home', tag: tagFor(`${kind.replace('appointment_', 'appt-')}-${list[0].rowId}`) } }
  })
}

// ---------------------------------------------------------------------------
// The scheduled ones: requests due tomorrow, callings to record, calling request progress
// ---------------------------------------------------------------------------

/** Requests due tomorrow go out from late morning, like the secretaries' reminders. */
export const DUE_FROM_HOUR = 10
export const DUE_UNTIL_HOUR = 20

/** The clerk hears about the day's sustainings and releases once sacrament meeting is over. */
export const RECORD_FROM_HOUR = 13
export const RECORD_UNTIL_HOUR = 21

/** Progress notices wait for daytime, since a request can finish at midnight. */
export const PROGRESS_FROM_HOUR = 8
export const PROGRESS_UNTIL_HOUR = 21

export function requestsDueMessage(date: IsoDate, count: number): PushMessage {
  return {
    title: count === 1 ? 'Request due tomorrow' : 'Requests due tomorrow',
    body: `${plural(count, 'request')} you were asked to do ${count === 1 ? 'is' : 'are'} due tomorrow.`,
    url: '/requests',
    tag: `due-${date}`,
  }
}

/** For the ward clerk, so the church's records can be updated. Says how many, never who. */
export function toRecordMessage(date: IsoDate, sustained: number, released: number): PushMessage {
  const parts = [sustained && `${plural(sustained, 'calling')} sustained`, released && `${plural(released, 'release')}`].filter(Boolean)
  return {
    title: 'Callings to record',
    body: `Today: ${parts.join(' and ')}. You can update the church’s records.`,
    url: '/sacrament',
    tag: `record-${date}`,
  }
}

export type RequestStage = 'in_progress' | 'finished'

export function progressMessage(requestId: string, stage: RequestStage): PushMessage {
  return stage === 'in_progress'
    ? { title: 'Calling request update', body: 'The bishopric has started on your calling request.', url: '/requests', tag: tagFor(`progress-${requestId}`) }
    : { title: 'Calling request finished', body: 'Your calling request is finished. Open Ward Desk to see it.', url: '/requests', tag: tagFor(`progress-${requestId}`) }
}
