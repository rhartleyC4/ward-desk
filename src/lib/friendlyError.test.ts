import { describe, expect, it } from 'vitest'
import { friendlyError } from './friendlyError'

describe('friendlyError', () => {
  it('rewords errors the database and browser raise on their own', () => {
    expect(friendlyError('new row violates row-level security policy for table "calling_needs"')).toBe("You don't have permission to make that change.")
    expect(friendlyError('permission denied for function set_apart')).toBe("You don't have permission to make that change.")
    expect(friendlyError('TypeError: Failed to fetch')).toMatch(/Couldn't reach Ward Desk/)
    expect(friendlyError('Load failed')).toMatch(/Couldn't reach Ward Desk/)
    expect(friendlyError('JWT expired')).toMatch(/sign-in has run out/)
    expect(friendlyError('duplicate key value violates unique constraint "x"')).toBe("That's already there.")
    expect(friendlyError('insert or update on table "a" violates foreign key constraint "b"')).toMatch(/changed or removed/)
    expect(friendlyError('null value in column "x" violates not-null constraint')).toMatch(/missing/)
  })

  it("leaves the app's own messages as written", () => {
    expect(friendlyError('Someone is set apart after they are sustained')).toBe('Someone is set apart after they are sustained')
  })
})
