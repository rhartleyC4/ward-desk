import { describe, expect, it } from 'vitest'
import { nextStep, setupSteps, type SetupFacts } from './setup'

const facts = (extra: Partial<SetupFacts> = {}): SetupFacts => ({ roles: ['bishopric'], office: 'bishop', hasHours: false, passkeys: 0, notifications: 'off', ...extra })
const ids = (f: SetupFacts) => setupSteps(f).map((s) => s.id)

describe('setupSteps', () => {
  it('asks a bishop for hours, Face ID and notifications, in that order', () => {
    expect(ids(facts())).toEqual(['hours', 'passkey', 'notifications'])
    expect(nextStep(setupSteps(facts()))?.id).toBe('hours')
  })

  it('marks steps done from what is already set up', () => {
    const steps = setupSteps(facts({ hasHours: true, passkeys: 2, notifications: 'on' }))
    expect(steps.every((s) => s.done)).toBe(true)
    expect(nextStep(steps)).toBeUndefined()
  })

  it('does not ask a secretary for hours of their own', () => {
    expect(ids(facts({ office: 'executive_secretary' }))).toEqual(['passkey', 'notifications'])
  })

  it('leaves out what this device cannot do', () => {
    expect(ids(facts({ passkeys: null, notifications: null }))).toEqual(['hours'])
  })

  it('asks an iPhone in Safari to add the app to the Home Screen first', () => {
    const step = setupSteps(facts({ notifications: 'install' })).find((s) => s.id === 'notifications')
    expect(step).toMatchObject({ label: 'Add Ward Desk to your Home Screen', done: false })
  })

  it('offers notifications to anyone with a role, since anyone can be sent a request', () => {
    expect(ids(facts({ roles: ['leader'], office: null }))).toEqual(['passkey', 'notifications'])
    expect(ids(facts({ roles: [], office: null }))).toEqual(['passkey'])
  })
})
