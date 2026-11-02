import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthProvider'

type Listener = (event: string, session: unknown) => void

const auth = vi.hoisted(() => ({
  listener: null as Listener | null,
  initialSession: null as unknown,
}))
const loadMe = vi.hoisted(() => vi.fn())

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: auth.initialSession } }),
      onAuthStateChange: (fn: Listener) => {
        auth.listener = fn
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signOut: () => Promise.resolve(),
    },
  },
}))
vi.mock('../lib/queries', () => ({ loadMe }))

// Every state the tree rendered, including intermediate ones a redirect could act on.
const rendered: string[] = []

function Probe() {
  const { loading, session, roles } = useAuth()
  const s = loading ? 'loading' : `${session ? 'in' : 'out'}:${roles.join(',')}`
  rendered.push(s)
  return <p data-testid="state">{s}</p>
}

const state = () => screen.getByTestId('state').textContent

describe('AuthProvider', () => {
  beforeEach(() => {
    auth.listener = null
    auth.initialSession = null
    loadMe.mockReset()
    rendered.length = 0
  })

  it('settles to signed out when there is no session', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    expect(state()).toBe('loading')
    await act(async () => {})
    expect(state()).toBe('out:')
  })

  it('stays loading after sign-in until roles arrive, so routing never sees "no roles"', async () => {
    let resolveMe!: (v: unknown) => void
    loadMe.mockReturnValue(new Promise((r) => (resolveMe = r)))
    render(<AuthProvider><Probe /></AuthProvider>)
    await act(async () => {})
    expect(state()).toBe('out:')

    await act(async () => auth.listener!('SIGNED_IN', { user: { id: 'u1' } }))
    expect(state()).toBe('loading')

    await act(async () => resolveMe({ profile: null, roles: ['bishopric'] }))
    expect(state()).toBe('in:bishopric')
    expect(rendered).not.toContain('in:')
  })

  it('drops the previous user\'s roles when someone else signs in', async () => {
    loadMe.mockResolvedValueOnce({ profile: null, roles: ['bishopric'] })
    auth.initialSession = { user: { id: 'u1' } }
    render(<AuthProvider><Probe /></AuthProvider>)
    await act(async () => {})
    expect(state()).toBe('in:bishopric')

    let resolveMe!: (v: unknown) => void
    loadMe.mockReturnValue(new Promise((r) => (resolveMe = r)))
    await act(async () => auth.listener!('SIGNED_IN', { user: { id: 'u2' } }))
    expect(state()).toBe('loading')
    await act(async () => resolveMe({ profile: null, roles: ['leader'] }))
    expect(state()).toBe('in:leader')
    expect(rendered).not.toContain('in:')
  })

  it('treats a failed role lookup as no roles instead of loading forever', async () => {
    loadMe.mockRejectedValue(new Error('network'))
    auth.initialSession = { user: { id: 'u1' } }
    render(<AuthProvider><Probe /></AuthProvider>)
    await act(async () => {})
    expect(state()).toBe('in:')
  })
})
