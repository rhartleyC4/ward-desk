import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnvironmentBanner } from './EnvironmentBanner'

afterEach(() => {
  vi.unstubAllEnvs()
  sessionStorage.clear()
})

describe('EnvironmentBanner', () => {
  it('warns on the training site', () => {
    vi.stubEnv('VITE_APP_ENV', 'staging')
    render(<EnvironmentBanner />)
    expect(screen.getByRole('status')).toHaveTextContent(/training site/i)
  })

  it('hides when closed, and stays hidden for the rest of the session', () => {
    vi.stubEnv('VITE_APP_ENV', 'staging')
    const { unmount } = render(<EnvironmentBanner />)
    fireEvent.click(screen.getByRole('button', { name: /hide training notice/i }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    unmount()
    render(<EnvironmentBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('comes back in a new session', () => {
    vi.stubEnv('VITE_APP_ENV', 'staging')
    const { unmount } = render(<EnvironmentBanner />)
    fireEvent.click(screen.getByRole('button', { name: /hide training notice/i }))
    unmount()
    sessionStorage.clear()
    render(<EnvironmentBanner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows nothing in production', () => {
    vi.stubEnv('VITE_APP_ENV', 'production')
    render(<EnvironmentBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows nothing locally', () => {
    vi.stubEnv('VITE_APP_ENV', '')
    render(<EnvironmentBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
