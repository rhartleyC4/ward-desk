import { describe, expect, it } from 'vitest'
import { groupCallings, sortCallings, tidyTitle, UNREVIEWED, type ListedCalling } from './callings'

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
