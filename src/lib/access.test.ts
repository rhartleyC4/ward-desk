import { describe, expect, it } from 'vitest'
import { backFor, canAskForCallings, canSeeCallings, canSendRequests, homeFor, isSettingsPage, navFor, settingsFor } from './access'

const labels = (roles: Parameters<typeof navFor>[0], templates: unknown[] = []) => navFor(roles, templates).map((l) => l.label)
const bishopric = [{ slug: 'bishopric' }, { slug: 'ward-council' }]

describe('navFor', () => {
  it('keeps the tabs to everyday work for the bishopric', () => {
    expect(labels(['bishopric'], bishopric)).toEqual(['Meetings', 'Sacrament', 'Requests'])
    expect(navFor(['admin', 'bishopric'], bishopric, 'bishop').map((l) => l.label)).toEqual(['Home', 'Meetings', 'Sacrament', 'Requests'])
  })

  it('shows the Appointments tab only to the executive secretaries', () => {
    const tabs = (office: Parameters<typeof navFor>[2]) => navFor(['bishopric'], bishopric, office).map((l) => l.label)
    expect(tabs('executive_secretary')).toEqual(['Home', 'Meetings', 'Sacrament', 'Appointments', 'Requests'])
    expect(tabs('assistant_executive_secretary')).toContain('Appointments')
    expect(tabs('first_counselor')).not.toContain('Appointments')
    expect(tabs('ward_clerk')).toEqual(['Meetings', 'Sacrament', 'Requests'])
  })

  it('gives called leaders only their requests', () => {
    expect(labels(['leader'])).toEqual(['Requests'])
  })

  it('adds the agenda for a leader who attends a meeting', () => {
    expect(labels(['leader'], [{ slug: 'ward-council' }])).toEqual(['Meetings', 'Requests'])
  })

  it('does not grant appointments to an admin who is not in the bishopric', () => {
    expect(labels(['admin'])).not.toContain('Appointments')
  })

  it('lets only the bishopric send requests, and only leaders ask for calling changes', () => {
    expect(canSendRequests(['bishopric'])).toBe(true)
    expect(canSendRequests(['leader'])).toBe(false)
    expect(canAskForCallings(['leader'])).toBe(true)
    expect(canAskForCallings(['leader', 'bishopric'])).toBe(false)
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
      Ward: ['Who can sign in', 'Change of bishopric', 'Change a ward leader'],
    })
  })

  it('lets the bishop or an admin change the bishopric, and the whole bishopric change a leader', () => {
    expect(settings(['bishopric'], 'first_counselor').Ward).toEqual(['Change a ward leader'])
    expect(settings(['bishopric'], 'bishop').Ward).toEqual(['Change of bishopric', 'Change a ward leader'])
    // A mentor acting for the bishop isn't the bishop.
    expect(settingsFor(['bishopric'], 'bishop', true).find((g) => g.title === 'Ward')!.links.map((l) => l.label)).toEqual(['Change a ward leader'])
  })

  it('lets only admins manage sign-in access and tidy the calling list', () => {
    expect(settings(['bishopric'], 'first_counselor').Ward).not.toContain('Who can sign in')
    expect(settings(['bishopric'], 'first_counselor').Meetings).not.toContain('Calling list')
    expect(settings(['admin'])).toEqual({ You: ["Dates I'll be away"], Appointments: ['Appointment hours'], Meetings: ['Agendas', 'Standing schedule', 'Calling list'], Ward: ['Who can sign in', 'Change of bishopric', 'Change a ward leader'] })
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
    expect(homeFor(['leader'])).toBe('/requests')
    expect(homeFor([])).toBe('/no-access')
  })

  it('asks a bishop or counselor without appointment hours to set them first', () => {
    expect(homeFor(['bishopric'], bishopric, 'second_counselor', true)).toBe('/hours')
    expect(homeFor(['bishopric'], bishopric, 'second_counselor', false)).toBe('/home')
    expect(homeFor(['leader'], [], null, true)).toBe('/requests')
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

describe('backFor', () => {
  const leader = navFor(['leader'])
  const bishopricTabs = navFor(['bishopric'], bishopric)

  it('goes back to Settings from a page opened there', () => {
    expect(backFor('/away', bishopricTabs)).toEqual({ to: '/settings', label: 'Settings' })
    expect(backFor('/settings', bishopricTabs)).toBeNull()
    expect(backFor('/agenda', bishopricTabs)).toBeNull()
  })

  it('leaves out the button back to Settings when its list is beside the page', () => {
    expect(backFor('/away', bishopricTabs, { settingsBeside: true })).toBeNull()
  })

  it('goes wherever sent the person here', () => {
    expect(backFor('/away', bishopricTabs, { sent: { to: '/home', label: 'Home' } })).toEqual({ to: '/home', label: 'Home' })
  })

  it('leads someone with one tab back to it, since they have no tab bar', () => {
    expect(leader.map((l) => l.label)).toEqual(['Requests'])
    expect(backFor('/settings', leader)).toEqual({ to: '/requests', label: 'Requests' })
    expect(backFor('/account', leader, { settingsBeside: true })).toEqual({ to: '/requests', label: 'Requests' })
    expect(backFor('/account', leader)).toEqual({ to: '/settings', label: 'Settings' })
    expect(backFor('/requests', leader)).toBeNull()
    expect(backFor('/requests/123', leader)).toBeNull()
  })
})

describe('canSeeCallings for a mentor', () => {
  it('hides callings from a mentor until the new bishop allows them', () => {
    expect(canSeeCallings(['bishopric'])).toBe(true)
    expect(canSeeCallings(['bishopric'], true)).toBe(false)
    expect(canSeeCallings(['leader'])).toBe(false)
  })
})
