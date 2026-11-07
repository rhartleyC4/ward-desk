// Web Push on this device: whether it can, whether it's on, and turning it on and off. The
// scheduled sender (scripts/notify) does the sending; the service worker shows what arrives
// (public/push-handler.js).

import type { InstallPlatform } from './install'
import { WARD_NAME } from './ward'

/** The VAPID public key for this environment. Without one the app can't subscribe. */
export const vapidPublicKey = (): string => import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

/**
 * What this device can do about notifications, so the page can say what to do next.
 * iPhones only allow them once the app is on the Home Screen, so 'needs-install' comes first there.
 */
export type PushState = 'unconfigured' | 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on'

export function pushAvailability({ platform, supported, permission, configured }: {
  platform: InstallPlatform
  supported: boolean
  permission: NotificationPermission | undefined
  configured: boolean
}): Exclude<PushState, 'off' | 'on'> | 'ready' {
  if (!configured) return 'unconfigured'
  if (platform === 'ios') return 'needs-install'
  if (!supported) return 'unsupported'
  if (permission === 'denied') return 'blocked'
  return 'ready'
}

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** A base64url VAPID key as the bytes PushManager.subscribe wants. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export type DeviceSubscription = { endpoint: string; p256dh: string; auth: string }

/** The parts of a subscription the sender needs. */
export function subscriptionParts(sub: PushSubscription): DeviceSubscription {
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('This browser gave an incomplete push subscription.')
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }
}

async function registration(): Promise<ServiceWorkerRegistration> {
  // The service worker only runs in a built app (`npm run build && npm run preview`), not `npm run dev`.
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('The app’s background worker isn’t running. Reload the page and try again.')), 5000)),
  ])
  return reg
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  return (await registration()).pushManager.getSubscription()
}

/** Asks for permission if needed and subscribes this device. */
export async function subscribeDevice(): Promise<PushSubscription> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications weren’t allowed. You can allow them in this browser’s site settings.')
  const reg = await registration()
  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey()) })
}

/** Shows a notification from this device alone, to check it can display one. Nothing is sent. */
export async function showTestNotification(): Promise<void> {
  const reg = await registration()
  await reg.showNotification(WARD_NAME, { body: 'Notifications are working on this device.', icon: '/pwa-192.png', tag: 'test' })
}
