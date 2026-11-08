// Leadership changes: a new bishopric (run_handover) and a new organization leader
// (change_leader). The database moves the open work; this decides what to send it and how to
// describe it on the check-and-confirm step.

import { addDays, type IsoDate } from './dates'
import type { Enums } from './database.types'
import { wardTimestamp } from './slots'

export type Office = Enums<'bishopric_office'>

export const OFFICES: { office: Office; label: string }[] = [
  { office: 'bishop', label: 'Bishop' },
  { office: 'first_counselor', label: 'First Counselor' },
  { office: 'second_counselor', label: 'Second Counselor' },
  { office: 'executive_secretary', label: 'Executive Secretary' },
  { office: 'assistant_executive_secretary', label: 'Assistant Executive Secretary' },
  { office: 'ward_clerk', label: 'Ward Clerk' },
]

export const officeLabel = (office: Office | null) => OFFICES.find((o) => o.office === office)?.label ?? ''

export type Person = { id: string; display_name: string | null; email: string; office: Office | null; organization: string | null }

/** Who takes an office: someone with an account, someone new (by email), or nobody. */
export type Pick = { kind: 'person'; id: string } | { kind: 'new'; email: string } | { kind: 'empty' }

export type Seats = Record<Office, Pick>

/** What happens to someone leaving the bishopric. */
export type Leaving = { becomes: 'released' | 'leader'; organization: string }

/** Every office kept by whoever holds it now; empty where nobody does. */
export function currentSeats(people: Person[]): Seats {
  return Object.fromEntries(
    OFFICES.map(({ office }) => {
      const holder = people.find((p) => p.office === office)
      return [office, holder ? { kind: 'person', id: holder.id } : { kind: 'empty' }]
    }),
  ) as Seats
}

export const holderOf = (people: Person[], office: Office) => people.find((p) => p.office === office) ?? null

/** The current bishopric members who hold no office after the change. */
export function leavingPeople(people: Person[], seats: Seats): Person[] {
  const staying = new Set(Object.values(seats).flatMap((s) => (s.kind === 'person' ? [s.id] : [])))
  return OFFICES.map(({ office }) => holderOf(people, office)).filter((p): p is Person => !!p && !staying.has(p.id))
}

/** Someone picked for two offices, or the same new email twice. */
export function doubleBooked(seats: Seats): boolean {
  const keys = Object.values(seats).flatMap((s) => (s.kind === 'person' ? [s.id] : s.kind === 'new' ? [s.email.trim().toLowerCase()] : []))
  return new Set(keys).size !== keys.length
}

/** A pick is ready to send: a person, nobody, or a new email that looks like one. */
export const pickReady = (p: Pick) => p.kind !== 'new' || validEmail(p.email)

export const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

/** The seats as run_handover takes them. */
export function seatsPayload(seats: Seats) {
  return OFFICES.map(({ office }) => {
    const s = seats[office]
    return s.kind === 'person' ? { office, person: s.id } : s.kind === 'new' ? { office, email: s.email.trim().toLowerCase() } : { office }
  })
}

export function leavingPayload(leaving: Record<string, Leaving>) {
  return Object.entries(leaving).map(([person, l]) => ({ person, becomes: l.becomes, organization: l.becomes === 'leader' ? l.organization || null : null }))
}

export const MENTOR_DEFAULT_DAYS = 28
export const MENTOR_MAX_DAYS = 83 // the last day that ends within 12 weeks

/** Mentoring ends at the end of the chosen day, in the ward's time zone. */
export const mentorEndsAt = (lastDay: IsoDate, timeZone: string) => wardTimestamp(addDays(lastDay, 1), '00:00', timeZone)

export const mentorDayAllowed = (day: IsoDate, today: IsoDate, startedOn: IsoDate = today) => day >= today && day <= addDays(startedOn, MENTOR_MAX_DAYS)

export type Work = {
  requests: number
  appointments: number
  calling_requests: number
  rotations: number
  stewardships: number
  secretary_links: number
  conducting: number
  reminders: number
  agendas: number
  has_hours: boolean
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "4 open requests, 3 appointments, 2 rotations": what moves, in words. Empty when nothing does. */
export function describeWork(w: Work | null | undefined): string[] {
  if (!w) return []
  const parts = [
    w.requests && plural(w.requests, 'open request'),
    w.appointments && plural(w.appointments, 'appointment'),
    w.calling_requests && plural(w.calling_requests, 'calling request'),
    w.rotations && plural(w.rotations, 'rotation'),
    w.stewardships && plural(w.stewardships, 'assignment'),
    w.secretary_links && plural(w.secretary_links, 'scheduling link'),
    w.conducting && plural(w.conducting, 'Sunday to conduct', 'Sundays to conduct'),
    w.reminders && plural(w.reminders, 'meeting to remind people about', 'meetings to remind people about'),
    w.agendas && plural(w.agendas, 'meeting to attend', 'meetings to attend'),
    w.has_hours && 'usual appointment hours, if they have none',
  ]
  return parts.filter((p): p is string => !!p)
}

/** The distinct organizations on the calling list, for the leader pickers. */
export function organizationsOf(callings: { organization: string | null }[]): string[] {
  return [...new Set(callings.map((c) => c.organization).filter((o): o is string => !!o && o !== 'Bishopric'))].sort()
}
