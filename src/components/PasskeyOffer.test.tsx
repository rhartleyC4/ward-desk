import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PasskeyCancelled } from '../lib/passkeys'
import { PasskeyOffer } from './PasskeyOffer'

const registerPasskey = vi.hoisted(() => vi.fn())
const session = { user: { id: 'u1', email: 'someone@example.com' } }

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ session }) }))
vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../lib/queries', () => ({ registerPasskey }))
beforeEach(() => {
  registerPasskey.mockReset()
  // jsdom has no WebAuthn; pretend this browser has it.
  vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
})
afterEach(() => vi.unstubAllGlobals())

describe('PasskeyOffer', () => {
  it('saves a passkey and stops offering', async () => {
    registerPasskey.mockResolvedValue(undefined)
    const { unmount } = render(<PasskeyOffer />)
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }))
    expect(registerPasskey).toHaveBeenCalledOnce()
    expect(screen.getByText(/All set/)).toBeInTheDocument()
    unmount()
    render(<PasskeyOffer />)
    expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument()
  })

  it('stays hidden after "Not now"', async () => {
    const { unmount } = render(<PasskeyOffer />)
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    unmount()
    render(<PasskeyOffer />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps offering quietly if the prompt is closed', async () => {
    registerPasskey.mockImplementation(async () => { throw new PasskeyCancelled() })
    render(<PasskeyOffer />)
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }))
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeEnabled()
    expect(screen.queryByText(/All set/)).not.toBeInTheDocument()
  })
})
