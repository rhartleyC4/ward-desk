import { describe, expect, it } from 'vitest'
import { homeFor, isSettingsPage, navFor, settingsFor } from './access'

const labels = (roles: Parameters<typeof navFor>[0], templates: unknown[] = []) => navFor(roles, templates).map((l) => l.label)
const bishopric = [{ slug: 'bishopric' }, { slug: 'ward-council' }]

describe('navFor', () => {
  it('keeps the tabs to everyday work for the bishopric', () => {
    expect(labels(['bishopric'], bishopric)).toEqual(['Agenda', 'Sacrament', 'Appointments'])
    expect(navFor(['admin', 'bishopric'], bishopric, 'bishop').map((l) => l.label)).toEqual(['Home', 'Agenda', 'Sacrament', 'Appointments'])
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

  it('shows nothing without a role', () => {
    expect(labels([])).toEqual([])
  })
})

const settings = (roles: Parameters<typeof settingsFor>[0], office: Parameters<typeof settingsFor>[1] = null) =>
  Object.fromEntries(settingsFor(roles, office).map((g) => [g.title, g.links.map((l) => l.label)]))

describe('settingsFor', () => {
  it('groups the setup pages for the bishop', () => {
    expect(settings(['admin', 'bishopric'], 'bishop')).toEqual({
      You: ["Dates I'll be away"],
      Appointments: ['Appointment hours', 'Usual lengths', 'Message templates', 'Who books for whom'],
      Meetings: ['Agendas', 'Standing schedule', 'Calling list'],
      Ward: ['Who can sign in'],
    })
  })

  it('lets only admins manage sign-in access and tidy the calling list', () => {
    expect(settings(['bishopric'], 'first_counselor').Ward).toBeUndefined()
    expect(settings(['bishopric'], 'first_counselor').Meetings).not.toContain('Calling list')
    expect(settings(['admin'])).toEqual({ You: ["Dates I'll be away"], Appointments: ['Appointment hours'], Meetings: ['Agendas', 'Standing schedule', 'Calling list'], Ward: ['Who can sign in'] })
  })

  it('leaves out empty groups', () => {
    expect(settings(['leader'])).toEqual({})
  })
})

describe('isSettingsPage', () => {
  it('knows the pages opened from Settings', () => {
    expect(isSettingsPage('/settings')).toBe(true)
    expect(isSettingsPage('/settings/lengths')).toBe(true)
    expect(isSettingsPage('/hours')).toBe(true)
    expect(isSettingsPage('/home')).toBe(false)
    expect(isSettingsPage('/agenda/bishopric')).toBe(false)
  })
})

describe('homeFor', () => {
  it('lands each role on its main page', () => {
    expect(homeFor(['admin', 'bishopric'], bishopric)).toBe('/agenda')
    expect(homeFor(['leader'])).toBe('/suggest')
    expect(homeFor([])).toBe('/no-access')
  })

  it('asks a bishop or counselor without appointment hours to set them first', () => {
    expect(homeFor(['bishopric'], bishopric, 'second_counselor', true)).toBe('/hours')
    expect(homeFor(['bishopric'], bishopric, 'second_counselor', false)).toBe('/home')
    expect(homeFor(['leader'], [], null, true)).toBe('/suggest')
  })

  it('lands the bishop and counselors on their home screen', () => {
    expect(homeFor(['bishopric'], bishopric, 'bishop')).toBe('/home')
    expect(homeFor(['bishopric'], bishopric, 'first_counselor')).toBe('/home')
    expect(navFor(['bishopric'], bishopric, 'second_counselor')[0]).toEqual({ to: '/home', label: 'Home' })
    // A bishop's office without the bishopric role (a stale profile) gets no home.
    expect(homeFor(['admin'], [], 'bishop')).toBe('/sacrament')
  })

  it('lands the executive secretary on the home screen', () => {
    expect(navFor(['bishopric'], bishopric, 'executive_secretary')[0]).toEqual({ to: '/home', label: 'Home' })
    expect(homeFor(['bishopric'], bishopric, 'executive_secretary')).toBe('/home')
    expect(homeFor(['bishopric'], bishopric, 'assistant_executive_secretary')).toBe('/home')
    expect(homeFor(['bishopric'], bishopric, 'ward_clerk')).toBe('/agenda')
    expect(labels(['bishopric'], bishopric)).not.toContain('Home')
    expect(navFor(['leader'], [], 'executive_secretary').map((l) => l.label)).not.toContain('Home')
  })
})
