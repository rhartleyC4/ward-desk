import { afterAll, describe, expect, it } from 'vitest'
import { addInvite, deleteAccount, loadAccess, loadBishopric, removeInvite, updateInvite, updateInviteName } from '../../src/lib/queries'
import { anonClient, signIn } from './helpers'

const EMAIL = `it-${Date.now()}@ward.test`
const GONE = `it-gone-${Date.now()}@ward.test`

describe('sign-in access', () => {
  afterAll(async () => {
    const admin = await signIn('bishop')
    await admin.from('allowlist').delete().in('email', [EMAIL, GONE])
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

  it('keeps a tidy name for someone who has not signed in', async () => {
    const admin = await signIn('bishop')
    await addInvite(admin, EMAIL, { initial_roles: [], initial_office: null }, { first: ' Robin ', last: '' })
    expect((await loadAccess(admin)).invites.find((i) => i.email === EMAIL)).toMatchObject({ first_name: 'Robin', last_name: null })

    await updateInviteName(admin, EMAIL, { first: 'Robin', last: 'Vale' })
    expect((await loadAccess(admin)).invites.find((i) => i.email === EMAIL)).toMatchObject({ first_name: 'Robin', last_name: 'Vale' })

    await expect(updateInviteName(admin, EMAIL, { first: 'R'.repeat(40), last: 'V'.repeat(40) })).rejects.toThrow(/allowlist_name_length/)
    await removeInvite(admin, EMAIL)
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
  it('lets an admin delete someone else\'s account, which also takes the email off the list', async () => {
    const admin = await signIn('bishop')
    await addInvite(admin, GONE, { initial_roles: ['leader'], initial_office: null })
    const { data, error } = await anonClient().auth.signUp({ email: GONE, password: 'integration-only-1' })
    expect(error).toBeNull()
    const id = data.user!.id
    expect((await loadAccess(admin)).invites.find((i) => i.email === GONE)?.profile_id).toBe(id)

    await expect(deleteAccount(await signIn('first'), id)).rejects.toThrow(/Only an admin/)
    await expect(deleteAccount(admin, admin.userId)).rejects.toThrow(/your own account/)

    await deleteAccount(admin, id)
    const after = await loadAccess(admin)
    expect(after.accounts.map((a) => a.id)).not.toContain(id)
    expect(after.invites.map((i) => i.email)).not.toContain(GONE)
  })

  it('keeps an account taken off the list, marked as removed', async () => {
    const admin = await signIn('bishop')
    const { accounts } = await loadAccess(admin)
    const lane = accounts.find((a) => a.email === 'first@ward.test')!
    expect(lane.removed_at).toBeNull()
  })
})
