import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeThisDevice, deviceLabel, PasskeyCancelled, rememberPasskeyChoice, rememberThisDevicePasskey, shouldOfferPasskey, thisDevicePasskey, toPasskeyError } from './passkeys'

describe('toPasskeyError', () => {
  it('treats a closed prompt as a cancel, not an error', () => {
    const notAllowed = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    expect(toPasskeyError({ message: 'denied', code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', cause: notAllowed })).toBeInstanceOf(PasskeyCancelled)
    expect(toPasskeyError({ message: 'aborted', code: 'ERROR_CEREMONY_ABORTED' })).toBeInstanceOf(PasskeyCancelled)
    expect(new PasskeyCancelled().message).toBe('')
  })

  it('explains a device that is already set up', () => {
    expect(toPasskeyError({ message: 'x', code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' }).message).toMatch(/already set up/)
  })

  it('explains a browser without passkeys', () => {
    expect(toPasskeyError({ message: 'Browser does not support WebAuthn' }).message).toMatch(/can't use Face ID/)
  })

  it('passes other errors through', () => {
    expect(toPasskeyError({ message: 'Passkey not found' }).message).toBe('Passkey not found')
  })
})

describe('deviceLabel', () => {
  const macSafari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15'
  const androidChrome = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'

  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1', 'iPhone · Safari · iOS 26'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', 'iPhone'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.0.0 Mobile/15E148 Safari/604.1', 'iPhone · Chrome'],
    ['Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1', 'iPad · Safari · iPadOS 26'],
    [androidChrome, 'Android phone · Chrome'],
    ['Mozilla/5.0 (Linux; Android 16; Tab S11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36', 'Android tablet · Chrome'],
    ['Mozilla/5.0 (Linux; Android 16; SM-S931U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36', 'Android phone · Samsung Internet'],
    ['Mozilla/5.0 (Android 16; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0', 'Android phone · Firefox'],
    [macSafari, 'Mac · Safari'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 OPR/125.0', 'Mac · Opera'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0', 'Windows PC · Edge'],
    ['Mozilla/5.0 (X11; CrOS x86_64 16000.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36', 'Chromebook · Chrome'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36', 'Linux computer · Chrome'],
    ['curl/8.0', 'Unknown device'],
  ])('names %s', (ua, label) => {
    expect(deviceLabel(ua)).toBe(label)
  })

  it('spots an iPad asking for the desktop site', () => {
    expect(deviceLabel(macSafari, { touchPoints: 5 })).toBe('iPad · Safari · iPadOS 26')
    expect(deviceLabel(macSafari, { touchPoints: 0 })).toBe('Mac · Safari')
  })

  it('uses the model and system version from an Android browser', () => {
    expect(deviceLabel(androidChrome, { model: 'Pixel 10', platformVersion: '16.0.0' })).toBe('Pixel 10 · Chrome · Android 16')
    expect(deviceLabel(androidChrome, { model: '', platformVersion: '' })).toBe('Android phone · Chrome')
  })

  it('ignores a model on anything but Android', () => {
    expect(deviceLabel(macSafari, { model: 'Something', platformVersion: '15.0.0' })).toBe('Mac · Safari')
  })
})

describe('describeThisDevice', () => {
  const browser = (userAgentData?: unknown) => vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 10; K) Chrome/142.0.0.0 Mobile Safari/537.36', maxTouchPoints: 5, userAgentData })
  afterEach(() => vi.unstubAllGlobals())

  it('asks the browser for details when it can', async () => {
    browser({ getHighEntropyValues: async () => ({ model: 'Pixel 10', platformVersion: '16.0.0' }) })
    await expect(describeThisDevice()).resolves.toBe('Pixel 10 · Chrome · Android 16')
  })

  it('names the device without them when the browser has none or refuses', async () => {
    browser()
    await expect(describeThisDevice()).resolves.toBe('Android phone · Chrome')
    browser({ getHighEntropyValues: async () => { throw new Error('denied') } })
    await expect(describeThisDevice()).resolves.toBe('Android phone · Chrome')
  })
})

describe('thisDevicePasskey', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('remembers the passkey made here, per person', () => {
    expect(thisDevicePasskey('u1')).toBeNull()
    rememberThisDevicePasskey('u1', 'p1')
    expect(thisDevicePasskey('u1')).toBe('p1')
    expect(thisDevicePasskey('u2')).toBeNull()
  })

  it('does without when storage is blocked', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    expect(() => rememberThisDevicePasskey('u1', 'p1')).not.toThrow()
    expect(thisDevicePasskey('u1')).toBeNull()
  })
})

describe('shouldOfferPasskey', () => {
  const user = { id: 'u1', email: 'someone@example.com' }

  it('offers once until this device is set up or dismissed', () => {
    expect(shouldOfferPasskey(user, true)).toBe(true)
    rememberPasskeyChoice('u1', 'dismissed')
    expect(shouldOfferPasskey(user, true)).toBe(false)
    expect(shouldOfferPasskey({ id: 'u2', email: 'other@example.com' }, true)).toBe(true)
    rememberPasskeyChoice('u2', 'ready')
    expect(shouldOfferPasskey({ id: 'u2', email: 'other@example.com' }, true)).toBe(false)
  })

  it('never offers when the browser has no passkeys', () => {
    expect(shouldOfferPasskey(user, false)).toBe(false)
  })

  it('skips the shared practice accounts', () => {
    expect(shouldOfferPasskey({ id: 'u3', email: 'Bishop@ward.test' }, true)).toBe(false)
  })
})
