import { describe, expect, it } from 'vitest'
import { homeFor, navFor } from './access'

const labels = (roles: Parameters<typeof navFor>[0]) => navFor(roles).map((l) => l.label)

describe('navFor', () => {
  it('gives the bishopric everything', () => {
    expect(labels(['bishopric'])).toEqual(['Agenda', 'Sacrament', 'Callings', 'Away', 'Schedule'])
  })

  it('never shows callings or the agenda to a scheduler', () => {
    expect(labels(['scheduler'])).toEqual(['Sacrament', 'Away', 'Schedule'])
  })

  it('limits suggesters to the suggestion form', () => {
    expect(labels(['suggester'])).toEqual(['Suggest a name'])
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
    expect(homeFor(['scheduler'])).toBe('/sacrament')
    expect(homeFor(['suggester'])).toBe('/suggest')
    expect(homeFor([])).toBe('/no-access')
  })
})
