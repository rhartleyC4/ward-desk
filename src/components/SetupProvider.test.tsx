import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isTrainingSite } from '../lib/env'
import { currentDevice, installPlatform } from '../lib/install'
import { isSharedPracticeAccount, passkeysSupported } from '../lib/passkeys'
import { currentSubscription, pushAvailability, pushSupported, vapidPublicKey } from '../lib/push'
import { hasPushSubscription, listPasskeys } from '../lib/queries'
import { setupSteps } from '../lib/setup'
import { SetupCard, SetupProvider, useSetupSteps } from './Setup'

const stub = vi.hoisted(() => ({ auth: {} as Record<string, unknown> }))

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => stub.auth }))
vi.mock('../lib/supabase', () => ({ supabase: { client: true } }))
vi.mock('../lib/env')
vi.mock('../lib/install')
vi.mock('../lib/passkeys')
vi.mock('../lib/push')
vi.mock('../lib/queries')
vi.mock('../lib/setup', async (original) => ({ ...(await original<object>()), setupSteps: vi.fn(() => []) }))

function Steps() {
  return <div data-testid="count">{useSetupSteps().length}</div>
}

const show = () =>
  render(
    <MemoryRouter>
      <SetupProvider>
        <Steps />
        <Link to="/other">go</Link>
      </SetupProvider>
    </MemoryRouter>,
  )
const lastFacts = () => vi.mocked(setupSteps).mock.lastCall?.[0]

