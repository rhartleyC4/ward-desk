import { describe, expect, it } from 'vitest'
import { COMMON_CALLINGS } from './callings'

describe('COMMON_CALLINGS', () => {
  it('lists each title once', () => {
    const titles = COMMON_CALLINGS.map((c) => c.title.toLowerCase())
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('keeps each group together so the picker shows one heading per group', () => {
    const groups = COMMON_CALLINGS.map((c) => c.group).filter((g, i, all) => g !== all[i - 1])
    expect(new Set(groups).size).toBe(groups.length)
  })
})
