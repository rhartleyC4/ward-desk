import { render, screen } from '@testing-library/react'
import { Outlet } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const stub = vi.hoisted(() => ({ auth: {} as Record<string, unknown> }))

vi.mock('./auth/AuthProvider', () => ({ AuthProvider: ({ children }: { children: React.ReactNode }) => children, useAuth: () => stub.auth }))
vi.mock('./components/Layout', () => ({ Layout: () => <Outlet />, Loading: () => <div>loading</div> }))
vi.mock('./pages/AccessPage', () => ({ AccessPage: () => <div>page: access</div> }))
vi.mock('./pages/AccountPage', () => ({ AccountPage: () => <div>page: account</div> }))
vi.mock('./pages/AgendaPage', () => ({ AgendaPage: () => <div>page: agenda</div> }))
vi.mock('./pages/AppointmentsPage', () => ({ AppointmentsPage: () => <div>page: appointments</div> }))
vi.mock('./pages/CallingListPage', () => ({ CallingListPage: () => <div>page: calling list</div> }))
vi.mock('./pages/AwayPage', () => ({ AwayPage: () => <div>page: away</div> }))
vi.mock('./pages/HandoverPage', () => ({ HandoverPage: () => <div>page: handover</div> }))
vi.mock('./pages/HomePage', () => ({ HomePage: () => <div>page: home</div> }))
vi.mock('./pages/LeaderChangePage', () => ({ LeaderChangePage: () => <div>page: leader</div> }))
vi.mock('./pages/HoursPage', () => ({ HoursPage: () => <div>page: hours</div> }))
vi.mock('./pages/LoginPage', () => ({ LoginPage: () => <div>page: login</div> }))
vi.mock('./pages/MeetingsPage', () => ({ MeetingsPage: () => <div>page: meetings</div> }))
vi.mock('./pages/SacramentPage', () => ({ SacramentPage: () => <div>page: sacrament</div> }))
vi.mock('./pages/LengthsPage', () => ({ LengthsPage: () => <div>page: lengths</div> }))
vi.mock('./pages/MessagesPage', () => ({ MessagesPage: () => <div>page: messages</div> }))
vi.mock('./pages/SchedulePage', () => ({ SchedulePage: () => <div>page: schedule</div> }))
vi.mock('./pages/SettingsPage', () => ({ SettingsLayout: () => <Outlet />, SettingsPage: () => <div>page: settings</div> }))
vi.mock('./pages/WhoBooksPage', () => ({ WhoBooksPage: () => <div>page: who books</div> }))
vi.mock('./pages/RequestsPage', () => ({ RequestsPage: () => <div>page: requests</div> }))
vi.mock('./pages/RemindersPage', () => ({ RemindersPage: () => <div>page: reminders</div> }))

const meeting = { id: 't', slug: 'bishopric', sections: [] }
const bishop = { roles: ['bishopric'], office: 'bishop', templates: [meeting], hasHours: true, actingFor: null }
const admin = { roles: ['admin'], office: null, templates: [], hasHours: false, actingFor: null }
const leader = { roles: ['leader'], office: null, templates: [], hasHours: false, actingFor: null }
const clerk = { roles: ['bishopric', 'admin'], office: 'ward_clerk', templates: [], hasHours: false, actingFor: null }

const visit = (path: string, who: Record<string, unknown>) => {
  stub.auth = { loading: false, session: { user: { id: 'me' } }, ...who }
  window.history.pushState({}, '', path)
  render(<App />)
}

beforeEach(() => {
  window.history.pushState({}, '', '/')
})

describe('App', () => {
  it('waits for the session', () => {
    visit('/', { ...bishop, loading: true })
    expect(screen.getByText('loading')).toBeInTheDocument()
  })

  it('asks anyone not signed in to sign in, whatever the address', () => {
    visit('/access', { ...admin, session: null })
    expect(screen.getByText('page: login')).toBeInTheDocument()
  })

  it.each([
    ['/home', bishop, 'home'],
    ['/agenda', bishop, 'agenda'],
    ['/agenda/bishopric', bishop, 'agenda'],
    ['/agenda/bishopric/2026-11-08', bishop, 'agenda'],
    ['/sacrament', bishop, 'sacrament'],
    ['/appointments', bishop, 'appointments'],
    ['/requests', leader, 'requests'],
    ['/reminders', bishop, 'reminders'],
    ['/hours', bishop, 'hours'],
    ['/away', bishop, 'away'],
    ['/schedule', admin, 'schedule'],
    ['/meetings', admin, 'meetings'],
    ['/calling-list', admin, 'calling list'],
    ['/access', admin, 'access'],
    ['/account', leader, 'account'],
    ['/settings', leader, 'settings'],
    ['/settings/lengths', bishop, 'lengths'],
    ['/settings/messages', bishop, 'messages'],
    ['/settings/who-books', bishop, 'who books'],
    ['/settings/handover', bishop, 'handover'],
    ['/settings/leader', admin, 'leader'],
  ])('opens %s for someone allowed', (path, who, page) => {
    visit(path, who)
    expect(screen.getByText(`page: ${page}`)).toBeInTheDocument()
  })

  it.each([
    ['/home', leader],
    ['/agenda', admin],
    ['/sacrament', leader],
    ['/appointments', admin],
    ['/reminders', leader],
    ['/hours', leader],
    ['/away', leader],
    ['/schedule', leader],
    ['/meetings', leader],
    ['/calling-list', bishop],
    ['/access', bishop],
    ['/settings/lengths', admin],
    ['/settings/messages', leader],
    ['/settings/who-books', admin],
    ['/settings/handover', leader],
    ['/settings/leader', leader],
  ])('turns away from %s anyone not allowed', (path, who) => {
    visit(path, who)
    expect(window.location.pathname).not.toBe(path)
  })

  it('won\'t let a mentor change the bishopric', () => {
    visit('/settings/handover', { ...bishop, actingFor: { for_id: 'x' } })
    expect(window.location.pathname).not.toBe('/settings/handover')
  })

  it('opens a leader on their hours until they have some', () => {
    visit('/', { ...bishop, hasHours: false })
    expect(screen.getByText('page: hours')).toBeInTheDocument()
  })

  it('opens someone with hours on Home', () => {
    visit('/', bishop)
    expect(screen.getByText('page: home')).toBeInTheDocument()
  })

  it('tells someone with no role that they have none', () => {
    visit('/no-access', { roles: [], office: null, templates: [], hasHours: false })
    expect(screen.getByText(/no role has been assigned to you yet/)).toBeInTheDocument()
  })

  it('moves old callings links to the bishopric agenda', () => {
    visit('/callings', bishop)
    expect(window.location.pathname).toBe('/agenda/bishopric')
  })

  it('moves old suggest links to a new calling request', () => {
    visit('/suggest', leader)
    expect(window.location.pathname + window.location.search).toBe('/requests?new=calling')
  })

  it('sends an unknown address home', () => {
    visit('/nope', clerk)
    expect(window.location.pathname).not.toBe('/nope')
  })
})
