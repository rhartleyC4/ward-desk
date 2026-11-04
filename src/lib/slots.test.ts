import { describe, expect, it } from 'vitest'
import type { DayChange, UsualHours } from './availability'
import { adjustMinutes, bookedRange, heldTimes, isHolding, minutesLabel, openSlots, overlapping, slotLabel, slotsByDay, wardParts, wardTimestamp, type Booked, type SlotInput } from './slots'

const TZ = 'America/Denver'
// 2026-11-08 is a Sunday; Denver is UTC-7 in November.
const hours: UsualHours[] = [
  { id: 'h1', user_id: 'b', weekday: 0, starts_at: '09:00:00', ends_at: '10:00:00' },
  { id: 'h2', user_id: 'b', weekday: 3, starts_at: '19:00:00', ends_at: '19:40:00' },
  { id: 'h3', user_id: 'l', weekday: 0, starts_at: '09:00:00', ends_at: '10:00:00' },
]

const input = (extra: Partial<SlotInput> = {}): SlotInput => ({
  leaderId: 'b',
  from: '2026-11-08',
  days: 7,
  hours,
  changes: [],
  absences: [],
  booked: [],
  now: new Date('2026-11-01T00:00:00Z'),
  timeZone: TZ,
  ...extra,
})

const times = (extra: Partial<SlotInput> = {}) => openSlots(input(extra)).map((s) => `${s.date} ${s.time}`)

describe('wardTimestamp and wardParts', () => {
  it('converts the ward\'s wall-clock time to a timestamp and back', () => {
    expect(wardTimestamp('2026-11-08', '09:15', TZ)).toBe('2026-11-08T16:15:00.000Z')
    expect(wardTimestamp('2026-07-12', '09:15:00', TZ)).toBe('2026-07-12T15:15:00.000Z')
    expect(wardParts('2026-11-08T16:15:00.000Z', TZ)).toEqual({ date: '2026-11-08', time: '09:15' })
  })

  it('stays right on the days the clocks change', () => {
    // Clocks fall back at 2 AM on 2026-11-01 and spring forward on 2026-03-08.
    expect(wardTimestamp('2026-11-01', '09:00', TZ)).toBe('2026-11-01T16:00:00.000Z')
    expect(wardTimestamp('2026-03-08', '09:00', TZ)).toBe('2026-03-08T15:00:00.000Z')
  })

  it('reads the date in the ward, not in UTC', () => {
    // 8:30 PM Wednesday in Denver is already Thursday in UTC.
    expect(wardParts('2026-11-12T03:30:00Z', TZ)).toEqual({ date: '2026-11-11', time: '20:30' })
  })
})

const booking = (id: string, at: string | null, minutes: number, extra: Partial<Booked> = {}): Booked => ({
  id, interviewer_id: 'b', scheduled_at: at, status: 'scheduled', duration_minutes: minutes, ...extra,
})

describe('openSlots', () => {
  it('fills each block with 10-minute appointments that fit', () => {
    expect(times()).toEqual([
      '2026-11-08 09:00', '2026-11-08 09:10', '2026-11-08 09:20', '2026-11-08 09:30', '2026-11-08 09:40', '2026-11-08 09:50',
      // 7:00–7:40 PM; 7:40 would run past the end.
      '2026-11-11 19:00', '2026-11-11 19:10', '2026-11-11 19:20', '2026-11-11 19:30',
    ])
  })

  it('gives each slot a timestamp and length ready to book', () => {
    expect(openSlots(input())[0]).toEqual({ leaderId: 'b', date: '2026-11-08', time: '09:00', at: '2026-11-08T16:00:00.000Z', minutes: 10 })
  })

  it('fits shorter or longer appointments', () => {
    expect(times({ minutes: 5 }).filter((t) => t.startsWith('2026-11-11'))).toHaveLength(8)
    expect(times({ minutes: 30 })).toEqual(['2026-11-08 09:00', '2026-11-08 09:30', '2026-11-11 19:00'])
    expect(times({ minutes: 45 })).toEqual(['2026-11-08 09:00'])
  })

  it('starts the next time right after a booked appointment ends, however long it runs', () => {
    // The bishop booked 9:10 for 25 minutes, so the next start is 9:35.
    expect(times({ booked: [booking('a1', '2026-11-08T16:10:00Z', 25)] }).filter((t) => t.startsWith('2026-11-08'))).toEqual([
      '2026-11-08 09:00', '2026-11-08 09:35', '2026-11-08 09:45',
    ])
  })

  it('works around a booking at an odd time', () => {
    // Wed 7:05 PM for 5 minutes: 7:00 would run into it, so the evening starts at 7:10.
    expect(times({ booked: [booking('a1', '2026-11-12T02:05:00Z', 5)] }).filter((t) => t.startsWith('2026-11-11'))).toEqual([
      '2026-11-11 19:10', '2026-11-11 19:20', '2026-11-11 19:30',
    ])
  })

  it('ignores other leaders, cancelled ones, ones without a time, and the one being moved', () => {
    const full = times()
    expect(times({ booked: [booking('a1', '2026-11-08T16:10:00Z', 25, { interviewer_id: 'l' })] })).toEqual(full)
    expect(times({ booked: [booking('a1', '2026-11-08T16:10:00Z', 25, { status: 'cancelled' })] })).toEqual(full)
    expect(times({ booked: [booking('a1', null, 25)] })).toEqual(full)
    expect(times({ booked: [booking('a1', '2026-11-08T16:10:00Z', 25)], ignoreId: 'a1' })).toEqual(full)
  })

  it('skips times already past', () => {
    // 9:12 AM Sunday in Denver.
    expect(times({ now: new Date('2026-11-08T16:12:00Z') }).slice(0, 2)).toEqual(['2026-11-08 09:20', '2026-11-08 09:30'])
  })

  it('follows changed days and away dates', () => {
    const changes: DayChange[] = [{ id: 'x1', user_id: 'b', on_date: '2026-11-11', starts_at: '18:00:00', ends_at: '18:30:00' }]
    expect(times({ changes })).toContain('2026-11-11 18:20')
    expect(times({ changes })).not.toContain('2026-11-11 19:00')
    expect(times({ absences: [{ user_id: 'b', starts_on: '2026-11-08', ends_on: '2026-11-08', location: null }] })[0]).toBe('2026-11-11 19:00')
  })
})

