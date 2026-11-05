import { describe, expect, it } from 'vitest'
import { coveringLeader, groupCallings, organizationFor, sortCallings, tidyTitle, UNREVIEWED, type ListedCalling } from './callings'

const c = (title: string, organization: string | null): ListedCalling => ({ id: title, title, organization })

describe('groupCallings', () => {
  it('orders handbook organizations first, then others, then titles waiting for review', () => {
    const list = [c('YW Secretary', null), c('Ward Organist', 'Music'), c('Bishop', 'Bishopric'), c('Greeter', 'Hospitality'), c('Ward Clerk', 'Bishopric')]
    expect(groupCallings(list).map((g) => [g.group, g.callings.map((x) => x.title)])).toEqual([
      ['Bishopric', ['Bishop', 'Ward Clerk']],
      ['Music', ['Ward Organist']],
      ['Hospitality', ['Greeter']],
      [UNREVIEWED, ['YW Secretary']],
    ])
  })

  it('flattens in the same order for the picker', () => {
    expect(sortCallings([c('B', null), c('A', 'Primary')]).map((x) => x.title)).toEqual(['A', 'B'])
  })
})

describe('tidyTitle', () => {
  it('trims and collapses spaces', () => {
    expect(tidyTitle('  Ward   Greeter ')).toBe('Ward Greeter')
  })
})

describe('who meets with an approved name', () => {
  const list: ListedCalling[] = [
    { id: 'l1', title: 'Primary Teacher', organization: 'Primary' },
    { id: 'l2', title: 'Deacons Quorum Adviser', organization: 'Aaronic Priesthood' },
    { id: 'l3', title: 'Greeter', organization: null },
  ]
  const needs = [
    { id: 'n1', calling_id: 'l2', calling_title: 'Deacons Quorum Adviser' },
    { id: 'n2', calling_id: null, calling_title: 'primary teacher' },
  ]

  it("finds the calling's organization from its need or its title", () => {
    expect(organizationFor({ need_id: 'n1', calling_title: null }, needs, list)).toBe('Aaronic Priesthood')
    expect(organizationFor({ need_id: 'n2', calling_title: null }, needs, list)).toBe('Primary')
    expect(organizationFor({ need_id: null, calling_title: 'Primary Teacher ' }, needs, list)).toBe('Primary')
    expect(organizationFor({ need_id: null, calling_title: 'Greeter' }, needs, list)).toBeNull()
    expect(organizationFor({ need_id: null, calling_title: 'Something new' }, needs, list)).toBeNull()
  })

  it('is the one leader assigned to it, ignoring case', () => {
    const stewardships = [
      { user_id: 'o', area: 'primary' },
      { user_id: 'l', area: 'Aaronic Priesthood' },
      { user_id: 'o', area: 'Aaronic Priesthood' },
      { user_id: 'clerk', area: 'Music' },
    ]
    const leaders = ['b', 'l', 'o']
    expect(coveringLeader('Primary', stewardships, leaders)).toBe('o')
    expect(coveringLeader('Aaronic Priesthood', stewardships, leaders)).toBeNull() // shared, so the bishopric decides
    expect(coveringLeader('Music', stewardships, leaders)).toBeNull() // not a leader who holds interviews
    expect(coveringLeader('Young Women', stewardships, leaders)).toBeNull()
    expect(coveringLeader(null, stewardships, leaders)).toBeNull()
  })
})
