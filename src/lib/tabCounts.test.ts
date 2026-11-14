import { describe, expect, it } from 'vitest'
import type { Tables } from './database.types'
import { leaderHomeCount, meetingsCount, sacramentCount, secretaryHomeCount, totalCount } from './tabCounts'

type Interview = Tables<'interviews'>
const appt = (id: string, extra: Partial<Interview> = {}) =>
  ({
    id,
    interviewer_id: 'bishop',
    scheduled_at: null,
    duration_minutes: 10,
    status: 'scheduled',
    confirmed_at: null,
    reminded_at: null,
    person_name: 'Brother Test',
    purpose: 'other',
    candidate_id: null,
    created_at: '2026-11-01T12:00:00Z',
    ...extra,
  }) as Interview

// Friday, November 6th 2026, noon in Denver.
const now = new Date('2026-11-06T12:00:00-07:00')

describe('leaderHomeCount', () => {
  it('counts my appointments that are over and not reported', () => {
    const list = [
      appt('over', { scheduled_at: '2026-11-05T17:00:00Z' }),
      appt('upcoming', { scheduled_at: '2026-11-08T17:00:00Z' }),
      appt('reported', { scheduled_at: '2026-11-05T17:00:00Z', status: 'completed' }),
      appt('someone else', { scheduled_at: '2026-11-05T17:00:00Z', interviewer_id: 'first' }),
    ]
    expect(leaderHomeCount('bishop', list, now)).toBe(1)
  })
})

describe('secretaryHomeCount', () => {
  const bishopric = [{ id: 'bishop' }, { id: 'first' }]
  const secretaries = [
    { id: 'me', office: 'executive_secretary' as const },
    { id: 'other', office: 'assistant_executive_secretary' as const },
  ]
  const appointments = [
    appt('needs a time'),
    appt('booked', { scheduled_at: '2026-11-08T17:00:00Z' }),
    appt('for first', { interviewer_id: 'first' }),
  ]

  it('counts names to book for my leaders, not booked times', () => {
    const assignments = [
      { leader_id: 'bishop', secretary_id: 'me' },
      { leader_id: 'first', secretary_id: 'other' },
    ]
    expect(secretaryHomeCount('me', { appointments, assignments, bishopric, secretaries })).toBe(1)
  })

  it('counts every leader when no one has been assigned to me', () => {
    const assignments = [
      { leader_id: 'bishop', secretary_id: 'other' },
      { leader_id: 'first', secretary_id: 'other' },
    ]
    expect(secretaryHomeCount('me', { appointments, assignments, bishopric, secretaries })).toBe(2)
  })
})

describe('meetingsCount', () => {
  it('counts unsorted suggestions, leaving out ones whose request is still unreceived', () => {
    const candidates = [
      { need_id: null, status: 'suggested' as const, request_id: null },
      { need_id: null, status: 'suggested' as const, request_id: 'received' },
      { need_id: null, status: 'suggested' as const, request_id: 'waiting' },
      { need_id: 'need', status: 'suggested' as const, request_id: null },
      { need_id: null, status: 'discussing' as const, request_id: null },
    ]
    expect(meetingsCount(candidates, ['waiting'])).toBe(2)
  })
})

describe('sacramentCount', () => {
  const sunday = '2026-11-08'
  const meeting = (extra: Partial<Tables<'meetings'>> = {}) => ({ meeting_date: sunday, meeting_type: 'regular' as const, conducting_id: 'first', ...extra })
  const away = (user_id: string) => ({ id: 'a', user_id, starts_on: '2026-11-07', ends_on: '2026-11-09', location: null, created_at: '' }) as Tables<'absences'>

  it('flags a Sunday that is not planned yet', () => {
    expect(sacramentCount(sunday, undefined, [])).toBe(1)
  })
  it('flags a Sunday with no one conducting', () => {
    expect(sacramentCount(sunday, meeting({ conducting_id: null }), [])).toBe(1)
  })
  it('flags a Sunday when the person conducting is away', () => {
    expect(sacramentCount(sunday, meeting(), [away('first')])).toBe(1)
    expect(sacramentCount(sunday, meeting(), [away('second')])).toBe(0)
  })
  it('leaves conferences alone', () => {
    expect(sacramentCount(sunday, meeting({ meeting_type: 'stake_conference', conducting_id: null }), [])).toBe(0)
  })
})

describe('totalCount', () => {
  it('adds up every tab', () => {
    expect(totalCount({ '/home': 2, '/requests': 1, '/sacrament': 0 })).toBe(3)
    expect(totalCount({})).toBe(0)
  })
})
