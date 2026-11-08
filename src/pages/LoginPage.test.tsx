import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

const signInWithPassword = vi.hoisted(() => vi.fn())
vi.mock('../lib/supabase', () => ({ ACTING_KEY: 'acting', supabase: { auth: { signInWithPassword } } }))

afterEach(() => {
  vi.unstubAllEnvs()
  signInWithPassword.mockReset()
})

describe('LoginPage one-tap practice sign-in', () => {
  const onDemo = () => {
    vi.stubEnv('VITE_APP_ENV', 'staging')
    vi.stubEnv('VITE_PRACTICE_PASSWORD', 'practice')
  }

  it('signs in with one tap on the training site, with no password box', async () => {
    onDemo()
    signInWithPassword.mockResolvedValue({ error: null })
    render(<LoginPage />)
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Sister Reyes/ }))
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'leader@ward.test', password: 'practice' })
  })

  it('shows what went wrong when a practice account can’t sign in', async () => {
    onDemo()
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: /Bishop Avery/ }))
    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument()
  })

  it('still lets someone use their own email', async () => {
    onDemo()
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: /use your own email/i }))
    expect(screen.getByRole('button', { name: /email me a sign-in link/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /back to the practice people/i }))
    expect(screen.getByRole('button', { name: /Bishop Avery/ })).toBeInTheDocument()
  })

  it('never offers practice people on the real site, even if the password were set', () => {
    vi.stubEnv('VITE_APP_ENV', 'production')
    vi.stubEnv('VITE_PRACTICE_PASSWORD', 'practice')
    render(<LoginPage />)
    expect(screen.queryByRole('button', { name: /Bishop Avery/ })).not.toBeInTheDocument()
  })
})

describe('LoginPage practice accounts', () => {
  // Tests run in dev mode, where the practice-account picker shows.
  it('shows each account’s name with its role', async () => {
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('combobox', { name: /email/i }))
    expect(screen.getByRole('option', { name: /leader@ward\.test/ })).toHaveTextContent('Sister Reyes · Other called leader')
  })

  it('finds an account by the person’s name', async () => {
    render(<LoginPage />)
    await userEvent.type(screen.getByRole('combobox', { name: /email/i }), 'Reyes')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['leader@ward.testSister Reyes · Other called leader'])
  })
})
