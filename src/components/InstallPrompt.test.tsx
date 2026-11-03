import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstallPrompt } from './InstallPrompt'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'

afterEach(() => {
  vi.restoreAllMocks()
})

function fireInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome }),
  })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

describe('InstallPrompt', () => {
  it('shows home screen steps on an iPhone', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
    render(<InstallPrompt />)
    expect(screen.getByText(/add to home screen/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument()
  })

  it('shows nothing until the browser offers to install', () => {
    render(<InstallPrompt />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('opens the browser prompt from the Install button', async () => {
    const user = userEvent.setup()
    render(<InstallPrompt />)
    const event = fireInstallPrompt()
    expect(event.defaultPrevented).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Install' }))
    expect(event.prompt).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('stays hidden once dismissed', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
    const { unmount } = render(<InstallPrompt />)
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    unmount()
    render(<InstallPrompt />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows nothing when already opened from the home screen', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
    vi.mocked(window.matchMedia).mockReturnValueOnce({ matches: true } as MediaQueryList)
    render(<InstallPrompt />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
