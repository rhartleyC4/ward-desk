// What the bishop and counselors see when they open the app: their day, the week ahead, and the
// requests still waiting on a secretary. Pure functions so they can be unit tested.

import { openItems, type AgendaItem } from './agenda'
import { withDefaultSecretary, type SecretaryAssignment } from './appointments'
import { addDays, type IsoDate } from './dates'
import type { Enums, Tables } from './database.types'
import { meetsOn, nextMeeting, reminds, rotationsOn, type Rotation } from './schedule'
import { wardParts } from './slots'

export type HomeAppointment = Pick<Tables<'interviews'>, 'id' | 'interviewer_id' | 'scheduled_at' | 'person_name' | 'purpose' | 'duration_minutes' | 'is_youth' | 'status' | 'created_at'>
export type HomeSection = Pick<Tables<'agenda_sections'>, 'id' | 'kind' | 'title' | 'position'>
export type HomeTemplate = Pick<Tables<'agenda_templates'>, 'id' | 'slug' | 'name' | 'weekday' | 'weeks_of_month' | 'start_time'> & { sections: HomeSection[] }
export type HomeSacrament = Pick<Tables<'meetings'>, 'meeting_date' | 'meeting_type' | 'title' | 'conducting_id'>

/** How many days "Coming up" covers after today. */
export const WEEK_AHEAD = 6

export type DayPlan<A extends HomeAppointment, T extends HomeTemplate> = {
  date: IsoDate
  /** This leader's booked appointments, earliest first, with their ward start time ("HH:MM"). */
  appointments: (A & { time: string })[]
  /** Meetings this leader can open that fall on the day, earliest first, with their open item count. */
  meetings: { template: T; openItems: number }[]
  /** Sacrament meeting, when one is planned for the day. */
  sacrament: (HomeSacrament & { conducting: boolean }) | null
  /** Rotations with a set day that fall on this one and remind this leader (their Primary message). */
  rotations: Rotation[]
}

type PlanInput<A extends HomeAppointment, T extends HomeTemplate> = {
  userId: string
  from: IsoDate
  days: number
  appointments: A[]
  /** The meetings this leader can open. */
  templates: T[]
  agendaItems: AgendaItem[]
  sacrament: HomeSacrament[]
  rotations: Rotation[]
  timeZone: string
}

/** Agenda sections someone can add a line to from the home screen. */
export const writableSections = <S extends Pick<HomeSection, 'kind' | 'position'>>(template: { sections: S[] }): S[] =>
  template.sections.filter((s) => s.kind === 'items' || s.kind === 'calendar').sort((a, b) => a.position - b.position)

/** Items still open for a meeting on this date, across its sections. */
export function openItemCount(template: HomeTemplate, date: IsoDate, items: AgendaItem[], timeZone: string): number {
  return writableSections(template).reduce((n, s) => n + openItems(date, items, s, timeZone).length, 0)
}

/**
 * One entry per day from `from`, for `days` days, with this leader's appointments, their meetings
 * and sacrament meeting. Days with nothing on them are still returned, so "Today" can say so.
 */
export function planDays<A extends HomeAppointment, T extends HomeTemplate>({ userId, from, days, appointments, templates, agendaItems, sacrament, rotations, timeZone }: PlanInput<A, T>): DayPlan<A, T>[] {
  const mine = rotations.filter((r) => reminds(r, userId))
  const booked = appointments
    .filter((a) => a.status === 'scheduled' && a.interviewer_id === userId && a.scheduled_at)
    .sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!))
    .map((a) => {
      const { date, time } = wardParts(a.scheduled_at!, timeZone)
      return { date, appointment: { ...a, time } }
    })

  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i)
    const sunday = sacrament.find((m) => m.meeting_date === date)
    return {
      date,
      appointments: booked.filter((b) => b.date === date).map((b) => b.appointment),
      meetings: templates
        .filter((t) => meetsOn(t, date))
        .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'))
        .map((template) => ({ template, openItems: openItemCount(template, date, agendaItems, timeZone) })),
      sacrament: sunday ? { ...sunday, conducting: sunday.conducting_id === userId } : null,
      rotations: rotationsOn(date, mine),
    }
  })
}

export const isEmptyDay = (day: DayPlan<HomeAppointment, HomeTemplate>) => !day.appointments.length && !day.meetings.length && !day.sacrament && !day.rotations.length

/** This leader's requests that have no time yet, oldest first: the secretary still has to book them. */
export function waitingForTime<A extends HomeAppointment>(userId: string, appointments: A[]): A[] {
  return appointments
    .filter((a) => a.status === 'scheduled' && a.interviewer_id === userId && !a.scheduled_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

/**
 * The meetings someone can add to, soonest first, each with the date the item will first show.
 * Meetings without a section to write in are left out.
 */
export function meetingChoices<T extends HomeTemplate>(templates: T[], today: IsoDate): { template: T; date: IsoDate }[] {
  return templates
    .filter((t) => writableSections(t).length > 0)
    .map((template) => ({ template, date: nextMeeting(template, today) }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.template.start_time ?? '99').localeCompare(b.template.start_time ?? '99'))
}

/** The secretaries who will book an appointment with this leader, for the "sent to" note. */
export function schedulersFor<S extends { id: string; office: Enums<'bishopric_office'> | null }>(leaderId: string, assignments: SecretaryAssignment[], secretaries: S[]): S[] {
  const ids = withDefaultSecretary(assignments, [leaderId], secretaries)
    .filter((a) => a.leader_id === leaderId)
    .map((a) => a.secretary_id)
  return secretaries.filter((s) => ids.includes(s.id))
}
