import { afterAll, describe, expect, it } from 'vitest'
import { addInvite, loadAccess, loadBishopric, removeInvite, updateInvite } from '../../src/lib/queries'
import { signIn } from './helpers'

const EMAIL = `it-${Date.now()}@ward.test`

describe('sign-in access', () => {
  afterAll(async () => {
    const admin = await signIn('bishop')
    await admin.from('allowlist').delete().eq('email', EMAIL)
  })

  it('lets an admin add, change and remove an email', async () => {
    const admin = await signIn('bishop')
    await addInvite(admin, `  ${EMAIL.toUpperCase()} `, { initial_roles: ['leader'], initial_office: null })
    expect((await loadAccess(admin)).invites.find((i) => i.email === EMAIL)?.initial_roles).toEqual(['leader'])

    await updateInvite(admin, EMAIL, { initial_roles: ['bishopric'], initial_office: 'ward_clerk' })
    expect((await loadAccess(admin)).invites.find((i) => i.email === EMAIL)).toMatchObject({ initial_roles: ['bishopric'], initial_office: 'ward_clerk' })

    await removeInvite(admin, EMAIL)
    expect((await loadAccess(admin)).invites.map((i) => i.email)).not.toContain(EMAIL)
  })

  it('refuses an email that is already on the list', async () => {
    const admin = await signIn('bishop')
    await expect(addInvite(admin, 'first@ward.test', { initial_roles: [], initial_office: null })).rejects.toThrow(/duplicate key/)
  })

  it('hides the list from, and refuses additions by, the bishopric who are not admins', async () => {
    const lane = await signIn('first')
    expect((await loadAccess(lane)).invites).toEqual([])
    await expect(addInvite(lane, EMAIL, { initial_roles: ['admin'], initial_office: null })).rejects.toThrow(/row-level security/)
  })

  it('stops an admin from removing their own access', async () => {
    const admin = await signIn('bishop')
    await expect(removeInvite(admin, 'bishop@ward.test')).rejects.toThrow(/own admin access/)
    await expect(updateInvite(admin, 'bishop@ward.test', { initial_roles: ['bishopric'], initial_office: 'bishop' })).rejects.toThrow(/own admin access/)
  })

  it('moves someone in the Conducting picker when their position changes', async () => {
    const admin = await signIn('bishop')
    const position = async () => (await loadBishopric(admin)).map((p) => p.email)
    expect(await position()).toEqual(['bishop@ward.test', 'first@ward.test', 'second@ward.test'])

    await updateInvite(admin, 'first@ward.test', { initial_roles: ['bishopric'], initial_office: 'executive_secretary' })
    try {
      expect(await position()).toEqual(['bishop@ward.test', 'second@ward.test'])
    } finally {
      await updateInvite(admin, 'first@ward.test', { initial_roles: ['bishopric'], initial_office: 'first_counselor' })
    }
    expect(await position()).toEqual(['bishop@ward.test', 'first@ward.test', 'second@ward.test'])
  })
})
