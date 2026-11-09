import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import * as passkeys from '../lib/passkeys'
import * as push from '../lib/push'
import * as q from '../lib/queries'
import { supabase } from '../lib/supabase'
import { AccountPage } from './AccountPage'

type Props = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const stub = vi.hoisted(() => ({ auth: {} as Record<string, unknown>, cards: {} as Record<string, Record<string, unknown>> }))

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => stub.auth }))
vi.mock('../lib/supabase', () => ({ supabase: { client: true }, WARD_TIME_ZONE: 'America/Denver' }))
vi.mock('../lib/errorReport')
vi.mock('../lib/queries')
vi.mock('../lib/push')
vi.mock('../lib/passkeys', async (original) => ({
  ...(await original<object>()),
  passkeysSupported: vi.fn(),
  rememberPasskeyChoice: vi.fn(),
  rememberThisDevicePasskey: vi.fn(),
  thisDevicePasskey: vi.fn(),
}))
vi.mock('../components/NotificationsCard', () => ({
  NotificationsCard: (p: Record<string, unknown>) => {
    stub.cards.notifications = p
    return <div>notifications card</div>
  },
}))
vi.mock('../components/NotificationChoices', () => ({
  NotificationChoices: (p: Record<string, unknown>) => {
    stub.cards.choices = p
    return <div>notification choices</div>
  },
}))

const setDisplayName = vi.fn()
const passkey = { id: 'p1', friendly_name: 'iPhone', created_at: '2026-03-01T12:00:00Z', last_used_at: '2026-04-01T12:00:00Z' }

const open = async () => {
  render(<AccountPage />)
  await screen.findByRole('heading', { name: 'You' })
}

beforeEach(() => {
  vi.resetAllMocks()
  stub.auth = { session: { user: { id: 'me' } }, profile: { display_name: 'Avery' }, roles: ['bishopric'], office: 'bishop', actingFor: null, setDisplayName, mentoring: [], mentoredBy: [] }
  stub.cards = {}
  vi.mocked(q.listPasskeys).mockResolvedValue([passkey] as never)
  vi.mocked(passkeys.passkeysSupported).mockReturnValue(true)
})

