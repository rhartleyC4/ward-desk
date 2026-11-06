import { describe, expect, it, vi } from 'vitest'
import { showOnAppIcon } from './appBadge'

const fakeNavigator = () => ({
  setAppBadge: vi.fn(() => Promise.resolve()),
  clearAppBadge: vi.fn(() => Promise.resolve()),
})

describe('showOnAppIcon', () => {
  it('sets the count when something is waiting', () => {
    const nav = fakeNavigator()
    showOnAppIcon(3, nav)
    expect(nav.setAppBadge).toHaveBeenCalledWith(3)
    expect(nav.clearAppBadge).not.toHaveBeenCalled()
  })

  it('clears the badge when nothing is waiting', () => {
    const nav = fakeNavigator()
    showOnAppIcon(0, nav)
    expect(nav.clearAppBadge).toHaveBeenCalled()
    expect(nav.setAppBadge).not.toHaveBeenCalled()
  })

  it('does nothing where the browser has no badge API', () => {
    expect(() => showOnAppIcon(2, {})).not.toThrow()
    expect(() => showOnAppIcon(2, undefined)).not.toThrow()
  })

  it('ignores a refusal from the browser', async () => {
    const nav = { setAppBadge: vi.fn(() => Promise.reject(new Error('not allowed'))), clearAppBadge: vi.fn(() => Promise.resolve()) }
    showOnAppIcon(1, nav)
    await Promise.resolve()
    expect(nav.setAppBadge).toHaveBeenCalled()
  })
})
