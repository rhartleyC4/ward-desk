import { describe, expect, it } from 'vitest'
import { friendlyAuthError } from '../../src/lib/authErrors'
import { loadMe } from '../../src/lib/queries'
import { anonClient, signIn } from './helpers'

describe('sign-in', () => {
  it('rejects an email that is not on the allowlist', async () => {
    const { error } = await anonClient().auth.signInWithOtp({ email: `stranger-${Date.now()}@example.com` })
    expect(error).not.toBeNull()
    expect(friendlyAuthError(error!.message)).toMatch(/not been invited/)
  })

  it('loads the signed-in profile and roles', async () => {
    const bishop = await signIn('bishop')
    const me = await loadMe(bishop, bishop.userId)
    expect(me.profile?.display_name).toBe('Bishop Avery')
    expect(me.roles.sort()).toEqual(['admin', 'bishopric'])

    const leader = await signIn('leader')
    expect((await loadMe(leader, leader.userId)).roles).toEqual(['leader'])
  })

  it('returns nothing to an anonymous visitor', async () => {
    const { data } = await anonClient().from('meetings').select('*')
    expect(data).toEqual([])
  })
})
