import { describe, expect, it } from 'vitest'
import { currentSeats, describeWork, doubleBooked, leavingPayload, leavingPeople, mentorDayAllowed, mentorEndsAt, organizationsOf, seatsPayload, type Person, type Seats } from './leadership'

const person = (id: string, office: Person['office']): Person => ({ id, display_name: id, email: `${id}@ward.test`, office, organization: null })
const people = [person('avery', 'bishop'), person('lane', 'first_counselor'), person('ortiz', 'second_counselor'), person('quinn', 'executive_secretary'), person('reyes', null)]

describe('currentSeats', () => {
  it('keeps each office with whoever holds it, and leaves the rest empty', () => {
    const seats = currentSeats(people)
    expect(seats.bishop).toEqual({ kind: 'person', id: 'avery' })
    expect(seats.ward_clerk).toEqual({ kind: 'empty' })
  })
})

describe('leavingPeople', () => {
  it('lists those holding no office after the change, but not someone moving to another', () => {
    const seats: Seats = { ...currentSeats(people), bishop: { kind: 'person', id: 'lane' }, first_counselor: { kind: 'person', id: 'reyes' } }
    expect(leavingPeople(people, seats).map((p) => p.id)).toEqual(['avery'])
  })
})

describe('doubleBooked', () => {
  it('catches one person in two offices, and the same new email twice', () => {
    expect(doubleBooked({ ...currentSeats(people), first_counselor: { kind: 'person', id: 'avery' } })).toBe(true)
    const twice: Seats = { ...currentSeats(people), ward_clerk: { kind: 'new', name: 'A', email: 'new@x.org' }, assistant_executive_secretary: { kind: 'new', name: 'B', email: ' NEW@x.org' } }
    expect(doubleBooked(twice)).toBe(true)
    expect(doubleBooked(currentSeats(people))).toBe(false)
  })
})

describe('payloads', () => {
  it('sends every office, by person, by email, or empty', () => {
    const seats: Seats = { ...currentSeats(people), ward_clerk: { kind: 'new', name: 'New', email: ' New@Ward.test ' } }
    expect(seatsPayload(seats)).toContainEqual({ office: 'bishop', person: 'avery' })
    expect(seatsPayload(seats)).toContainEqual({ office: 'ward_clerk', email: 'new@ward.test' })
    expect(seatsPayload(seats)).toContainEqual({ office: 'assistant_executive_secretary' })
  })
  it('sends an organization only for someone who stays a leader', () => {
    expect(leavingPayload({ a: { becomes: 'released', organization: 'Primary' }, b: { becomes: 'leader', organization: 'Primary' } })).toEqual([
      { person: 'a', becomes: 'released', organization: null },
      { person: 'b', becomes: 'leader', organization: 'Primary' },
    ])
  })
})

describe('mentoring dates', () => {
  it('ends at the end of the chosen day in the ward', () => {
    expect(mentorEndsAt('2026-12-04', 'America/Denver')).toBe('2026-12-05T07:00:00.000Z')
  })
  it('allows today up to 12 weeks', () => {
    expect(mentorDayAllowed('2026-11-08', '2026-11-08')).toBe(true)
    expect(mentorDayAllowed('2027-01-30', '2026-11-08')).toBe(true)
    expect(mentorDayAllowed('2027-01-31', '2026-11-08')).toBe(false)
    expect(mentorDayAllowed('2026-11-07', '2026-11-08')).toBe(false)
  })
})

describe('describeWork', () => {
  it('says what moves, skipping what does not', () => {
    expect(describeWork({ requests: 1, appointments: 3, calling_requests: 0, rotations: 0, stewardships: 2, secretary_links: 0, conducting: 1, reminders: 0, agendas: 0, has_hours: false })).toEqual([
      '1 open request',
      '3 appointments',
      '2 assignments',
      '1 Sunday to conduct',
    ])
    expect(describeWork(null)).toEqual([])
  })
})

describe('organizationsOf', () => {
  it('lists each organization once, without the bishopric', () => {
    expect(organizationsOf([{ organization: 'Primary' }, { organization: 'Bishopric' }, { organization: null }, { organization: 'Primary' }, { organization: 'Elders Quorum' }])).toEqual(['Elders Quorum', 'Primary'])
  })
})
