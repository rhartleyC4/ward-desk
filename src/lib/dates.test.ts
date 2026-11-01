import { describe, expect, it } from 'vitest'
import { addDays, isBetween, longDate, monthOf, shortDate, sundaysFrom, upcomingSunday, weekday, weekOfMonth } from './dates'

describe('dates', () => {
  it('finds the weekday without time-zone drift', () => {
    expect(weekday('2026-11-01')).toBe(0)
    expect(weekday('2026-11-03')).toBe(2)
  })

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-11-29', 7)).toBe('2026-12-06')
    expect(addDays('2026-12-27', 7)).toBe('2027-01-03')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('numbers Sundays within the month the way the schedule does', () => {
    expect(weekOfMonth('2026-11-01')).toBe(1)
    expect(weekOfMonth('2026-11-08')).toBe(2)
    expect(weekOfMonth('2026-11-15')).toBe(3)
    expect(weekOfMonth('2026-11-22')).toBe(4)
    expect(weekOfMonth('2026-11-29')).toBe(5)
    expect(weekOfMonth('2026-12-06')).toBe(1)
  })

  it('returns the same day when already Sunday, else the next Sunday', () => {
    expect(upcomingSunday('2026-11-01')).toBe('2026-11-01')
    expect(upcomingSunday('2026-11-02')).toBe('2026-11-08')
    expect(upcomingSunday('2026-11-07')).toBe('2026-11-08')
  })

  it('lists consecutive Sundays', () => {
    expect(sundaysFrom('2026-11-04', 3)).toEqual(['2026-11-08', '2026-11-15', '2026-11-22'])
  })

  it('formats dates like the sheet', () => {
    expect(shortDate('2026-11-08')).toBe('11/8')
    expect(longDate('2026-11-01')).toBe('November 1st')
    expect(longDate('2026-08-02')).toBe('August 2nd')
    expect(longDate('2026-08-23')).toBe('August 23rd')
    expect(longDate('2026-10-11')).toBe('October 11th')
    expect(longDate('2026-10-12')).toBe('October 12th')
    expect(longDate('2026-10-13')).toBe('October 13th')
    expect(longDate('2026-10-25')).toBe('October 25th')
  })

  it('reads the month and inclusive ranges', () => {
    expect(monthOf('2026-02-28')).toBe(2)
    expect(isBetween('2026-11-20', '2026-11-20', '2026-11-23')).toBe(true)
    expect(isBetween('2026-11-23', '2026-11-20', '2026-11-23')).toBe(true)
    expect(isBetween('2026-11-24', '2026-11-20', '2026-11-23')).toBe(false)
  })
})
