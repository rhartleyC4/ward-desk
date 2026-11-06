// The "Finish setting up" checklist: the few one-time steps that make Ward Desk work for someone,
// in the order to do them. Each step only shows when it applies to this person on this device.

import { canEditHours, type AppRole } from './access'
import { keepsHours } from './availability'
import type { Enums } from './database.types'

export type SetupStep = {
  id: 'hours' | 'passkey' | 'notifications'
  label: string
  /** One line on why, shown under the label. */
  hint: string
  to: string
  done: boolean
}

export type SetupFacts = {
  roles: AppRole[]
  office: Enums<'bishopric_office'> | null
  hasHours: boolean
  /** Face ID or fingerprint sign-ins saved for this person; null when unknown or the device can't. */
  passkeys: number | null
  /**
   * Whether the day-ahead summary is on for this device. 'install' means an iPhone that has to add
   * the app to the Home Screen first. null when unknown or the device can't show notifications.
   */
  notifications: 'on' | 'off' | 'install' | null
}

export function setupSteps({ roles, office, hasHours, passkeys, notifications }: SetupFacts): SetupStep[] {
  const steps: SetupStep[] = []
  if (keepsHours(office) && canEditHours(roles)) {
    steps.push({ id: 'hours', label: 'Set your appointment hours', hint: 'So the secretaries know when to book you', to: '/hours', done: hasHours })
  }
  if (passkeys !== null) {
    steps.push({ id: 'passkey', label: 'Turn on Face ID or fingerprint', hint: 'Sign in without waiting for an email', to: '/account', done: passkeys > 0 })
  }
  // Anyone can be sent a request, so everyone with a role is offered notifications.
  if (notifications !== null && roles.length > 0) {
    steps.push({
      id: 'notifications',
      label: notifications === 'install' ? 'Add Ward Desk to your Home Screen' : 'Turn on notifications',
      hint: notifications === 'install' ? 'iPhones only send notifications to Home Screen apps' : 'Requests, appointments and your day, as they happen',
      to: '/account',
      done: notifications === 'on',
    })
  }
  return steps
}

/** The first step still to do, if any. */
export const nextStep = (steps: SetupStep[]) => steps.find((s) => !s.done)
