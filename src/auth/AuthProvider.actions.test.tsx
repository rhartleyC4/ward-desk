// What the signed-in person can do through useAuth. AuthProvider.test.tsx covers how it settles on who they are.

import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthProvider'

const mocks = vi.hoisted(() => ({ loadMe: vi.fn(), whoami: vi.fn(), loadAgendaTemplates: vi.fn(), signOut: vi.fn(), setActingFor: vi.fn(), session: null as unknown }))

vi.mock('../lib/supabase', () => ({
  ACTING_KEY: 'acting',
  setActingFor: mocks.setActingFor,
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: mocks.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: mocks.signOut,
    },
  },
}))
vi.mock('../lib/queries', () => ({ loadMe: mocks.loadMe, whoami: mocks.whoami, loadAgendaTemplates: mocks.loadAgendaTemplates }))

let auth: ReturnType<typeof useAuth>

function Probe() {
  auth = useAuth()
  return <p data-testid="state">{auth.loading ? 'loading' : 'ready'}</p>
}

const own = { profile: { display_name: 'Avery' }, office: 'bishop', organization: null, roles: ['bishopric'], templates: [], hasHours: false }
const mentee = { for_id: 'new', name: 'Lane', ends_at: '2026-12-05T07:00:00Z', sees_callings: true }

const open = async () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready'))
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.session = { user: { id: 'me' } }
  mocks.loadMe.mockResolvedValue(own)
  mocks.whoami.mockResolvedValue({ mentoring: [], mentored_by: [] })
  localStorage.clear()
})

describe('useAuth', () => {
  it('must be used inside the provider', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow('useAuth must be used inside AuthProvider')
    quiet.mockRestore()
  })

  it('has no one signed in without a session', async () => {
    mocks.session = null
    await open()
    expect(auth).toMatchObject({ profile: null, roles: [], office: null, organization: null, hasHours: false, templates: [], mentoring: [], mentoredBy: [], actingFor: null, hasOwnRoles: false, callingsHidden: false })
  })

  it('updates the hours flag', async () => {
    await open()
    act(() => auth.setHasHours(true))
    expect(auth.hasHours).toBe(true)
  })

  it('updates the name shown', async () => {
    await open()
    act(() => auth.setDisplayName('Brother Avery'))
    expect(auth.profile?.display_name).toBe('Brother Avery')
  })

  it('has no name to update without a profile', async () => {
    mocks.loadMe.mockResolvedValue({ ...own, profile: null })
    await open()
    act(() => auth.setDisplayName('Brother Avery'))
    expect(auth.profile).toBeNull()
  })

  it('re-reads the meetings', async () => {
    const templates = [{ id: 't' }]
    mocks.loadAgendaTemplates.mockResolvedValue(templates)
    await open()
    await act(() => auth.reloadTemplates())
    expect(auth.templates).toEqual(templates)
  })

  it('changes nothing before anyone has loaded', async () => {
    mocks.session = null
    await open()
    mocks.loadAgendaTemplates.mockResolvedValue([{ id: 't' }])
    await act(() => auth.reloadTemplates())
    act(() => auth.setHasHours(true))
    expect(auth.templates).toEqual([])
    expect(auth.hasHours).toBe(false)
  })

  it('forgets who they were acting for on sign-out', async () => {
    localStorage.setItem('acting', 'new')
    await open()
    await act(() => auth.signOut())
    expect(localStorage.getItem('acting')).toBeNull()
    expect(mocks.setActingFor).toHaveBeenLastCalledWith(null)
    expect(mocks.signOut).toHaveBeenCalledOnce()
  })

  it('remembers a switch to acting for someone', async () => {
    mocks.whoami.mockResolvedValue({ mentoring: [mentee], mentored_by: [] })
    await open()
    await act(() => auth.switchActing('new'))
    expect(localStorage.getItem('acting')).toBe('new')
    expect(auth.actingFor).toEqual(mentee)
  })

  it('does not switch without someone signed in', async () => {
    mocks.session = null
    await open()
    await act(() => auth.switchActing('new'))
    expect(localStorage.getItem('acting')).toBeNull()
    expect(mocks.whoami).not.toHaveBeenCalled()
  })

  it('keeps going when this device refuses to remember', async () => {
    const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('private window')
    })
    mocks.whoami.mockResolvedValue({ mentoring: [mentee], mentored_by: [] })
    await open()
    await act(() => auth.switchActing('new'))
    expect(auth.actingFor).toEqual(mentee)
    refuse.mockRestore()
  })

  it('starts as themself when this device can\'t say', async () => {
    const refuse = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private window')
    })
    mocks.whoami.mockResolvedValue({ mentoring: [mentee], mentored_by: [] })
    await open()
    expect(auth.actingFor).toBeNull()
    refuse.mockRestore()
  })

  it('stays acting for the same person when mentoring is re-read', async () => {
    mocks.whoami.mockResolvedValue({ mentoring: [mentee], mentored_by: [] })
    localStorage.setItem('acting', 'new')
    await open()
    await act(() => auth.reloadMentoring())
    expect(auth.actingFor).toEqual(mentee)
    expect(mocks.whoami).toHaveBeenCalledTimes(2)
  })

  it('stays themself when mentoring is re-read', async () => {
    await open()
    await act(() => auth.reloadMentoring())
    expect(auth.actingFor).toBeNull()
  })

  it('does not re-read without someone signed in', async () => {
    mocks.session = null
    await open()
    await act(() => auth.reloadMentoring())
    expect(mocks.whoami).not.toHaveBeenCalled()
  })

  it('treats no mentoring answer as none', async () => {
    mocks.whoami.mockResolvedValue(null)
    await open()
    expect(auth).toMatchObject({ mentoring: [], mentoredBy: [], hasOwnRoles: true })
  })

  it('treats a failed lookup as no roles, rather than loading forever', async () => {
    mocks.loadMe.mockRejectedValue(new Error('offline'))
    await open()
    expect(auth.roles).toEqual([])
  })
})
