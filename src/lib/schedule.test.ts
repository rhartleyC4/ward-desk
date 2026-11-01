import { describe, expect, it } from 'vitest'
import { awayOn, eventsOn, formatTime, isAway, rotationsDue, type Absence, type RecurringEvent, type Rotation } from './schedule'

const events: RecurringEvent[] = [
  { title: 'Welfare', weekday: 0, week_of_month: 1, start_time: '09:15:00' },
  { title: 'Bishopric meeting', weekday: 0, week_of_month: null, start_time: '08:30:00' },
  { title: 'Ward Council', weekday: 0, week_of_month: 2, start_time: '09:15:00' },
  { title: 'Missed PPIs', weekday: 0, week_of_month: 5, start_time: '09:15:00' },
  { title: 'Youth activities', weekday: 2, week_of_month: null, start_time: null },
]

describe('eventsOn', () => {
  it('includes weekly events and the matching nth-Sunday event, earliest first', () => {
    expect(eventsOn('2026-11-01', events).map((e) => e.title)).toEqual(['Bishopric meeting', 'Welfare'])
    expect(eventsOn('2026-11-08', events).map((e) => e.title)).toEqual(['Bishopric meeting', 'Ward Council'])
  })

  it('only shows fifth-Sunday events on a fifth Sunday', () => {
    expect(eventsOn('2026-11-29', events).map((e) => e.title)).toEqual(['Bishopric meeting', 'Missed PPIs'])
    expect(eventsOn('2026-11-22', events).map((e) => e.title)).toEqual(['Bishopric meeting'])
  })

  it('matches weekday events on other days', () => {
    expect(eventsOn('2026-11-03', events).map((e) => e.title)).toEqual(['Youth activities'])
  })
})

describe('rotationsDue', () => {
  const rotations: Rotation[] = [
    { title: 'PPI: EQ President', months: [2, 6, 10], assignee_id: null, assignee_label: 'EQ President' },
    { title: 'PPI: YW President', months: [3, 7, 11], assignee_id: null, assignee_label: 'YW President' },
    { title: 'Primary message', months: [2, 5, 8, 11], assignee_id: 'u2', assignee_label: null },
  ]

  it('returns rotations scheduled for the month', () => {
    expect(rotationsDue('2026-11-15', rotations).map((r) => r.title)).toEqual(['PPI: YW President', 'Primary message'])
    expect(rotationsDue('2026-01-04', rotations)).toEqual([])
  })
})

describe('away dates', () => {
  const absences: Absence[] = [
    { user_id: 'u2', starts_on: '2026-11-20', ends_on: '2026-11-23', location: 'Denver' },
    { user_id: 'u1', starts_on: '2026-12-24', ends_on: '2026-12-28', location: null },
  ]

  it('finds who is away on a date, inclusive of both ends', () => {
    expect(awayOn('2026-11-20', absences)).toHaveLength(1)
    expect(awayOn('2026-11-23', absences)).toHaveLength(1)
    expect(awayOn('2026-11-24', absences)).toHaveLength(0)
  })

  it('flags a specific person, such as whoever is conducting', () => {
    expect(isAway('u2', '2026-11-22', absences)?.location).toBe('Denver')
    expect(isAway('u1', '2026-11-22', absences)).toBeUndefined()
    expect(isAway(null, '2026-11-22', absences)).toBeUndefined()
  })
})

describe('formatTime', () => {
  it('drops leading zeros and seconds', () => {
    expect(formatTime('08:30:00')).toBe('8:30')
    expect(formatTime('12:40:00')).toBe('12:40')
    expect(formatTime(null)).toBe('')
  })
})
