import { describe, expect, it } from 'vitest'
import { shortSundays, shortSundaysWith, sundaysBetween, worstLevel } from './coverage'
import type { Absence } from './schedule'

const leaders = ['bishop', 'first', 'second']
const away = (user_id: string, starts_on: string, ends_on = starts_on): Absence => ({ user_id, starts_on, ends_on, location: null })

// 2026-11-08 and 2026-11-15 are Sundays.
describe('sundaysBetween', () => {
  it('lists the Sundays in a range, ends included', () => {
    expect(sundaysBetween('2026-11-08', '2026-11-15')).toEqual(['2026-11-08', '2026-11-15'])
    expect(sundaysBetween('2026-11-09', '2026-11-14')).toEqual([])
    expect(sundaysBetween('2026-11-06', '2026-11-08')).toEqual(['2026-11-08'])
  })
})

describe('shortSundays', () => {
  it('flags a Sunday with no one there', () => {
    const absences = [away('bishop', '2026-11-07', '2026-11-09'), away('first', '2026-11-08'), away('second', '2026-11-01', '2026-11-30')]
    expect(shortSundays('2026-11-01', '2026-11-15', leaders, absences)).toEqual([{ date: '2026-11-08', level: 'none', awayIds: leaders }])
  })

  it('flags a Sunday with only one leader there, less urgently', () => {
    const absences = [away('bishop', '2026-11-08'), away('second', '2026-11-08')]
    expect(shortSundays('2026-11-08', '2026-11-08', leaders, absences)).toEqual([{ date: '2026-11-08', level: 'one', awayIds: ['bishop', 'second'] }])
  })

  it('ignores Sundays with two or more there, and people outside the bishopric', () => {
    expect(shortSundays('2026-11-08', '2026-11-08', leaders, [away('bishop', '2026-11-08'), away('clerk', '2026-11-08')])).toEqual([])
  })

  it('with one leader set up, only flags them being away', () => {
    expect(shortSundays('2026-11-08', '2026-11-15', ['bishop'], [away('bishop', '2026-11-08')])).toEqual([{ date: '2026-11-08', level: 'none', awayIds: ['bishop'] }])
    expect(shortSundays('2026-11-08', '2026-11-15', [], [away('bishop', '2026-11-08')])).toEqual([])
  })
})

describe('shortSundaysWith', () => {
  const absences = [away('first', '2026-11-08', '2026-11-15'), away('second', '2026-11-15')]

  it('counts the new dates with the ones already entered, over the new range only', () => {
    expect(shortSundaysWith(away('bishop', '2026-11-07', '2026-11-16'), leaders, absences)).toEqual([
      { date: '2026-11-08', level: 'one', awayIds: ['bishop', 'first'] },
      { date: '2026-11-15', level: 'none', awayIds: leaders },
    ])
  })

  it('says nothing for someone outside the bishopric or an unfinished range', () => {
    expect(shortSundaysWith(away('clerk', '2026-11-15'), leaders, absences)).toEqual([])
    expect(shortSundaysWith(away('bishop', ''), leaders, absences)).toEqual([])
    expect(shortSundaysWith(away('bishop', '2026-11-15', '2026-11-01'), leaders, absences)).toEqual([])
  })
})

describe('worstLevel', () => {
  it('puts no one there ahead of only one', () => {
    expect(worstLevel([])).toBeNull()
    expect(worstLevel([{ date: 'x', level: 'one', awayIds: [] }])).toBe('one')
    expect(worstLevel([{ date: 'x', level: 'one', awayIds: [] }, { date: 'y', level: 'none', awayIds: [] }])).toBe('none')
  })
})
