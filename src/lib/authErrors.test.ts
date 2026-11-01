import { describe, expect, it } from 'vitest'
import { friendlyAuthError } from './authErrors'

describe('friendlyAuthError', () => {
  it('explains a sign-in rejected by the allowlist', () => {
    expect(friendlyAuthError('Database error saving new user')).toMatch(/not been invited/)
  })

  it('passes other errors through', () => {
    expect(friendlyAuthError('Email rate limit exceeded')).toBe('Email rate limit exceeded')
  })
})
