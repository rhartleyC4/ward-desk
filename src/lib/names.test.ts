import { describe, expect, it } from 'vitest'
import { cleanName, initials, NAME_MAX, nameProblem } from './names'

describe('initials', () => {
  it('takes the first and last word', () => {
    expect(initials('Bishop Avery')).toBe('BA')
    expect(initials('Sister Mary Reyes')).toBe('SR')
    expect(initials('Quinn')).toBe('QU')
    expect(initials(null)).toBe('?')
  })
})

describe('chosen names', () => {
  it('trims the name before saving', () => {
    expect(cleanName('  Sister Reyes ')).toBe('Sister Reyes')
  })

  it('needs 1 to 60 characters once trimmed', () => {
    expect(nameProblem('   ')).toBe('Enter your name.')
    expect(nameProblem('A')).toBeNull()
    expect(nameProblem(` ${'a'.repeat(NAME_MAX)} `)).toBeNull()
    expect(nameProblem('a'.repeat(NAME_MAX + 1))).toMatch(/60 characters/)
  })

  it('counts characters, not code units, like the database', () => {
    expect(nameProblem('é'.repeat(NAME_MAX))).toBeNull()
    expect(nameProblem('😀'.repeat(NAME_MAX))).toBeNull()
  })
})
