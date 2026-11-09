import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { showOnAppIcon } from '../lib/appBadge'
import { loadTabCounts } from '../lib/queries'
import { useRefreshWaiting, useTabCounts, WaitingProvider } from './WaitingCount'

const stub = vi.hoisted(() => ({ auth: {} as Record<string, unknown> }))

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => stub.auth }))
vi.mock('../lib/supabase', () => ({ supabase: { client: true } }))
vi.mock('../lib/appBadge')
vi.mock('../lib/queries')

function Counts() {
  const counts = useTabCounts()
  const refresh = useRefreshWaiting()
  return (
    <>
      <div data-testid="counts">{JSON.stringify(counts)}</div>
      <button onClick={refresh}>recount</button>
      <Link to="/other">go</Link>
    </>
  )
}

const show = () =>
  render(
    <MemoryRouter>
      <WaitingProvider>
        <Counts />
      </WaitingProvider>
    </MemoryRouter>,
  )
const asked = () => vi.mocked(loadTabCounts).mock.calls[0][1]
const setVisibility = (state: string) => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })

beforeEach(() => {
  vi.resetAllMocks()
  setVisibility('visible')
  stub.auth = { profile: { id: 'me' }, roles: ['bishopric'], office: 'bishop', templates: [{ sections: [{ kind: 'callings' }] }], callingsHidden: false }
  vi.mocked(loadTabCounts).mockResolvedValue({ '/requests': 2, '/home': 1 })
})

describe('WaitingProvider', () => {
  it('counts nothing before someone is signed in', () => {
    stub.auth = { ...stub.auth, profile: null }
    show()
    expect(loadTabCounts).not.toHaveBeenCalled()
  })

  it('counts nothing for someone with no role', () => {
    stub.auth = { ...stub.auth, roles: [] }
    show()
    expect(loadTabCounts).not.toHaveBeenCalled()
  })

  it('shares the counts, and puts the total on the app icon', async () => {
    show()
    await waitFor(() => expect(screen.getByTestId('counts')).toHaveTextContent('{"/requests":2,"/home":1}'))
    await waitFor(() => expect(showOnAppIcon).toHaveBeenLastCalledWith(3))
  })

  it('clears the app icon when it goes away', async () => {
    const { unmount } = show()
    await waitFor(() => expect(showOnAppIcon).toHaveBeenLastCalledWith(3))
    unmount()
    expect(showOnAppIcon).toHaveBeenLastCalledWith(0)
  })

  it('keeps going when the counts fail to load', async () => {
    vi.mocked(loadTabCounts).mockRejectedValue(new Error('offline'))
    show()
    await waitFor(() => expect(loadTabCounts).toHaveBeenCalled())
    expect(screen.getByTestId('counts')).toHaveTextContent('{}')
  })

  it.each([
    ['executive_secretary', 'secretary'],
    ['bishop', 'leader'],
    ['ward_clerk', null],
  ])('uses the right Home for office %s', (office, home) => {
    stub.auth = { ...stub.auth, office }
    show()
    expect(asked()).toMatchObject({ home, userId: 'me', bishopric: true, sacrament: true })
  })

  it('counts callings when an agenda has a callings section', () => {
    show()
    expect(asked().callings).toBe(true)
  })

  it('does not count callings when no agenda has that section', () => {
    stub.auth = { ...stub.auth, templates: [{ sections: [{ kind: 'discussion' }] }] }
    show()
    expect(asked().callings).toBe(false)
  })

  it('does not count callings for someone who can\'t see them', () => {
    stub.auth = { ...stub.auth, callingsHidden: true }
    show()
    expect(asked().callings).toBe(false)
  })

  it('recounts when asked', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'recount' }))
    expect(loadTabCounts).toHaveBeenCalledTimes(2)
  })

  it('recounts on a page change', async () => {
    show()
    await userEvent.click(screen.getByRole('link', { name: 'go' }))
    expect(loadTabCounts).toHaveBeenCalledTimes(2)
  })

  it('recounts when the app comes back to the front, not when it leaves', () => {
    show()
    setVisibility('hidden')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(loadTabCounts).toHaveBeenCalledOnce()
    setVisibility('visible')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(loadTabCounts).toHaveBeenCalledTimes(2)
  })

  it('has empty counts and a harmless refresh outside the provider', () => {
    render(
      <MemoryRouter>
        <Counts />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('counts')).toHaveTextContent('{}')
    act(() => screen.getByRole('button', { name: 'recount' }).click())
  })
})
