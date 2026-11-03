import { describe, expect, it } from 'vitest'
import { installPlatform } from './install'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'

describe('installPlatform', () => {
  it('reports an installed app as installed on any device', () => {
    expect(installPlatform({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true })).toBe('installed')
    expect(installPlatform({ userAgent: ANDROID, maxTouchPoints: 5, standalone: true })).toBe('installed')
  })

  it('treats iPhones as iOS', () => {
    expect(installPlatform({ userAgent: IPHONE, maxTouchPoints: 5, standalone: false })).toBe('ios')
  })

  it('treats an iPad, which reports itself as a Mac, as iOS', () => {
    expect(installPlatform({ userAgent: IPAD, maxTouchPoints: 5, standalone: false })).toBe('ios')
  })

  it('treats a real Mac as other', () => {
    expect(installPlatform({ userAgent: IPAD, maxTouchPoints: 0, standalone: false })).toBe('other')
  })

  it('treats Android as other, since its browser offers its own prompt', () => {
    expect(installPlatform({ userAgent: ANDROID, maxTouchPoints: 5, standalone: false })).toBe('other')
  })
})
