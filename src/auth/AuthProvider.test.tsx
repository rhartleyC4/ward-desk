import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthProvider'

type Listener = (event: string, session: unknown) => void

const auth = vi.hoisted(() => ({
  listener: null as Listener | null,
  initialSession: null as unknown,
}))
const loadMe = vi.hoisted(() => vi.fn())
const whoami = vi.hoisted(() => vi.fn())
const acting = vi.hoisted(() => ({ id: null as string | null }))

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
  setActingFor: (id: string | null) => {
    acting.id = id
  },
}))
vi.mock('../lib/queries', () => ({ loadMe, whoami }))

// Every state the tree rendered, including intermediate ones a redirect could act on.
const rendered: string[] = []

const handle: { switchActing: (id: string | null) => Promise<void> } = { switchActing: async () => {} }

function Probe() {
  const auth = useAuth()
  const { loading, session, roles } = auth
  useEffect(() => {
    handle.switchActing = auth.switchActing
  })
  const s = loading ? 'loading' : `${session ? 'in' : 'out'}:${roles.join(',')}${auth.actingFor ? `:as-${auth.actingFor.for_id}` : ''}${auth.callingsHidden ? ':no-callings' : ''}`
  rendered.push(s)
  return <p data-testid="state">{s}</p>
}

const mentoring = { id: 'd1', for_id: 'newbishop', name: 'Bishop New', ends_at: '2026-12-05T07:00:00Z', sees_callings: false }

const state = () => screen.getByTestId('state').textContent

describe('AuthProvider', () => {
  beforeEach(() => {
    auth.listener = null
    auth.initialSession = null
    loadMe.mockReset()
    whoami.mockReset()
    whoami.mockResolvedValue({ id: 'u1', acting_as: 'u1', mentoring: [], mentored_by: [] })
    acting.id = null
    localStorage.clear()
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

  it('acts for the new bishop straight away when the mentor has no role of their own', async () => {
    whoami.mockResolvedValue({ id: 'u1', acting_as: 'u1', mentoring: [mentoring], mentored_by: [] })
    loadMe.mockImplementation((_c: unknown, id: string) => Promise.resolve({ profile: null, roles: id === 'newbishop' ? ['bishopric'] : [] }))
    auth.initialSession = { user: { id: 'u1' } }
    render(<AuthProvider><Probe /></AuthProvider>)
    await act(async () => {})
    expect(state()).toBe('in:bishopric:as-newbishop:no-callings')
    expect(acting.id).toBe('newbishop')
  })

  it('starts a mentor with their own role as themself, and switches when asked', async () => {
    whoami.mockResolvedValue({ id: 'u1', acting_as: 'u1', mentoring: [mentoring], mentored_by: [] })
    loadMe.mockImplementation((_c: unknown, id: string) => Promise.resolve({ profile: null, roles: id === 'newbishop' ? ['bishopric'] : ['leader'] }))
    auth.initialSession = { user: { id: 'u1' } }
    render(<AuthProvider><Probe /></AuthProvider>)
    await act(async () => {})
    expect(state()).toBe('in:leader')
    expect(acting.id).toBe(null)

    await act(async () => handle.switchActing('newbishop'))
    expect(state()).toBe('in:bishopric:as-newbishop:no-callings')
    await act(async () => handle.switchActing(null))
    expect(state()).toBe('in:leader')
    expect(acting.id).toBe(null)
  })
})
