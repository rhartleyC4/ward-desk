import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentSubscription, keyBytes, pushAvailability, pushSupported, showTestNotification, subscribeDevice, subscriptionParts, vapidPublicKey } from './push'

describe('pushAvailability', () => {
  const ready = { platform: 'other' as const, supported: true, permission: 'default' as const, configured: true }

  it('is ready on a browser that can push', () => {
    expect(pushAvailability(ready)).toBe('ready')
    expect(pushAvailability({ ...ready, platform: 'installed', permission: 'granted' })).toBe('ready')
  })

  it('asks an iPhone in a browser tab to add the app to the Home Screen first', () => {
    expect(pushAvailability({ ...ready, platform: 'ios', supported: false })).toBe('needs-install')
  })

  it('says when the browser cannot, or the person blocked it', () => {
    expect(pushAvailability({ ...ready, supported: false, permission: undefined })).toBe('unsupported')
    expect(pushAvailability({ ...ready, permission: 'denied' })).toBe('blocked')
  })

  it('says when the site has no push key', () => {
    expect(pushAvailability({ ...ready, configured: false })).toBe('unconfigured')
  })
})

describe('keyBytes', () => {
  it('decodes base64url without padding', () => {
    expect([...keyBytes('-_8')]).toEqual([0xfb, 0xff])
    expect([...keyBytes('AQID')]).toEqual([1, 2, 3])
  })
})

describe('subscriptionParts', () => {
  const sub = (json: object) => ({ toJSON: () => json }) as PushSubscription

  it('takes what the sender needs', () => {
    expect(subscriptionParts(sub({ endpoint: 'e', keys: { p256dh: 'k', auth: 'a' } }))).toEqual({ endpoint: 'e', p256dh: 'k', auth: 'a' })
  })

  it.each([
    ['no endpoint', { keys: { p256dh: 'k', auth: 'a' } }],
    ['no keys', { endpoint: 'e' }],
    ['no public key', { endpoint: 'e', keys: { auth: 'a' } }],
    ['no auth', { endpoint: 'e', keys: { p256dh: 'k' } }],
  ])('refuses one with %s', (_name, json) => {
    expect(() => subscriptionParts(sub(json))).toThrow('incomplete push subscription')
  })
})

describe('on a device', () => {
  const pushManager = { getSubscription: vi.fn(), subscribe: vi.fn() }
  const registration = { pushManager, showNotification: vi.fn() }
  const requestPermission = vi.fn()

  const support = (reg: Promise<unknown> = Promise.resolve(registration)) => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: reg } })
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', { requestPermission })
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AAEC')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  it('reads the key for this environment', () => {
    expect(vapidPublicKey()).toBe('AAEC')
  })

  it('is empty when there is no key', () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', undefined as never)
    expect(vapidPublicKey()).toBe('')
  })

  it('knows when push is missing', () => {
    expect(pushSupported()).toBe(false)
  })

  it('knows when push is there', () => {
    support()
    expect(pushSupported()).toBe(true)
  })

  it('has no subscription where push isn\'t supported', async () => {
    await expect(currentSubscription()).resolves.toBeNull()
  })

  it('finds the current subscription', async () => {
    support()
    pushManager.getSubscription.mockResolvedValue('sub')
    await expect(currentSubscription()).resolves.toBe('sub')
  })

  it('gives up if the background worker never starts', async () => {
    vi.useFakeTimers()
    support(new Promise(() => {}))
    const result = expect(currentSubscription()).rejects.toThrow('background worker')
    await vi.advanceTimersByTimeAsync(5000)
    await result
  })

  it('won\'t subscribe without permission', async () => {
    support()
    requestPermission.mockResolvedValue('denied')
    await expect(subscribeDevice()).rejects.toThrow('weren’t allowed')
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('reuses an existing subscription', async () => {
    support()
    requestPermission.mockResolvedValue('granted')
    pushManager.getSubscription.mockResolvedValue('existing')
    await expect(subscribeDevice()).resolves.toBe('existing')
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('subscribes with this environment\'s key', async () => {
    support()
    requestPermission.mockResolvedValue('granted')
    pushManager.getSubscription.mockResolvedValue(null)
    pushManager.subscribe.mockResolvedValue('new')
    await expect(subscribeDevice()).resolves.toBe('new')
    const options = pushManager.subscribe.mock.calls[0][0]
    expect(options.userVisibleOnly).toBe(true)
    expect([...options.applicationServerKey]).toEqual([0, 1, 2])
  })

  it('shows a test notification from this device', async () => {
    support()
    await showTestNotification()
    expect(registration.showNotification).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ tag: 'test' }))
  })
})
