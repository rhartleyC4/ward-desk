import { describe, expect, it } from 'vitest'
import { deviceLabel, PasskeyCancelled, rememberPasskeyChoice, shouldOfferPasskey, toPasskeyError } from './passkeys'

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
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15', 'iPhone'],
    ['Mozilla/5.0 (iPad; CPU OS 26_1 like Mac OS X)', 'iPad'],
    ['Mozilla/5.0 (Linux; Android 16; Pixel 10) Mobile Safari/537.36', 'Android phone'],
    ['Mozilla/5.0 (Linux; Android 16; Tab S11) Safari/537.36', 'Android tablet'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Mac'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Windows PC'],
    ['curl/8.0', 'This device'],
  ])('names %s', (ua, label) => {
    expect(deviceLabel(ua)).toBe(label)
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
