import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnvironmentBanner } from './EnvironmentBanner'

const auth = vi.hoisted(() => ({ email: null as string | null, signInWithPassword: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  ACTING_KEY: 'acting',
  supabase: {
    auth: {
      signInWithPassword: auth.signInWithPassword,
      onAuthStateChange: (callback: (event: string, session: { user: { email: string } } | null) => void) => {
        callback('INITIAL_SESSION', auth.email ? { user: { email: auth.email } } : null)
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  sessionStorage.clear()
  auth.email = null
  auth.signInWithPassword.mockReset()
})

describe('switching practice people', () => {
  const onDemo = () => {
    vi.stubEnv('VITE_APP_ENV', 'staging')
    vi.stubEnv('VITE_PRACTICE_PASSWORD', 'practice')
  }
  const switcher = () => screen.queryByRole('combobox', { name: /switch practice person/i }) as HTMLSelectElement | null

  it('shows who you are and goes straight to the person you pick', async () => {
    onDemo()
    auth.email = 'bishop@ward.test'
    auth.signInWithPassword.mockResolvedValue({ error: null })
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    render(<EnvironmentBanner />)
    expect(switcher()).toHaveValue('bishop@ward.test')
    fireEvent.change(switcher()!, { target: { value: 'clerk@ward.test' } })
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'))
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'clerk@ward.test', password: 'practice' })
  })

  it('stays put and says why when the switch fails', async () => {
    onDemo()
    auth.email = 'bishop@ward.test'
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    render(<EnvironmentBanner />)
    fireEvent.change(switcher()!, { target: { value: 'clerk@ward.test' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials')
    expect(assign).not.toHaveBeenCalled()
  })

  it('is not offered before signing in', () => {
    onDemo()
    render(<EnvironmentBanner />)
    expect(switcher()).not.toBeInTheDocument()
  })

  it('is not offered on the real site', () => {
    vi.stubEnv('VITE_APP_ENV', 'production')
    vi.stubEnv('VITE_PRACTICE_PASSWORD', 'practice')
    auth.email = 'bishop@ward.test'
    render(<EnvironmentBanner />)
    expect(switcher()).not.toBeInTheDocument()
  })
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
