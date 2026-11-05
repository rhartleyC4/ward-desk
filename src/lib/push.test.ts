import { describe, expect, it } from 'vitest'
import { keyBytes, pushAvailability } from './push'

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
