import { describe, expect, it } from 'vitest'
import {
  awayOn,
  describePattern,
  eventsOn,
  followingMeeting,
  formatTime,
  isAway,
  meetsOn,
  nextMeeting,
  previousMeeting,
  myRotationsThisMonth,
  reminds,
  rotationDateIn,
  rotationDayLabel,
  rotationsDue,
  rotationsOn,
  type Absence,
  type MeetingPattern,
  type RecurringEvent,
  type Rotation,
} from './schedule'

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
  it('returns rotations scheduled for the month', () => {
    expect(rotationsDue('2026-11-15', rotations).map((r) => r.title)).toEqual(['PPI: YW President', 'Primary message', 'Fifth Sunday talk'])
    expect(rotationsDue('2026-01-04', rotations)).toEqual([])
  })
})

const anyDay = { weekday: null, week_of_month: null }
const rotations: Rotation[] = [
  { title: 'PPI: EQ President', months: [2, 6, 10], assignee_id: null, assignee_label: 'EQ President', ...anyDay },
  { title: 'PPI: YW President', months: [3, 7, 11], assignee_id: null, assignee_label: 'YW President', ...anyDay },
  { title: 'Primary message', months: [2, 5, 8, 11], assignee_id: 'u2', assignee_label: null, weekday: 0, week_of_month: 3 },
  { title: 'Fifth Sunday talk', months: [11, 12], assignee_id: 'u1', assignee_label: null, weekday: 0, week_of_month: 5 },
]

describe('rotations with a set day', () => {
  it('fall on that day in their months only', () => {
    expect(rotationsOn('2026-11-15', rotations).map((r) => r.title)).toEqual(['Primary message']) // 3rd Sunday
    expect(rotationsOn('2026-11-08', rotations)).toEqual([])
    expect(rotationsOn('2026-12-20', rotations)).toEqual([]) // 3rd Sunday, but not a Primary month
    expect(rotationsOn('2026-11-29', rotations).map((r) => r.title)).toEqual(['Fifth Sunday talk'])
  })

  it('finds the date in a month, or none when that day does not exist', () => {
    expect(rotationDateIn('2026-11-02', rotations[2])).toBe('2026-11-15')
    expect(rotationDateIn('2026-11-02', rotations[3])).toBe('2026-11-29')
    expect(rotationDateIn('2026-12-02', rotations[3])).toBeUndefined() // December 2026 has four Sundays
    expect(rotationDateIn('2026-12-02', rotations[2])).toBeUndefined() // not due
    expect(rotationDateIn('2026-11-02', rotations[0])).toBeUndefined() // no set day
  })

  it('label the day', () => {
    expect(rotationDayLabel(rotations[2])).toBe('3rd Sunday')
    expect(rotationDayLabel(rotations[0])).toBe('')
  })
})

describe('who a rotation reminds', () => {
  it('is its assignee, or the whole bishopric when it names someone outside the app', () => {
    expect(reminds(rotations[2], 'u2')).toBe(true)
    expect(reminds(rotations[2], 'u1')).toBe(false)
    expect(reminds(rotations[1], 'u1')).toBe(true)
  })

  it("lists a person's month: dated ones by date, then any-time ones", () => {
    expect(myRotationsThisMonth('u2', '2026-11-20', rotations)).toEqual([
      { rotation: rotations[2], date: '2026-11-15' },
      { rotation: rotations[1] },
    ])
    expect(myRotationsThisMonth('u1', '2026-11-20', rotations).map((r) => r.rotation.title)).toEqual(['Fifth Sunday talk', 'PPI: YW President'])
    expect(myRotationsThisMonth('u1', '2026-01-20', rotations)).toEqual([])
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

describe('meeting patterns', () => {
  const weekly: MeetingPattern = { weekday: 0, weeks_of_month: null }
  const council: MeetingPattern = { weekday: 0, weeks_of_month: [2, 4] }

  it('matches every Sunday or only the listed Sundays of the month', () => {
    expect(meetsOn(weekly, '2026-11-01')).toBe(true)
    expect(meetsOn(weekly, '2026-11-03')).toBe(false)
    expect(meetsOn(council, '2026-11-08')).toBe(true)
    expect(meetsOn(council, '2026-11-15')).toBe(false)
  })

  it('finds the next meeting on or after a date', () => {
    expect(nextMeeting(weekly, '2026-11-01')).toBe('2026-11-01')
    expect(nextMeeting(weekly, '2026-11-03')).toBe('2026-11-08')
    expect(nextMeeting(council, '2026-11-02')).toBe('2026-11-08')
    expect(nextMeeting(council, '2026-11-23')).toBe('2026-12-13')
  })

  it('steps to the meeting before and after, skipping off weeks', () => {
    expect(followingMeeting(weekly, '2026-11-01')).toBe('2026-11-08')
    expect(previousMeeting(weekly, '2026-11-01')).toBe('2026-10-25')
    expect(followingMeeting(council, '2026-11-08')).toBe('2026-11-22')
    expect(followingMeeting(council, '2026-11-22')).toBe('2026-12-13')
    expect(previousMeeting(council, '2026-12-13')).toBe('2026-11-22')
    expect(previousMeeting(council, '2026-11-08')).toBe('2026-10-25')
  })

  it('works for meetings on other weekdays', () => {
    const tuesday: MeetingPattern = { weekday: 2, weeks_of_month: [1] }
    expect(nextMeeting(tuesday, '2026-11-01')).toBe('2026-11-03')
    expect(followingMeeting(tuesday, '2026-11-03')).toBe('2026-12-01')
    expect(previousMeeting(tuesday, '2026-11-03')).toBe('2026-10-06')
  })
})

describe('describePattern', () => {
  it('reads like the schedule tab', () => {
    expect(describePattern({ weekday: 0, weeks_of_month: null })).toBe('Every Sunday')
    expect(describePattern({ weekday: 0, weeks_of_month: [] })).toBe('Every Sunday')
    expect(describePattern({ weekday: 0, weeks_of_month: [4, 2] })).toBe('2nd and 4th Sundays')
    expect(describePattern({ weekday: 2, weeks_of_month: [1, 3, 5] })).toBe('1st, 3rd and 5th Tuesdays')
    expect(describePattern({ weekday: 3, weeks_of_month: [1] })).toBe('1st Wednesday')
  })
})
