/** How the app can be added to this device's home screen. */
export type InstallPlatform = 'installed' | 'ios' | 'other'

export interface DeviceInfo {
  userAgent: string
  maxTouchPoints: number
  /** True when running from the home screen rather than a browser tab. */
  standalone: boolean
}

/**
 * iPhones and iPads have no install prompt, so they get written steps instead.
 * iPadOS reports itself as a Mac, so a touch screen is what gives it away.
 * Everything else ('other') installs through the browser's own prompt, when it offers one.
 */
export function installPlatform({ userAgent, maxTouchPoints, standalone }: DeviceInfo): InstallPlatform {
  if (standalone) return 'installed'
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios'
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios'
  return 'other'
}

export function currentDevice(): DeviceInfo {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: iosStandalone || window.matchMedia('(display-mode: standalone)').matches,
  }
}
