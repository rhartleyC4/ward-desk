// Passkeys let someone sign in with Face ID, Touch ID, a fingerprint or the device PIN after their
// first email-link or Google sign-in. Supabase Auth holds the passkeys; this file is the pure logic.

/** Thrown when the person closes the Face ID / fingerprint prompt. Its message is empty so nothing shows as an error. */
export class PasskeyCancelled extends Error {
  constructor() {
    super('')
    this.name = 'PasskeyCancelled'
  }
}

type PasskeyFailure = { message: string; code?: string; cause?: unknown }

/** Turns a failed passkey call into an error a person can act on, or PasskeyCancelled if they backed out. */
export function toPasskeyError(error: PasskeyFailure): Error {
  const cause = (error.cause as { name?: string } | undefined)?.name
  // Browsers report "the person closed the prompt" and "no passkey here" the same way, as NotAllowedError.
  if (error.code === 'ERROR_CEREMONY_ABORTED' || cause === 'NotAllowedError' || cause === 'AbortError') {
    return new PasskeyCancelled()
  }
  if (error.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
    return new Error('This device is already set up. You can sign in with it next time.')
  }
  if (/not support webauthn/i.test(error.message)) {
    return new Error("This browser can't use Face ID or fingerprint sign-in.")
  }
  return new Error(error.message)
}

/** True when the browser can create and use passkeys at all. */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function'
}

/** The longest name Supabase accepts for a passkey. */
export const PASSKEY_NAME_MAX = 120

/** What the browser can say about the device beyond its user agent. */
export type DeviceHints = { touchPoints?: number; model?: string; platformVersion?: string }

function browserName(userAgent: string): string | null {
  // Most browsers also claim to be Chrome or Safari, so the specific ones come first.
  if (/Edg(e|A|iOS)?\//.test(userAgent)) return 'Edge'
  if (/SamsungBrowser\//.test(userAgent)) return 'Samsung Internet'
  if (/OPR\/|OPiOS\//.test(userAgent)) return 'Opera'
  if (/Firefox\/|FxiOS\//.test(userAgent)) return 'Firefox'
  if (/Chrome\/|CriOS\//.test(userAgent)) return 'Chrome'
  // An app installed to the iPhone Home Screen names no browser at all.
  if (/Safari\//.test(userAgent)) return 'Safari'
  return null
}

function deviceKind(userAgent: string, hints: DeviceHints): string {
  if (/iPhone/.test(userAgent)) return 'iPhone'
  // iPads ask for desktop sites by default and report themselves as Macs, but no Mac has a touch screen.
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && (hints.touchPoints ?? 0) > 1)) return 'iPad'
  if (/Android/.test(userAgent)) return hints.model || (/Mobile/.test(userAgent) ? 'Android phone' : 'Android tablet')
  if (/Macintosh/.test(userAgent)) return 'Mac'
  if (/Windows/.test(userAgent)) return 'Windows PC'
  if (/CrOS/.test(userAgent)) return 'Chromebook'
  if (/Linux/.test(userAgent)) return 'Linux computer'
  return 'Unknown device'
}

function systemVersion(device: string, browser: string | null, userAgent: string, hints: DeviceHints): string | null {
  // iOS 26 froze the system version in the user agent. Safari's own version still matches the system.
  if ((device === 'iPhone' || device === 'iPad') && browser === 'Safari') {
    const version = /Version\/(\d+)/.exec(userAgent)?.[1]
    return version ? `${device === 'iPhone' ? 'iOS' : 'iPadOS'} ${version}` : null
  }
  // Chrome reports every Android as version 10 in the user agent, so only the hint can be trusted.
  const android = /Android/.test(userAgent) && hints.platformVersion?.split('.')[0]
  return android ? `Android ${android}` : null
}

/** A name for a passkey made on this device, as detailed as the browser allows: "iPhone · Safari · iOS 26". */
export function deviceLabel(userAgent: string, hints: DeviceHints = {}): string {
  const device = deviceKind(userAgent, hints)
  const browser = browserName(userAgent)
  return [device, browser, systemVersion(device, browser, userAgent, hints)].filter(Boolean).join(' · ')
}

type UserAgentData = { getHighEntropyValues(hints: string[]): Promise<{ model?: string; platformVersion?: string }> }

/** Names this device, asking browsers that support it (Chrome and Edge) for the model and system version. */
export async function describeThisDevice(): Promise<string> {
  const { userAgent, maxTouchPoints, userAgentData } = navigator as Navigator & { userAgentData?: UserAgentData }
  let details: DeviceHints = {}
  try {
    details = (await userAgentData?.getHighEntropyValues(['model', 'platformVersion'])) ?? {}
  } catch {
    // The name is only less detailed without these.
  }
  return deviceLabel(userAgent, { ...details, touchPoints: maxTouchPoints })
}

// Whether this device already has a passkey or the person said "not now", remembered per user.
// Kept in the browser because it's about this device, not the account.
type DeviceChoice = 'ready' | 'dismissed'
const choiceKey = (userId: string) => `ward-desk:passkey:${userId}`

export function rememberPasskeyChoice(userId: string, choice: DeviceChoice) {
  try {
    localStorage.setItem(choiceKey(userId), choice)
  } catch {
    // Storage blocked (private browsing): the offer just shows again next time.
  }
}

function passkeyChoice(userId: string): DeviceChoice | null {
  try {
    return localStorage.getItem(choiceKey(userId)) as DeviceChoice | null
  } catch {
    // Can't remember a "not now" here, so don't nag on every visit.
    return 'dismissed'
  }
}

const thisDeviceKey = (userId: string) => `ward-desk:passkey-here:${userId}`

/** Remembers which saved passkey was made here, so the list can point it out. */
export function rememberThisDevicePasskey(userId: string, passkeyId: string) {
  try {
    localStorage.setItem(thisDeviceKey(userId), passkeyId)
  } catch {
    // Storage blocked (private browsing): the list just won't mark this device.
  }
}

export function thisDevicePasskey(userId: string): string | null {
  try {
    return localStorage.getItem(thisDeviceKey(userId))
  } catch {
    return null
  }
}

/** The seeded practice accounts, which many people share, so a device's Face ID doesn't belong on them. */
export const isSharedPracticeAccount = (email?: string | null) => !!email?.toLowerCase().endsWith('@ward.test')

/**
 * Whether to offer "use Face ID next time" after signing in. Not for the shared practice accounts
 * on the training site, which sign in with the seed password.
 */
export function shouldOfferPasskey(user: { id: string; email?: string | null }, supported = passkeysSupported()): boolean {
  if (!supported) return false
  if (isSharedPracticeAccount(user.email)) return false
  return passkeyChoice(user.id) === null
}
