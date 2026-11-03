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

/** A short name for a passkey made on this device, so the list of devices is readable. */
export function deviceLabel(userAgent: string): string {
  if (/iPhone/.test(userAgent)) return 'iPhone'
  if (/iPad/.test(userAgent)) return 'iPad'
  if (/Android/.test(userAgent)) return /Mobile/.test(userAgent) ? 'Android phone' : 'Android tablet'
  if (/Macintosh/.test(userAgent)) return 'Mac'
  if (/Windows/.test(userAgent)) return 'Windows PC'
  if (/CrOS/.test(userAgent)) return 'Chromebook'
  return 'This device'
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

/**
 * Whether to offer "use Face ID next time" after signing in. Not for the shared practice accounts
 * on the training site, which sign in with the seed password.
 */
export function shouldOfferPasskey(user: { id: string; email?: string | null }, supported = passkeysSupported()): boolean {
  if (!supported) return false
  if (user.email?.toLowerCase().endsWith('@ward.test')) return false
  return passkeyChoice(user.id) === null
}
