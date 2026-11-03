import { describe, expect, it } from 'vitest'
import { homeFor, navFor } from './access'

const labels = (roles: Parameters<typeof navFor>[0], templates: unknown[] = []) => navFor(roles, templates).map((l) => l.label)
const bishopric = [{ slug: 'bishopric' }, { slug: 'ward-council' }]

describe('navFor', () => {
  it('gives the bishopric everything', () => {
    expect(labels(['bishopric'], bishopric)).toEqual(['Agenda', 'Sacrament', 'Appointments', 'Away', 'Schedule', 'Meetings'])
  })

  it('limits called leaders to the suggestion form', () => {
    expect(labels(['leader'])).toEqual(['Suggest a name'])
  })

  it('adds the agenda for a leader who attends a meeting', () => {
    expect(labels(['leader'], [{ slug: 'ward-council' }])).toEqual(['Agenda', 'Suggest a name'])
  })

  it('does not grant appointments to an admin who is not in the bishopric', () => {
    expect(labels(['admin'])).not.toContain('Appointments')
  })

  it('lets only admins manage sign-in access', () => {
    expect(labels(['admin', 'bishopric'], bishopric)).toContain('Access')
    expect(labels(['bishopric'], bishopric)).not.toContain('Access')
  })

  it('lets only admins tidy the calling list', () => {
    expect(labels(['admin'])).toContain('Calling list')
    expect(labels(['bishopric'], bishopric)).not.toContain('Calling list')
  })

  it('shows nothing without a role', () => {
    expect(labels([])).toEqual([])
  })
})

describe('homeFor', () => {
  it('lands each role on its main page', () => {
    expect(homeFor(['admin', 'bishopric'], bishopric)).toBe('/agenda')
    expect(homeFor(['leader'])).toBe('/suggest')
    expect(homeFor([])).toBe('/no-access')
  })
})