beforeEach(() => {
  vi.resetAllMocks()
  stub.auth = { roles: ['bishopric'], office: 'bishop', hasHours: true, session: { user: { id: 'me', email: 'a@ward.test' } } }
  vi.mocked(setupSteps).mockReturnValue([])
  vi.mocked(isTrainingSite).mockReturnValue(false)
  vi.mocked(isSharedPracticeAccount).mockReturnValue(false)
  vi.mocked(passkeysSupported).mockReturnValue(true)
  vi.mocked(listPasskeys).mockResolvedValue([{ id: 'p' }, { id: 'q' }] as never)
  vi.mocked(pushAvailability).mockReturnValue('unsupported')
  vi.mocked(pushSupported).mockReturnValue(false)
  vi.mocked(vapidPublicKey).mockReturnValue('key')
  vi.mocked(installPlatform).mockReturnValue('other')
  vi.mocked(currentDevice).mockReturnValue({} as never)
  vi.stubGlobal('Notification', { permission: 'granted' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SetupProvider', () => {
  it('passes along who this is, starting with nothing known about the device', () => {
    show()
    expect(vi.mocked(setupSteps).mock.calls[0][0]).toEqual({ roles: ['bishopric'], office: 'bishop', hasHours: true, passkeys: null, notifications: null })
  })

  it('counts the saved passkeys', async () => {
    show()
    await waitFor(() => expect(lastFacts()?.passkeys).toBe(2))
  })

  it('does not count passkeys where the browser can\'t use them', async () => {
    vi.mocked(passkeysSupported).mockReturnValue(false)
    show()
    await waitFor(() => expect(pushAvailability).toHaveBeenCalled())
    expect(listPasskeys).not.toHaveBeenCalled()
    expect(lastFacts()?.passkeys).toBeNull()
  })

  it('does not ask for a passkey on a shared practice account', async () => {
    vi.mocked(isTrainingSite).mockReturnValue(true)
    vi.mocked(isSharedPracticeAccount).mockReturnValue(true)
    show()
    await waitFor(() => expect(pushAvailability).toHaveBeenCalled())
    expect(isSharedPracticeAccount).toHaveBeenCalledWith('a@ward.test')
    expect(listPasskeys).not.toHaveBeenCalled()
  })

  it('leaves passkeys unknown when they can\'t be listed', async () => {
    vi.mocked(listPasskeys).mockRejectedValue(new Error('offline'))
    show()
    await waitFor(() => expect(pushAvailability).toHaveBeenCalled())
    expect(lastFacts()?.passkeys).toBeNull()
  })

  it('does not look at notifications for someone with no role', async () => {
    stub.auth = { ...stub.auth, roles: [] }
    show()
    await waitFor(() => expect(lastFacts()?.passkeys).toBe(2))
    expect(pushAvailability).not.toHaveBeenCalled()
  })

  it('asks a phone that needs it to install first', async () => {
    vi.mocked(pushAvailability).mockReturnValue('needs-install')
    show()
    await waitFor(() => expect(lastFacts()?.notifications).toBe('install'))
  })

  it('leaves notifications unknown when they aren\'t available', async () => {
    vi.mocked(pushAvailability).mockReturnValue('blocked')
    show()
    await waitFor(() => expect(lastFacts()?.passkeys).toBe(2))
    expect(lastFacts()?.notifications).toBeNull()
  })

  it('reads the permission only where push is supported', async () => {
    vi.mocked(pushSupported).mockReturnValue(true)
    show()
    await waitFor(() => expect(pushAvailability).toHaveBeenCalledWith(expect.objectContaining({ supported: true, permission: 'granted', configured: true })))
  })

  it('is off when there is no key', async () => {
    vi.mocked(vapidPublicKey).mockReturnValue('')
    show()
    await waitFor(() => expect(pushAvailability).toHaveBeenCalledWith(expect.objectContaining({ supported: false, permission: undefined, configured: false })))
  })

  describe('when notifications are available', () => {
    const sub = { endpoint: 'https://push.test/1' }

    beforeEach(() => {
      vi.mocked(pushAvailability).mockReturnValue('ready')
    })

    it('is on when this device is saved for this person', async () => {
      vi.mocked(currentSubscription).mockResolvedValue(sub as never)
      vi.mocked(hasPushSubscription).mockResolvedValue(true)
      show()
      await waitFor(() => expect(lastFacts()?.notifications).toBe('on'))
    })

    it('is off when this device has no subscription', async () => {
      vi.mocked(currentSubscription).mockResolvedValue(null)
      show()
      await waitFor(() => expect(lastFacts()?.notifications).toBe('off'))
      expect(hasPushSubscription).not.toHaveBeenCalled()
    })

    it('is off when it belongs to someone else', async () => {
      vi.mocked(currentSubscription).mockResolvedValue(sub as never)
      vi.mocked(hasPushSubscription).mockResolvedValue(false)
      show()
      await waitFor(() => expect(lastFacts()?.notifications).toBe('off'))
    })

    it('is off when the device can\'t be read', async () => {
      vi.mocked(currentSubscription).mockRejectedValue(new Error('no worker'))
      show()
      await waitFor(() => expect(lastFacts()?.notifications).toBe('off'))
    })

    it('is off when the check fails', async () => {
      vi.mocked(currentSubscription).mockResolvedValue(sub as never)
      vi.mocked(hasPushSubscription).mockRejectedValue(new Error('offline'))
      show()
      await waitFor(() => expect(lastFacts()?.notifications).toBe('off'))
    })
  })

  it('checks the device again on each page change', async () => {
    show()
    await waitFor(() => expect(listPasskeys).toHaveBeenCalledOnce())
    await userEvent.click(screen.getByRole('link', { name: 'go' }))
    await waitFor(() => expect(listPasskeys).toHaveBeenCalledTimes(2))
  })

  it('shares the steps with the page', () => {
    vi.mocked(setupSteps).mockReturnValue([{ id: 'hours', label: 'L', hint: 'H', to: '/x', done: false }])
    show()
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })
})

describe('SetupCard', () => {
  const card = () =>
    render(
      <MemoryRouter>
        <SetupProvider>
          <SetupCard />
        </SetupProvider>
      </MemoryRouter>,
    )

  it('shows nothing once setup is done', () => {
    vi.mocked(setupSteps).mockReturnValue([{ id: 'hours', label: 'L', hint: 'H', to: '/x', done: true }])
    card()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows the next step and opens Settings', () => {
    vi.mocked(setupSteps).mockReturnValue([
      { id: 'passkey', label: 'Done already', hint: 'H', to: '/a', done: true },
      { id: 'hours', label: 'Add your hours', hint: 'H', to: '/b', done: false },
    ])
    card()
    const link = screen.getByRole('link', { name: /Finish setting up/ })
    expect(link).toHaveAttribute('href', '/settings')
    expect(link).toHaveTextContent('Next: add your hours')
    expect(link).toHaveTextContent('1/2')
  })
})
