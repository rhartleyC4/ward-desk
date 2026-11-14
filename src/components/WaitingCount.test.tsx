import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { showOnAppIcon } from '../lib/appBadge'
import { listenForWardChanges, onWardChange } from '../lib/liveUpdates'
import { loadTabCounts } from '../lib/queries'
import { useRefreshWaiting, useTabCounts, WaitingProvider } from './WaitingCount'

const stub = vi.hoisted(() => ({ auth: {} as Record<string, unknown> }))

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => stub.auth }))
vi.mock('../lib/supabase', () => ({ supabase: { client: true }, WARD_TIME_ZONE: 'America/Denver' }))
vi.mock('../lib/appBadge')
vi.mock('../lib/queries')
vi.mock('../lib/liveUpdates')

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

beforeEach(() => {
  vi.resetAllMocks()
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

  it("counts from the ward's date, not the device's", async () => {
    // 8 PM on the 8th in Denver, the mocked ward's zone, and already the 9th in UTC.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-09T03:00:00Z') })
    show()
    await waitFor(() => expect(loadTabCounts).toHaveBeenCalled())
    vi.useRealTimers()
    expect(asked().today).toBe('2026-11-08')
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

  it('recounts when ward data changes', () => {
    const changed: (() => void)[] = []
    vi.mocked(onWardChange).mockImplementation((fn) => (changed.push(fn), () => {}))
    show()
    expect(loadTabCounts).toHaveBeenCalledOnce()
    act(() => changed.forEach((fn) => fn()))
    expect(loadTabCounts).toHaveBeenCalledTimes(2)
  })

  it('listens for changes while someone with a role is signed in, and stops on sign-out', () => {
    const stop = vi.fn()
    vi.mocked(listenForWardChanges).mockReturnValue(stop)
    const { unmount } = show()
    expect(listenForWardChanges).toHaveBeenCalledOnce()
    unmount()
    expect(stop).toHaveBeenCalled()
  })

  it('does not listen for someone with no role', () => {
    stub.auth = { ...stub.auth, roles: [] }
    show()
    expect(listenForWardChanges).not.toHaveBeenCalled()
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