describe('AccountPage', () => {
  it('shows why when passkeys can\'t load', async () => {
    vi.mocked(q.listPasskeys).mockRejectedValue(new Error('load failed'))
    render(<AccountPage />)
    expect(await screen.findByText('load failed')).toBeInTheDocument()
  })

  describe('your name', () => {
    const box = () => screen.getByRole('textbox', { name: 'Your name' })
    const saveButton = () => screen.getByRole('button', { name: 'Save' })

    it('needs a change before saving', async () => {
      await open()
      expect(saveButton()).toBeDisabled()
    })

    it('saves the new name, cleaned up, and says so', async () => {
      vi.mocked(q.updateMyName).mockResolvedValue('Brother Avery')
      await open()
      await userEvent.clear(box())
      await userEvent.type(box(), 'Brother Avery')
      await userEvent.click(saveButton())
      expect(q.updateMyName).toHaveBeenCalledWith(supabase, 'me', 'Brother Avery')
      expect(setDisplayName).toHaveBeenCalledWith('Brother Avery')
      expect(await screen.findByText('Saved.')).toBeInTheDocument()
    })

    it('stops saying saved once it changes again', async () => {
      vi.mocked(q.updateMyName).mockResolvedValue('Brother Avery')
      await open()
      await userEvent.clear(box())
      await userEvent.type(box(), 'Brother Avery{Enter}')
      await screen.findByText('Saved.')
      await userEvent.type(box(), 'x')
      expect(screen.queryByText('Saved.')).not.toBeInTheDocument()
    })

    it('won\'t save an empty name, and says why', async () => {
      await open()
      await userEvent.clear(box())
      expect(saveButton()).toBeDisabled()
      expect(box()).toBeInvalid()
      await userEvent.type(box(), '{Enter}')
      expect(q.updateMyName).not.toHaveBeenCalled()
    })

    it('keeps the name typed when saving fails', async () => {
      vi.mocked(q.updateMyName).mockRejectedValue(new Error('refused'))
      await open()
      await userEvent.clear(box())
      await userEvent.type(box(), 'Brother Avery')
      await userEvent.click(saveButton())
      expect(await screen.findByText('refused')).toBeInTheDocument()
      expect(setDisplayName).not.toHaveBeenCalled()
      expect(box()).toHaveValue('Brother Avery')
    })

    it('starts empty without a profile', async () => {
      stub.auth = { ...stub.auth, profile: null }
      await open()
      expect(box()).toHaveValue('')
    })

    it('is replaced by a note while acting for someone', async () => {
      stub.auth = { ...stub.auth, actingFor: { for_id: 'x', name: 'Bishop', ends_at: '2026-12-01' }, mentoring: [] }
      await open()
      expect(screen.queryByRole('textbox', { name: 'Your name' })).not.toBeInTheDocument()
      expect(screen.getByText('Choose Yourself to change your name and notifications.')).toBeInTheDocument()
    })
  })

  describe('passkeys', () => {
    it('lists each with when it was added and used', async () => {
      await open()
      expect(screen.getByText('iPhone')).toBeInTheDocument()
      expect(screen.getByText(/Added .* · last used /)).toBeInTheDocument()
    })

    it('names one with no name, and leaves out a last use it never had', async () => {
      vi.mocked(q.listPasskeys).mockResolvedValue([{ id: 'p2', created_at: '2026-03-01T12:00:00Z' }] as never)
      await open()
      expect(screen.getByText('Passkey')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Remove passkey' })).toBeInTheDocument()
      expect(screen.queryByText(/last used/)).not.toBeInTheDocument()
    })

    it('says when there are none', async () => {
      vi.mocked(q.listPasskeys).mockResolvedValue([])
      await open()
      expect(screen.getByText('None yet.')).toBeInTheDocument()
    })

    it('sets up this device and remembers the choice', async () => {
      vi.mocked(q.registerPasskey).mockResolvedValue('p9')
      await open()
      await userEvent.click(screen.getByRole('button', { name: 'Set up this device' }))
      expect(q.registerPasskey).toHaveBeenCalledWith(supabase, expect.any(String))
      expect(passkeys.rememberPasskeyChoice).toHaveBeenCalledWith('me', 'ready')
      expect(passkeys.rememberThisDevicePasskey).toHaveBeenCalledWith('me', 'p9')
      await waitFor(() => expect(q.listPasskeys).toHaveBeenCalledTimes(2))
    })

    it('marks the one made on this device', async () => {
      vi.mocked(passkeys.thisDevicePasskey).mockReturnValue('p2')
      vi.mocked(q.listPasskeys).mockResolvedValue([passkey, { id: 'p2', friendly_name: 'Mac', created_at: '2026-03-01T12:00:00Z' }] as never)
      await open()
      const tagged = screen.getByText('This device').closest('tr')
      expect(tagged).toHaveTextContent('Mac')
      expect(tagged).not.toHaveTextContent('iPhone')
      expect(screen.getAllByText('This device')).toHaveLength(1)
    })

    describe('renaming', () => {
      const box = () => screen.getByRole('textbox', { name: 'Device name' })
      const saveName = () => screen.getByRole('button', { name: 'Save device name' })
      const startRename = async () => {
        await open()
        await userEvent.click(screen.getByRole('button', { name: 'Rename iPhone' }))
      }

      it('saves the new name, trimmed, and refreshes', async () => {
        await startRename()
        expect(box()).toHaveValue('iPhone')
        await userEvent.clear(box())
        await userEvent.type(box(), '  Work phone {Enter}')
        expect(q.renamePasskey).toHaveBeenCalledWith(supabase, 'p1', 'Work phone')
        await waitFor(() => expect(q.listPasskeys).toHaveBeenCalledTimes(2))
        expect(screen.queryByRole('textbox', { name: 'Device name' })).not.toBeInTheDocument()
      })

      it('needs a name', async () => {
        await startRename()
        await userEvent.clear(box())
        expect(saveName()).toBeDisabled()
        await userEvent.type(box(), '   {Enter}')
        expect(q.renamePasskey).not.toHaveBeenCalled()
      })

      it('closes without saving when nothing changed', async () => {
        await startRename()
        await userEvent.click(saveName())
        expect(q.renamePasskey).not.toHaveBeenCalled()
        expect(screen.queryByRole('textbox', { name: 'Device name' })).not.toBeInTheDocument()
      })

      it('can be cancelled with the button or Escape', async () => {
        await startRename()
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(screen.getByText('iPhone')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Rename iPhone' }))
        await userEvent.type(box(), 'x{Escape}')
        expect(screen.getByText('iPhone')).toBeInTheDocument()
        expect(q.renamePasskey).not.toHaveBeenCalled()
      })

      it('keeps the form open and says why when saving fails', async () => {
        vi.mocked(q.renamePasskey).mockRejectedValue(new Error('refused'))
        await startRename()
        await userEvent.type(box(), ' 2{Enter}')
        expect(await screen.findByText('refused')).toBeInTheDocument()
        expect(box()).toHaveValue('iPhone 2')
        expect(q.listPasskeys).toHaveBeenCalledOnce()
      })

      it('starts empty for one with no name', async () => {
        vi.mocked(q.listPasskeys).mockResolvedValue([{ id: 'p2', created_at: '2026-03-01T12:00:00Z' }] as never)
        await open()
        await userEvent.click(screen.getByRole('button', { name: 'Rename passkey' }))
        expect(box()).toHaveValue('')
      })
    })

    it('shows why a device could not be set up', async () => {
      vi.mocked(q.registerPasskey).mockRejectedValue(new Error('refused'))
      await open()
      await userEvent.click(screen.getByRole('button', { name: 'Set up this device' }))
      expect(await screen.findByText('refused')).toBeInTheDocument()
      expect(passkeys.rememberPasskeyChoice).not.toHaveBeenCalled()
    })

    it('says when this browser can\'t use them', async () => {
      vi.mocked(passkeys.passkeysSupported).mockReturnValue(false)
      await open()
      expect(screen.queryByRole('button', { name: 'Set up this device' })).not.toBeInTheDocument()
      expect(screen.getByText("This browser can't use Face ID or fingerprint sign-in.")).toBeInTheDocument()
    })

    it('removes one and refreshes', async () => {
      await open()
      await userEvent.click(screen.getByRole('button', { name: 'Remove iPhone' }))
      expect(q.deletePasskey).toHaveBeenCalledWith(supabase, 'p1')
      await waitFor(() => expect(q.listPasskeys).toHaveBeenCalledTimes(2))
    })

    it('does not refresh when removing fails', async () => {
      vi.mocked(q.deletePasskey).mockRejectedValue(new Error('refused'))
      await open()
      await userEvent.click(screen.getByRole('button', { name: 'Remove iPhone' }))
      expect(await screen.findByText('refused')).toBeInTheDocument()
      expect(q.listPasskeys).toHaveBeenCalledOnce()
    })
  })

  describe('notifications', () => {
    const notify = () => stub.cards.notifications as Props
    const sub = { endpoint: 'https://push.test/1', unsubscribe: vi.fn() }

    it('only shows for someone with a role', async () => {
      stub.auth = { ...stub.auth, roles: [] }
      await open()
      expect(screen.queryByText('notifications card')).not.toBeInTheDocument()
    })

    it('does not show while acting for someone', async () => {
      stub.auth = { ...stub.auth, actingFor: { for_id: 'x', name: 'B', ends_at: '2026-12-01' } }
      await open()
      expect(screen.queryByText('notifications card')).not.toBeInTheDocument()
    })

    it('is off when this device has no subscription', async () => {
      await open()
      vi.mocked(push.currentSubscription).mockResolvedValue(null)
      await expect(notify().actions.status()).resolves.toBe(false)
      expect(q.hasPushSubscription).not.toHaveBeenCalled()
    })

    it('is only on when the subscription is saved for this person', async () => {
      await open()
      vi.mocked(push.currentSubscription).mockResolvedValue(sub as never)
      vi.mocked(q.hasPushSubscription).mockResolvedValue(true)
      await expect(notify().actions.status()).resolves.toBe(true)
      expect(q.hasPushSubscription).toHaveBeenCalledWith(supabase, sub.endpoint)
    })

    it('subscribes this device and saves it', async () => {
      await open()
      const parts = { endpoint: 'e', p256dh: 'k', auth: 'a' }
      vi.mocked(push.subscribeDevice).mockResolvedValue(sub as never)
      vi.mocked(push.subscriptionParts).mockReturnValue(parts)
      await notify().actions.turnOn()
      expect(q.savePushSubscription).toHaveBeenCalledWith(supabase, parts)
    })

    it('forgets the device, then unsubscribes it', async () => {
      await open()
      vi.mocked(push.currentSubscription).mockResolvedValue(sub as never)
      await notify().actions.turnOff()
      expect(q.deletePushSubscription).toHaveBeenCalledWith(supabase, sub.endpoint)
      expect(sub.unsubscribe).toHaveBeenCalled()
    })

    it('has nothing to do turning off a device that isn\'t on', async () => {
      await open()
      vi.mocked(push.currentSubscription).mockResolvedValue(null)
      await notify().actions.turnOff()
      expect(q.deletePushSubscription).not.toHaveBeenCalled()
    })

    it('loads and saves the choices', async () => {
      await open()
      const { actions, roles, office } = stub.cards.choices as Props
      expect({ roles, office }).toEqual({ roles: ['bishopric'], office: 'bishop' })
      actions.load()
      expect(q.loadMutedNotifications as Mock).toHaveBeenCalledWith(supabase)
      actions.set('day_summary', false)
      expect(q.setNotificationOn).toHaveBeenCalledWith(supabase, 'day_summary', false)
    })
  })
})
