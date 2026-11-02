import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnvironmentBanner } from './EnvironmentBanner'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('EnvironmentBanner', () => {
  it('warns on the training site', () => {
    vi.stubEnv('VITE_APP_ENV', 'staging')
    render(<EnvironmentBanner />)
    expect(screen.getByRole('status')).toHaveTextContent(/training site/i)
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
