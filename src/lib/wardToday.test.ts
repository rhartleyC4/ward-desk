import { afterEach, describe, expect, it, vi } from 'vitest'
import { wardToday } from './wardToday'

vi.mock('./supabase', () => ({ WARD_TIME_ZONE: 'America/Denver' }))

afterEach(() => vi.useRealTimers())

describe('wardToday', () => {
  it("is the ward's date when the device is already on the next day", () => {
    // 8 PM on the 8th in Denver, the 9th in UTC and Tokyo.
    expect(wardToday(new Date('2026-11-09T03:00:00Z'))).toBe('2026-11-08')
  })

  it("is the ward's date when the device is still on the day before", () => {
    // 12:30 AM on the 9th in Denver, still the 8th in Honolulu.
    expect(wardToday(new Date('2026-11-09T07:30:00Z'))).toBe('2026-11-09')
  })

  it('reads the clock by default', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-09T03:00:00Z') })
    expect(wardToday()).toBe('2026-11-08')
  })
})
