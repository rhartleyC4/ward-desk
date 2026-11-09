// The Access page's list of who can sign in: what each row says, its order, and the search.

import { officeLabel } from './leadership'
import type { Account, Invite } from './queries'

/** The name someone chose once they've signed in, else what an admin typed for them, else their email. */
export const personName = (invite: Invite, account?: Account) =>
  account?.display_name || [invite.first_name, invite.last_name].filter(Boolean).join(' ') || invite.email

/** One short line for what someone can do, naming their position or organization over the bare role. */
export function accessSummary(invite: Invite) {
  const roles = invite.initial_roles
  const parts = [
    roles.includes('bishopric') && (officeLabel(invite.initial_office) || 'Bishopric'),
    roles.includes('leader') && (invite.initial_organization ? `${invite.initial_organization} leader` : 'Ward leader'),
    roles.includes('admin') && 'Admin',
  ].filter(Boolean)
  return parts.join(' · ') || 'No roles'
}

export type AccessPerson = { invite: Invite; account?: Account; signedIn: boolean; name: string; summary: string }

/** Everyone on the list, by name, each with their account if they have one. notSignedIn holds accounts made ahead of a first sign-in. */
export function accessPeople(invites: Invite[], accounts: Account[], notSignedIn: string[] = []): AccessPerson[] {
  return invites
    .map((invite) => {
      const account = accounts.find((a) => a.id === invite.profile_id)
      return { invite, account, signedIn: !!account && !notSignedIn.includes(account.id), name: personName(invite, account), summary: accessSummary(invite) }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Every word typed has to appear in their name, email, roles, position or organization. */
export function findPeople(people: AccessPerson[], find: string) {
  const words = find.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return people.filter(({ invite, name, summary }) => {
    const roleWords = [invite.initial_roles.includes('bishopric') && 'bishopric', invite.initial_roles.includes('leader') && 'ward leader']
    const text = [name, invite.email, summary, ...roleWords].join(' ').toLowerCase()
    return words.every((word) => text.includes(word))
  })
}
