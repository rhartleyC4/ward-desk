import { ThemeProvider } from '@mui/material/styles'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../theme'
import { SettingsLayout, SettingsPage } from './SettingsPage'

const stub = vi.hoisted(() => ({ auth: {} as Record<string, unknown>, split: false, steps: [] as unknown[] }))

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => stub.auth }))
vi.mock('../components/Layout', async (original) => ({ ...(await original<object>()), useSettingsSplit: () => stub.split }))
vi.mock('../components/Setup', () => ({ useSetupSteps: () => stub.steps, SetupChecklist: ({ steps }: { steps: unknown[] }) => <div>{`checklist of ${steps.length}`}</div> }))
vi.mock('./AccountPage', () => ({ AccountPage: () => <div>account page</div> }))
vi.mock('../lib/supabase', () => ({ supabase: {} }))
const setSendsReminders = vi.hoisted(() => vi.fn())
vi.mock('../lib/queries', () => ({ setSendsReminders }))

const signOut = vi.fn()

const show = (ui: React.ReactElement, path = '/settings') =>
  render(
    <ThemeProvider theme={theme} defaultMode="system">
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={ui}>
            <Route path="/settings" element={<div>the page</div>} />
            <Route path="/away" element={<div>the page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )

const showPage = () =>
  render(
    <ThemeProvider theme={theme} defaultMode="system">
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </ThemeProvider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  stub.split = false
  stub.steps = []
  stub.auth = { roles: ['bishopric'], office: 'bishop', profile: { display_name: 'Avery Lane' }, session: { user: { email: 'a@ward.test' } }, signOut, actingFor: null }
})

describe('SettingsPage', () => {
  it('is the list on a phone, with the account and checklist first', () => {
    stub.steps = [{ id: 'a' }]
    showPage()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Avery Lane/ })).toHaveAttribute('href', '/account')
    expect(screen.getByText('checklist of 1')).toBeInTheDocument()
  })

  it('opens on the account page when the list sits beside it', () => {
    stub.split = true
    showPage()
    expect(screen.getByText('account page')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('lets a secretary turn appointment reminders off', async () => {
    const show = vi.fn()
    setSendsReminders.mockResolvedValue(undefined)
    stub.auth = { ...stub.auth, office: 'executive_secretary', profile: { id: 'me', display_name: 'Quinn' }, sendsReminders: true, setSendsReminders: show }
    showPage()
    const appointments = screen.getByRole('region', { name: 'Appointments' })
    await userEvent.click(within(appointments).getByRole('switch', { name: 'Send reminders' }))
    expect(show).toHaveBeenCalledWith(false)
    expect(setSendsReminders).toHaveBeenCalledWith({}, 'me', false)
  })

  it('puts the choice back when it does not save', async () => {
    const show = vi.fn()
    setSendsReminders.mockRejectedValue(new Error('offline'))
    stub.auth = { ...stub.auth, office: 'executive_secretary', profile: { id: 'me', display_name: 'Quinn' }, sendsReminders: true, setSendsReminders: show }
    showPage()
    await userEvent.click(screen.getByRole('switch', { name: 'Send reminders' }))
    expect(show).toHaveBeenLastCalledWith(true)
    expect(await screen.findByText('offline')).toBeInTheDocument()
  })

  it('only offers the reminders choice to secretaries', () => {
    showPage()
    expect(screen.queryByRole('switch', { name: 'Send reminders' })).not.toBeInTheDocument()
  })

  it('mentions notifications only to those who get them', () => {
    showPage()
    expect(screen.getByText('Name, sign-in, Face ID and notifications')).toBeInTheDocument()
  })

  it('leaves notifications out for others, and falls back to the email', () => {
    stub.auth = { ...stub.auth, roles: ['leader'], office: null, profile: null }
    showPage()
    expect(screen.getByText('Name, sign-in and Face ID')).toBeInTheDocument()
    expect(screen.getByText('a@ward.test')).toBeInTheDocument()
  })

  it('links the pages this person can use', () => {
    stub.auth = { ...stub.auth, roles: ['admin'], office: null }
    showPage()
    expect(screen.getByRole('link', { name: /Who can sign in/ })).toHaveAttribute('href', '/access')
  })

  it('always offers Appearance, in a group of its own if need be', () => {
    stub.auth = { ...stub.auth, roles: [], office: null }
    showPage()
    expect(screen.getByLabelText('Appearance')).toBeInTheDocument()
  })

  it('changes the appearance', async () => {
    showPage()
    const select = await screen.findByLabelText('Appearance')
    await userEvent.selectOptions(select, 'dark')
    expect(select).toHaveValue('dark')
  })

  it('signs out', async () => {
    showPage()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledOnce()
  })
})

describe('SettingsLayout', () => {
  it('is just the page on a phone', () => {
    show(<SettingsLayout />)
    expect(screen.getByText('the page')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('keeps the list beside the page on a wide screen', () => {
    stub.split = true
    show(<SettingsLayout />, '/away')
    expect(screen.getByRole('navigation', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('the page')).toBeInTheDocument()
  })

  it.each([
    ['/settings', 'account, since Settings opens on it'],
    ['/away', 'the page open'],
  ])('at %s, highlights %s', (path) => {
    stub.split = true
    stub.auth = { ...stub.auth, roles: ['bishopric'], office: 'bishop' }
    show(<SettingsLayout />, path)
    const nav = screen.getByRole('navigation', { name: 'Settings' })
    const row = within(nav).getByRole('link', { name: path === '/settings' ? /Avery Lane/ : /I'll be away/ })
    expect(row).toHaveAttribute('aria-current', 'page')
  })
})
