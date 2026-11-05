import { describe, expect, it } from 'vitest'
import { initials } from './names'

describe('initials', () => {
  it('takes the first and last word', () => {
    expect(initials('Bishop Avery')).toBe('BA')
    expect(initials('Sister Mary Reyes')).toBe('SR')
    expect(initials('Quinn')).toBe('QU')
    expect(initials(null)).toBe('?')
  })
})
