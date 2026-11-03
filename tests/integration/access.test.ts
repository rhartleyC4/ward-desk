import { afterAll, describe, expect, it } from 'vitest'
import { addInvite, loadAccess, removeInvite, setInviteRoles } from '../../src/lib/queries'
import { signIn } from './helpers'

const EMAIL = `it-${Date.now()}@ward.test`

describe('sign-in access', () => {
  afterAll(async () => {
    const admin = await signIn('bishop')
    await admin.from('allowlist').delete().eq('email', EMAIL)
  })

  it('lets an admin add, change and remove an email', async () => {
    const admin = await signIn('bishop')
    await addInvite(admin, `  ${EMAIL.toUpperCase()} `, ['leader'])
    expect((await loadAccess(admin)).invites.find((i) => i.email === EMAIL)?.initial_roles).toEqual(['leader'])

    await setInviteRoles(admin, EMAIL, ['bishopric'])
    expect((await loadAccess(admin)).invites.find((i) => i.email === EMAIL)?.initial_roles).toEqual(['bishopric'])

    await removeInvite(admin, EMAIL)
    expect((await loadAccess(admin)).invites.map((i) => i.email)).not.toContain(EMAIL)
  })

  it('refuses an email that is already on the list', async () => {
    const admin = await signIn('bishop')
    await expect(addInvite(admin, 'first@ward.test', [])).rejects.toThrow(/duplicate key/)
  })

  it('hides the list from, and refuses additions by, the bishopric who are not admins', async () => {
    const lane = await signIn('first')
    expect((await loadAccess(lane)).invites).toEqual([])
    await expect(addInvite(lane, EMAIL, ['admin'])).rejects.toThrow(/row-level security/)
  })

  it('stops an admin from removing their own access', async () => {
    const admin = await signIn('bishop')
    await expect(removeInvite(admin, 'bishop@ward.test')).rejects.toThrow(/own admin access/)
    await expect(setInviteRoles(admin, 'bishop@ward.test', ['bishopric'])).rejects.toThrow(/own admin access/)
  })
})