describe('appointment length', () => {
  it('moves in 5-minute steps within what the appointment allows', () => {
    expect(adjustMinutes(10, -1, 'calling')).toBe(5)
    expect(adjustMinutes(5, -1, 'calling')).toBe(5)
    expect(adjustMinutes(10, -1, 'temple_recommend')).toBe(10)
    expect(adjustMinutes(10, 2, 'ppi')).toBe(20)
    expect(adjustMinutes(115, 2, 'other')).toBe(120)
  })

  it('reads the length', () => {
    expect(minutesLabel(10)).toBe('10 min')
    expect(minutesLabel(60)).toBe('1 hr')
    expect(minutesLabel(75)).toBe('1 hr 15 min')
  })
})

describe('slotsByDay and slotLabel', () => {
  it('groups slots by date in order', () => {
    expect(slotsByDay(openSlots(input())).map((d) => [d.date, d.slots.length])).toEqual([['2026-11-08', 6], ['2026-11-11', 4]])
  })

  it('reads a slot the way a message offers it', () => {
    expect(slotLabel({ date: '2026-11-08', time: '09:15' })).toBe('Sun, November 8th at 9:15 AM')
    expect(slotLabel({ date: '2026-11-11', time: '19:00' })).toBe('Wed, November 11th at 7 PM')
  })
})

describe('booked appointments', () => {
  it('shows the time range in the ward', () => {
    expect(bookedRange('2026-11-08T16:00:00Z', 10, TZ)).toBe('9–9:10 AM')
    expect(bookedRange('2026-11-08T18:50:00Z', 20, TZ)).toBe('11:50 AM–12:10 PM')
  })

  it('flags bookings that run into each other with the same leader', () => {
    const booked = [
      booking('a1', '2026-11-08T16:00:00Z', 20), // 9:00–9:20
      booking('a2', '2026-11-08T16:15:00Z', 10), // 9:15–9:25, overlaps a1
      booking('a3', '2026-11-08T16:25:00Z', 10), // starts as a2 ends
      booking('a4', '2026-11-08T16:05:00Z', 10, { interviewer_id: 'l' }), // another leader
      booking('a5', '2026-11-08T16:05:00Z', 10, { status: 'cancelled' }),
    ]
    expect([...overlapping(booked)].sort()).toEqual(['a1', 'a2'])
  })
})

describe('held times', () => {
  const offered = (id: string, extra: object = {}) => ({
    ...booking(id, null, 10),
    offered_at: '2026-11-06T18:00:00Z',
    offered_times: ['2026-11-08T16:00:00Z', '2026-11-08T16:20:00Z'],
    ...extra,
  })
  const now = new Date('2026-11-07T12:00:00Z')

  it('keeps times offered to someone from being offered to anyone else', () => {
    const held = heldTimes([offered('w1')], now)
    expect(times({ booked: held, now }).filter((t) => t.startsWith('2026-11-08'))).toEqual([
      '2026-11-08 09:10', '2026-11-08 09:30', '2026-11-08 09:40', '2026-11-08 09:50',
    ])
    // The person they were offered to still sees them.
    expect(times({ booked: held, now, ignoreId: 'w1' })).toContain('2026-11-08 09:00')
  })

  it('lets the hold go after three days, once booked, or when released', () => {
    expect(isHolding(offered('w1'), now)).toBe(true)
    expect(isHolding(offered('w1'), new Date('2026-11-09T18:00:01Z'))).toBe(false)
    expect(heldTimes([offered('w1', { scheduled_at: '2026-11-08T16:00:00Z' })], now)).toEqual([])
    expect(heldTimes([offered('w1', { offered_at: null, offered_times: [] })], now)).toEqual([])
    expect(heldTimes([offered('w1', { status: 'cancelled' })], now)).toEqual([])
  })
})
