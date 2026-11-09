import { describe, expect, it } from 'vitest'
import { accessPeople, accessSummary, findPeople, personName } from './accessList'
import type { Account, Invite } from './queries'

const invite = (email: string, more: Partial<Invite> = {}) =>
  ({ email, first_name: null, last_name: null, initial_roles: [], initial_office: null, initial_organization: null, created_at: '', profile_id: null, ...more }) as Invite
const account = (id: string, display_name: string | null) => ({ id, email: `${id}@ward.test`, display_name, removed_at: null }) as Account

describe('personName', () => {
  it('prefers the name they chose over the one an admin typed', () => {
    expect(personName(invite('a@ward.test', { first_name: 'Robin', last_name: 'Vale' }), account('a', 'Rob Vale'))).toBe('Rob Vale')
  })

  it('uses the typed name, even a partial one, before they sign in', () => {
    expect(personName(invite('a@ward.test', { first_name: 'Robin', last_name: 'Vale' }))).toBe('Robin Vale')
    expect(personName(invite('a@ward.test', { last_name: 'Vale' }))).toBe('Vale')
  })

  it('falls back to the email', () => {
    expect(personName(invite('a@ward.test'), account('a', null))).toBe('a@ward.test')
  })
})

describe('accessSummary', () => {
  it('names the position and organization rather than the bare role', () => {
    expect(accessSummary(invite('a', { initial_roles: ['bishopric', 'leader', 'admin'], initial_office: 'ward_clerk', initial_organization: 'Primary' }))).toBe('Ward Clerk · Primary leader · Admin')
  })

  it('uses the role when there is no position or organization', () => {
    expect(accessSummary(invite('a', { initial_roles: ['bishopric', 'leader'] }))).toBe('Bishopric · Ward leader')
  })

  it('says so when someone has no roles', () => {
    expect(accessSummary(invite('a'))).toBe('No roles')
  })
})

describe('accessPeople', () => {
  it('sorts by name and links each account', () => {
    const people = accessPeople([invite('z@ward.test', { first_name: 'Avery' }), invite('a@ward.test', { first_name: 'Quinn', profile_id: 'q' })], [account('q', null)])
    expect(people.map((p) => p.name)).toEqual(['Avery', 'Quinn'])
    expect(people[1].account?.id).toBe('q')
  })

  it('counts someone as signed in only with an account that has been used', () => {
    const invites = [invite('a@ward.test', { profile_id: 'a' }), invite('b@ward.test', { profile_id: 'b' }), invite('c@ward.test')]
    const people = accessPeople(invites, [account('a', null), account('b', null)], ['b'])
    expect(people.map((p) => p.signedIn)).toEqual([true, false, false])
  })
})

describe('findPeople', () => {
  const people = accessPeople(
    [
      invite('rv@ward.test', { first_name: 'Robin', last_name: 'Vale', initial_roles: ['bishopric'], initial_office: 'ward_clerk' }),
      invite('sam@ward.test', { first_name: 'Sam', last_name: 'Hale', initial_roles: ['leader'], initial_organization: 'Primary' }),
    ],
    [],
  )
  const found = (text: string) => findPeople(people, text).map((p) => p.name)

  it('keeps everyone when nothing is typed', () => {
    expect(found('  ')).toEqual(['Robin Vale', 'Sam Hale'])
  })

  it('matches name or email, in any case', () => {
    expect(found('VALE')).toEqual(['Robin Vale'])
    expect(found('sam@')).toEqual(['Sam Hale'])
  })

  it('matches a position, an organization or a role whose position is showing instead', () => {
    expect(found('clerk')).toEqual(['Robin Vale'])
    expect(found('primary')).toEqual(['Sam Hale'])
    expect(found('bishopric')).toEqual(['Robin Vale'])
    expect(found('ward leader')).toEqual(['Sam Hale'])
  })

  it('needs every word, in any order', () => {
    expect(found('vale robin')).toEqual(['Robin Vale'])
    expect(found('robin hale')).toEqual([])
  })
})
