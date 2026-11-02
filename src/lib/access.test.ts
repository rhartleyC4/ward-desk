import { describe, expect, it } from 'vitest'
import { homeFor, navFor } from './access'

const labels = (roles: Parameters<typeof navFor>[0]) => navFor(roles).map((l) => l.label)

describe('navFor', () => {
  it('gives the bishopric everything', () => {
    expect(labels(['bishopric'])).toEqual(['Agenda', 'Sacrament', 'Callings', 'Away', 'Schedule'])
  })

  it('limits called leaders to the suggestion form', () => {
    expect(labels(['leader'])).toEqual(['Suggest a name'])
  })

  it('does not grant callings to an admin who is not in the bishopric', () => {
    expect(labels(['admin'])).not.toContain('Callings')
  })

  it('shows nothing without a role', () => {
    expect(labels([])).toEqual([])
  })
})

describe('homeFor', () => {
  it('lands each role on its main page', () => {
    expect(homeFor(['admin', 'bishopric'])).toBe('/agenda')
    expect(homeFor(['leader'])).toBe('/suggest')
    expect(homeFor([])).toBe('/no-access')
  })
})
