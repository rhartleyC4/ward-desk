import { describe, expect, it } from 'vitest'
import { friendlyAuthError } from '../../src/lib/authErrors'
import { deletePasskey, listPasskeys, loadMe, updateMyName } from '../../src/lib/queries'
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
    expect(me.office).toBe('bishop')
    expect(me.hasHours).toBe(true)

    // Seed: the second counselor hasn't set his appointment hours, so he's asked to on sign-in.
    const second = await signIn('second')
    expect(await loadMe(second, second.userId)).toMatchObject({ office: 'second_counselor', hasHours: false })

    const assistant = await signIn('assistant')
    expect((await loadMe(assistant, assistant.userId)).office).toBe('assistant_executive_secretary')

    const leader = await signIn('leader')
    expect((await loadMe(leader, leader.userId)).roles).toEqual(['leader'])
  })

  it('lists the signed-in user\'s passkeys and refuses to remove one they don\'t have', async () => {
    const bishop = await signIn('bishop')
    // Only the signed-in user's own passkeys come back; trying one locally can leave some behind.
    expect(Array.isArray(await listPasskeys(bishop))).toBe(true)
    await expect(deletePasskey(bishop, '00000000-0000-0000-0000-000000000000')).rejects.toThrow()
  })

  it('lets people change their own name, trimmed and within 60 characters', async () => {
    const leader = await signIn('leader')
    try {
      expect(await updateMyName(leader, leader.userId, '  Sister Reyes-Lund ')).toBe('Sister Reyes-Lund')
      expect((await loadMe(leader, leader.userId)).profile?.display_name).toBe('Sister Reyes-Lund')
      await expect(updateMyName(leader, leader.userId, '   ')).rejects.toThrow(/1 to 60 characters/)
      await expect(updateMyName(leader, leader.userId, 'a'.repeat(61))).rejects.toThrow(/1 to 60 characters/)
    } finally {
      await updateMyName(leader, leader.userId, 'Sister Reyes')
    }
  })

  it('does not let anyone change their own email', async () => {
    const leader = await signIn('leader')
    const { error } = await leader.from('profiles').update({ email: 'someone@example.com' }).eq('id', leader.userId)
    expect(error?.message).toMatch(/permission denied/)
  })

  it('returns nothing to an anonymous visitor', async () => {
    const { data } = await anonClient().from('meetings').select('*')
    expect(data).toEqual([])
  })
})
