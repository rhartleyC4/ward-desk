import { ThemeProvider } from '@mui/material/styles'
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../theme'
import { ErrorNote, Layout, Loading, Muted, SectionCard, Side, Split, Tiles } from './Layout'

const stub = vi.hoisted(() => ({ auth: {} as Record<string, unknown>, counts: {} as Record<string, number>, steps: [] as { done: boolean }[], wide: false }))

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => stub.auth }))
vi.mock('@mui/material/useMediaQuery', () => ({ default: () => stub.wide }))
vi.mock('./WaitingCount', () => ({ WaitingProvider: ({ children }: { children: React.ReactNode }) => children, useTabCounts: () => stub.counts }))
vi.mock('./Setup', () => ({ SetupProvider: ({ children }: { children: React.ReactNode }) => children, useSetupSteps: () => stub.steps }))
vi.mock('./InstallPrompt', () => ({ InstallPrompt: () => <div>install prompt</div> }))
vi.mock('./PasskeyOffer', () => ({ PasskeyOffer: () => <div>passkey offer</div> }))
vi.mock('./MentorBanner', () => ({ MentorBanner: () => <div>mentor banner</div> }))

const bishop = { roles: ['bishopric'], office: 'bishop', templates: [{ id: 't' }], profile: { display_name: 'Avery Lane' } }

const themed = (ui: ReactNode) => <ThemeProvider theme={theme} defaultMode="system">{ui}</ThemeProvider>

const show = (path: string, element = <div>the page</div>) =>
  render(
    themed(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="*" element={element} />
          </Route>
        </Routes>
      </MemoryRouter>,
    ),
  )
const bottomNav = () => screen.getByRole('navigation', { name: 'Main' })

beforeEach(() => {
  stub.auth = bishop
  stub.counts = {}
  stub.steps = []
  stub.wide = false
})

describe('Layout', () => {
  it('shows the page with a tab for each section', () => {
    show('/home')
    expect(screen.getByText('the page')).toBeInTheDocument()
    expect(within(bottomNav()).getByRole('link', { name: 'Requests' })).toHaveAttribute('href', '/requests')
  })

  it('has no tabs for someone with one section', () => {
    stub.auth = { ...bishop, roles: ['leader'], office: null, templates: [] }
    show('/requests')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('says how many are new on Requests, and to look at elsewhere', () => {
    stub.counts = { '/requests': 2, '/home': 1 }
    show('/home')
    expect(within(bottomNav()).getByRole('link', { name: 'Requests (2 new)' })).toBeInTheDocument()
    expect(within(bottomNav()).getByRole('link', { name: 'Home (1 to look at)' })).toBeInTheDocument()
  })

  it('shows the same counts on the wide tabs', () => {
    stub.counts = { '/requests': 2 }
    show('/home')
    expect(screen.getByRole('tab', { name: 'Requests (2 new)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Home' })).toBeInTheDocument()
  })

  it('marks a sub-page under its section as that tab', () => {
    show('/agenda/bishopric')
    expect(screen.getByRole('tab', { name: 'Meetings' })).toHaveAttribute('aria-selected', 'true')
  })

  it('offers to install and turn on Face ID on the landing page only', () => {
    show('/home')
    expect(screen.getByText('install prompt')).toBeInTheDocument()
    expect(screen.getByText('passkey offer')).toBeInTheDocument()
  })

  it('does not offer them on other pages', () => {
    show('/requests')
    expect(screen.queryByText('install prompt')).not.toBeInTheDocument()
  })

  it('flags Settings while setup is not finished', () => {
    stub.steps = [{ done: false }]
    show('/home')
    expect(screen.getByRole('link', { name: 'Settings (setup not finished)' })).toHaveAttribute('href', '/settings')
  })

  it('has a plain Settings link once it is', () => {
    stub.steps = [{ done: true }]
    show('/home')
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
  })

  it('offers the way back from a settings page on a phone', () => {
    show('/away')
    expect(screen.getAllByRole('link', { name: 'Settings' }).some((l) => l.getAttribute('href') === '/settings')).toBe(true)
  })

  it('honors where a link says back should go', () => {
    render(
      themed(
        <MemoryRouter initialEntries={[{ pathname: '/hours', state: { back: { to: '/home', label: 'Home' } } }]}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="*" element={<div>the page</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      ),
    )
    expect(screen.getAllByRole('link', { name: 'Home' }).some((l) => l.getAttribute('href') === '/home')).toBe(true)
  })

  it('catches a page that crashes and keeps the app around it', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Boom = () => {
      throw new Error('boom')
    }
    show('/home', <Boom />)
    expect(within(bottomNav()).getByRole('link', { name: 'Requests' })).toBeInTheDocument()
    quiet.mockRestore()
  })
})

describe('Split', () => {
  const cards = (
    <Split>
      <div>main card</div>
      <Side>
        <div>side card</div>
      </Side>
    </Split>
  )

  it('keeps the order given on a phone', () => {
    const { container } = render(cards)
    expect(container.textContent).toBe('main cardside card')
  })

  it('puts side cards in their own column on a desktop', () => {
    stub.wide = true
    render(cards)
    const main = screen.getByText('main card').parentElement as HTMLElement
    const side = screen.getByText('side card').parentElement as HTMLElement
    expect(main).not.toBe(side)
    expect(main.parentElement).toBe(side.parentElement)
  })

  it('uses one column on a desktop with nothing for the side', () => {
    stub.wide = true
    render(
      <Split>
        <div>one</div>
        <div>two</div>
      </Split>,
    )
    expect(screen.getByText('one').parentElement).toBe(screen.getByText('two').parentElement)
  })
})

describe('the small pieces', () => {
  it('Tiles shows its children', () => {
    render(<Tiles>tile</Tiles>)
    expect(screen.getByText('tile')).toBeInTheDocument()
  })

  it('SectionCard shows its title and action', () => {
    render(
      <SectionCard title="Title" action={<button>act</button>}>
        body
      </SectionCard>,
    )
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'act' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('SectionCard can have no title', () => {
    render(<SectionCard>body</SectionCard>)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it.each([
    [5, '5'],
    [99, '99'],
    [100, '99+'],
  ])('SectionCard shows %i waiting as %s', (waiting, shown) => {
    render(
      <SectionCard title="Title" waiting={waiting}>
        body
      </SectionCard>,
    )
    expect(screen.getByRole('status', { name: `${waiting} waiting on you` })).toHaveTextContent(shown)
  })

  it('ErrorNote only shows when there is an error', () => {
    const { container, rerender } = render(<ErrorNote error={null} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<ErrorNote error="broken" />)
    expect(screen.getByRole('alert')).toHaveTextContent('broken')
  })

  it('Loading says so', () => {
    render(<Loading />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('Muted shows its text', () => {
    render(<Muted>quiet</Muted>)
    expect(screen.getByText('quiet')).toBeInTheDocument()
  })
})
