import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstallPlatform } from '../lib/install'
import { NotificationsCard, type NotificationActions } from './NotificationsCard'

const device = vi.hoisted(() => ({ platform: 'other' as InstallPlatform, key: 'key' }))
vi.mock('../lib/install', () => ({ currentDevice: () => ({}), installPlatform: () => device.platform }))
vi.mock('../lib/push', async (actual) => ({
  ...(await actual<typeof import('../lib/push')>()),
  pushSupported: () => true,
  vapidPublicKey: () => device.key,
}))

const actions = (on = false): NotificationActions => ({
  status: vi.fn(async () => on),
  turnOn: vi.fn(async () => {}),
  turnOff: vi.fn(async () => {}),
  test: vi.fn(async () => {}),
})

beforeEach(() => {
  device.platform = 'other'
  device.key = 'key'
  vi.stubGlobal('Notification', { permission: 'default' })
})
afterEach(() => vi.unstubAllGlobals())

describe('NotificationsCard', () => {
  it('turns the summary on for this device', async () => {
    const a = actions()
    render(<NotificationsCard actions={a} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on for this device' }))
    expect(a.turnOn).toHaveBeenCalledOnce()
    expect(screen.getByText('On for this device.')).toBeInTheDocument()
  })

  it('shows a test and turns off when already on', async () => {
    const a = actions(true)
    render(<NotificationsCard actions={a} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Show a test' }))
    expect(a.test).toHaveBeenCalledOnce()
    expect(screen.getByText(/If no test appeared/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }))
    expect(a.turnOff).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Turn on for this device' })).toBeInTheDocument()
  })

  it('shows why turning on failed', async () => {
    const a = { ...actions(), turnOn: vi.fn(async () => Promise.reject(new Error('Notifications weren’t allowed.'))) }
    render(<NotificationsCard actions={a} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on for this device' }))
    expect(screen.getByText('Notifications weren’t allowed.')).toBeInTheDocument()
    expect(screen.queryByText('On for this device.')).not.toBeInTheDocument()
  })

  it('tells an iPhone in a browser tab to use the Home Screen app', () => {
    device.platform = 'ios'
    const a = actions()
    render(<NotificationsCard actions={a} />)
    expect(screen.getByText(/only work from the Home Screen/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(a.status).not.toHaveBeenCalled()
  })

  it('says so when the site has no push key', () => {
    device.key = ''
    render(<NotificationsCard actions={actions()} />)
    expect(screen.getByText(/aren’t set up on this site/)).toBeInTheDocument()
  })
})
