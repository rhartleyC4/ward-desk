import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

const { signInWithPassword, signInWithOtp, signInWithOAuth, signInWithPasskey } = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signInWithOtp: vi.fn(), signInWithOAuth: vi.fn(), signInWithPasskey: vi.fn() }))
vi.mock('../lib/supabase', () => ({ ACTING_KEY: 'acting', supabase: { auth: { signInWithPassword, signInWithOtp, signInWithOAuth, signInWithPasskey } } }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  for (const fn of [signInWithPassword, signInWithOtp, signInWithOAuth, signInWithPasskey]) fn.mockReset()
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

describe('LoginPage signing in', () => {
  const realSite = () => vi.stubEnv('DEV', false)
  const typeEmail = () => userEvent.type(screen.getByLabelText(/email/i), 'a@ward.test')
  const noPasskeys = () => vi.stubGlobal('PublicKeyCredential', undefined)
  const withPasskeys = () => vi.stubGlobal('PublicKeyCredential', function () {})

  it('emails a link on the real site, with no password box', async () => {
    realSite()
    signInWithOtp.mockResolvedValue({ error: null })
    render(<LoginPage />)
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
    await typeEmail()
    await userEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))
    expect(signInWithOtp).toHaveBeenCalledWith({ email: 'a@ward.test', options: { emailRedirectTo: window.location.origin } })
    expect(await screen.findByText('Check a@ward.test for a sign-in link.')).toBeInTheDocument()
  })

  it('stays on the form and explains when the link can’t be sent', async () => {
    realSite()
    signInWithOtp.mockResolvedValue({ error: { message: 'Something broke' } })
    render(<LoginPage />)
    await typeEmail()
    await userEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/Check a@ward.test/)).not.toBeInTheDocument()
  })

  it('signs in with a password locally', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    render(<LoginPage />)
    await userEvent.type(screen.getByRole('combobox', { name: /email/i }), 'a@ward.test')
    await userEvent.type(screen.getByLabelText(/password/i), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@ward.test', password: 'secret' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('explains a wrong password', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Something broke' } })
    render(<LoginPage />)
    await userEvent.type(screen.getByRole('combobox', { name: /email/i }), 'a@ward.test')
    await userEvent.type(screen.getByLabelText(/password/i), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('needs an email before it will send a link locally', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: 'Email me a sign-in link' })).toBeDisabled()
  })

  it('offers Google only where it is turned on', async () => {
    vi.stubEnv('VITE_ENABLE_GOOGLE', 'true')
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: window.location.origin } })
  })

  it('does not offer Google otherwise', () => {
    vi.stubEnv('VITE_ENABLE_GOOGLE', 'false')
    render(<LoginPage />)
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument()
  })

  it('does not offer a passkey where the browser can’t use one', () => {
    noPasskeys()
    render(<LoginPage />)
    expect(screen.queryByRole('button', { name: 'Face ID or fingerprint' })).not.toBeInTheDocument()
  })

  it('signs in with a passkey and remembers this device has one', async () => {
    withPasskeys()
    signInWithPasskey.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const remember = vi.spyOn(Storage.prototype, 'setItem')
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Face ID or fingerprint' }))
    expect(signInWithPasskey).toHaveBeenCalled()
    await waitFor(() => expect(remember).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    remember.mockRestore()
  })

  it('explains the other ways in when the passkey prompt is closed', async () => {
    withPasskeys()
    signInWithPasskey.mockResolvedValue({ data: {}, error: { message: 'closed', code: 'ERROR_CEREMONY_ABORTED' } })
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Face ID or fingerprint' }))
    expect(await screen.findByText(/Sign in another way first/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows any other passkey failure', async () => {
    withPasskeys()
    signInWithPasskey.mockResolvedValue({ data: {}, error: { message: 'Passkey broke' } })
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Face ID or fingerprint' }))
    expect(await screen.findByText('Passkey broke')).toBeInTheDocument()
  })
})
