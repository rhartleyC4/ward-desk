import { describe, expect, it } from 'vitest'
import { blockLabel, dayFor, dayLabel, daysFor, keepsHours, overlaps, timeLabel, usualOn, type DayChange, type UsualHours } from './availability'
import type { Absence } from './schedule'

// 2026-11-08 is a Sunday; 2026-11-11 a Wednesday.
const hours: UsualHours[] = [
  { id: 'h2', user_id: 'b', weekday: 0, starts_at: '13:00:00', ends_at: '14:00:00' },
  { id: 'h1', user_id: 'b', weekday: 0, starts_at: '09:00:00', ends_at: '11:00:00' },
  { id: 'h3', user_id: 'b', weekday: 3, starts_at: '19:00:00', ends_at: '20:30:00' },
  { id: 'h4', user_id: 'c', weekday: 3, starts_at: '18:00:00', ends_at: '19:00:00' },
]
const none: DayChange[] = []
const noTrips: Absence[] = []

describe('usualOn', () => {
  it('lists one leader\'s hours on a weekday, earliest first', () => {
    expect(usualOn('b', 0, hours).map((h) => h.id)).toEqual(['h1', 'h2'])
    expect(usualOn('c', 0, hours)).toEqual([])
  })
})

describe('dayFor', () => {
  it('uses the usual hours for that weekday', () => {
    const day = dayFor('b', '2026-11-11', hours, none, noTrips)
    expect(day.kind).toBe('usual')
    expect(day.blocks).toEqual([{ starts_at: '19:00:00', ends_at: '20:30:00' }])
  })

  it('reports no hours on a weekday without any', () => {
    expect(dayFor('b', '2026-11-10', hours, none, noTrips)).toEqual({ date: '2026-11-10', kind: 'none', blocks: [] })
  })

  it('lets a change replace the usual hours for that date only', () => {
    const changes: DayChange[] = [
      { id: 'x2', user_id: 'b', on_date: '2026-11-11', starts_at: '20:00:00', ends_at: '21:00:00' },
      { id: 'x1', user_id: 'b', on_date: '2026-11-11', starts_at: '17:00:00', ends_at: '18:00:00' },
    ]
    const day = dayFor('b', '2026-11-11', hours, changes, noTrips)
    expect(day.kind).toBe('changed')
    expect(day.blocks.map((b) => b.starts_at)).toEqual(['17:00:00', '20:00:00'])
    expect(dayFor('b', '2026-11-18', hours, changes, noTrips).kind).toBe('usual')
    expect(dayFor('c', '2026-11-11', hours, changes, noTrips).blocks).toEqual([{ starts_at: '18:00:00', ends_at: '19:00:00' }])
  })

  it('takes the day out when marked not available, even with other changes', () => {
    const changes: DayChange[] = [
      { id: 'x1', user_id: 'b', on_date: '2026-11-11', starts_at: null, ends_at: null },
      { id: 'x2', user_id: 'b', on_date: '2026-11-11', starts_at: '17:00:00', ends_at: '18:00:00' },
    ]
    expect(dayFor('b', '2026-11-11', hours, changes, noTrips)).toEqual({ date: '2026-11-11', kind: 'off', blocks: [] })
  })

  it('lets an away date win over everything', () => {
    const trips: Absence[] = [{ user_id: 'b', starts_on: '2026-11-10', ends_on: '2026-11-12', location: 'Denver' }]
    const changes: DayChange[] = [{ id: 'x1', user_id: 'b', on_date: '2026-11-11', starts_at: '17:00:00', ends_at: '18:00:00' }]
    const day = dayFor('b', '2026-11-11', hours, changes, trips)
    expect(day.kind).toBe('away')
    expect(day.blocks).toEqual([])
    expect(dayLabel(day)).toBe('Away (Denver)')
    expect(dayFor('c', '2026-11-11', hours, changes, trips).kind).toBe('usual')
  })
})

describe('daysFor', () => {
  it('covers a run of days in order', () => {
    const days = daysFor('b', '2026-11-08', 7, hours, none, noTrips)
    expect(days.map((d) => d.date)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'])
    expect(days.map((d) => d.kind)).toEqual(['usual', 'none', 'none', 'usual', 'none', 'none', 'none'])
  })
})

describe('overlaps', () => {
  const blocks = [{ starts_at: '09:00:00', ends_at: '11:00:00' }]
  it('catches a block that runs into another', () => {
    expect(overlaps(blocks, { starts_at: '10:30', ends_at: '12:00' })).toBe(true)
    expect(overlaps(blocks, { starts_at: '08:00', ends_at: '09:30' })).toBe(true)
    expect(overlaps(blocks, { starts_at: '09:30', ends_at: '10:00' })).toBe(true)
  })
  it('allows blocks that only touch', () => {
    expect(overlaps(blocks, { starts_at: '11:00', ends_at: '12:00' })).toBe(false)
    expect(overlaps(blocks, { starts_at: '08:00', ends_at: '09:00' })).toBe(false)
  })
})

describe('labels', () => {
  it('reads times the way people say them', () => {
    expect(timeLabel('19:00:00')).toBe('7 PM')
    expect(timeLabel('08:30')).toBe('8:30 AM')
    expect(timeLabel('12:15:00')).toBe('12:15 PM')
    expect(timeLabel('00:00:00')).toBe('12 AM')
  })
  it('shares AM or PM when a block stays on one side of noon', () => {
    expect(blockLabel({ starts_at: '09:00:00', ends_at: '11:00:00' })).toBe('9–11 AM')
    expect(blockLabel({ starts_at: '19:00:00', ends_at: '20:30:00' })).toBe('7–8:30 PM')
    expect(blockLabel({ starts_at: '11:00:00', ends_at: '13:00:00' })).toBe('11 AM–1 PM')
  })
  it('describes a day', () => {
    expect(dayLabel({ date: '2026-11-08', kind: 'usual', blocks: [{ starts_at: '09:00', ends_at: '11:00' }, { starts_at: '13:00', ends_at: '14:00' }] })).toBe('9–11 AM, 1–2 PM')
    expect(dayLabel({ date: '2026-11-08', kind: 'off', blocks: [] })).toBe('Not available')
    expect(dayLabel({ date: '2026-11-08', kind: 'none', blocks: [] })).toBe('No hours')
  })
})

describe('keepsHours', () => {
  it('is the bishop and counselors only', () => {
    expect(keepsHours('bishop')).toBe(true)
    expect(keepsHours('second_counselor')).toBe(true)
    expect(keepsHours('executive_secretary')).toBe(false)
    expect(keepsHours(null)).toBe(false)
  })
})
