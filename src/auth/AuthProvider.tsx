import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AppRole } from '../lib/access'
import { trackBusy } from '../lib/busy'
import type { Enums } from '../lib/database.types'
import { loadAgendaTemplates, loadMe, whoami, type AgendaTemplate, type MentoredBy, type MentoringFor, type Profile } from '../lib/queries'
import { ACTING_KEY, setActingFor, supabase } from '../lib/supabase'

function storedActing(): string | null {
  try {
    return localStorage.getItem(ACTING_KEY)
  } catch {
    return null
  }
}

function storeActing(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTING_KEY, id)
    else localStorage.removeItem(ACTING_KEY)
  } catch {
    // Private windows may refuse; the choice just isn't remembered.
  }
}

type AuthState = {
  loading: boolean
  session: Session | null
  profile: Profile | null
  roles: AppRole[]
  /** Bishop, counselor, executive secretary or clerk; null for everyone else. */
  office: Enums<'bishopric_office'> | null
  /** Whether this person has set usual appointment hours. The bishop and counselors are asked to on sign-in. */
  hasHours: boolean
  /** Records that this person's usual hours changed, so the sign-in prompt stops (or starts) showing. */
  setHasHours: (hasHours: boolean) => void
  /** Shows a name this person just saved for themselves. */
  setDisplayName: (displayName: string) => void
  /** Whether this secretary reminds people of their appointments the day before. */
  sendsReminders: boolean
  /** Shows the reminders choice this person just saved. */
  setSendsReminders: (on: boolean) => void
  /** The meetings whose agendas this user can open. */
  templates: AgendaTemplate[]
  /** Re-reads the meetings after one is created or changed, so the Agenda tabs stay current. */
  reloadTemplates: () => Promise<void>
  signOut: () => Promise<void>
  /** The organization a ward leader leads. */
  organization: string | null
  /** The new bishops this person mentors right now (they may use Ward Desk as them). */
  mentoring: MentoringFor[]
  /** The mentors helping this person right now. */
  mentoredBy: MentoredBy[]
  /** Who this person is using Ward Desk as, when mentoring; null when they're themself. */
  actingFor: MentoringFor | null
  /** Whether this person holds a role of their own (so "Yourself" is worth switching to). */
  hasOwnRoles: boolean
  /** Calling discussions are hidden: a mentor the new bishop hasn't allowed to see them. */
  callingsHidden: boolean
  /** Uses Ward Desk as someone this person mentors, or as themself (null). */
  switchActing: (id: string | null) => Promise<void>
  /** Re-reads mentoring after the new bishop changes it. */
  reloadMentoring: () => Promise<void>
}

type Me = {
  userId: string
  profile: Profile | null
  office: Enums<'bishopric_office'> | null
  organization: string | null
  sendsReminders: boolean
  roles: AppRole[]
  templates: AgendaTemplate[]
  hasHours: boolean
  mentoring: MentoringFor[]
  mentoredBy: MentoredBy[]
  actingFor: MentoringFor | null
  hasOwnRoles: boolean
}

const NO_ONE = { profile: null, office: null, organization: null, sendsReminders: true, roles: [], templates: [], hasHours: false, mentoring: [], mentoredBy: [], actingFor: null, hasOwnRoles: false }

/**
 * Loads who this person is, and who they use Ward Desk as. A mentor with no role of their own acts
 * for the new bishop straight away; one with their own role starts as themself unless they chose
 * otherwise on this device.
 */
async function loadWho(userId: string, wanted: string | null | undefined): Promise<Me> {
  setActingFor(null)
  const [who, own] = await Promise.all([whoami(supabase), loadMe(supabase, userId)])
  const mentoring = who?.mentoring ?? []
  const mentoredBy = who?.mentored_by ?? []
  const hasOwnRoles = own.roles.length > 0
  const choice = wanted === undefined ? storedActing() : wanted
  const actingFor = mentoring.find((m) => m.for_id === choice) ?? (!hasOwnRoles && wanted !== null ? mentoring[0] : undefined) ?? null
  if (!actingFor) return { userId, ...own, mentoring, mentoredBy, actingFor: null, hasOwnRoles }
  setActingFor(actingFor.for_id)
  const acting = await loadMe(supabase, actingFor.for_id)
  return { userId, ...acting, mentoring, mentoredBy, actingFor, hasOwnRoles }
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionKnown, setSessionKnown] = useState(false)
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionKnown(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setSessionKnown(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    loadWho(userId, undefined)
      .then((loaded) => !cancelled && setMe(loaded))
      // Treat a failed lookup as "no roles" rather than spinning forever.
      .catch(() => !cancelled && setMe({ userId, ...NO_ONE }))
    return () => {
      cancelled = true
    }
  }, [userId])

  // Roles for a new session arrive after the session itself; until they do, we're still loading,
  // otherwise routing would briefly see "no roles" and redirect away.
  const current = userId && me?.userId === userId ? me : null
  const loading = !sessionKnown || (!!userId && !current)

  const reloadTemplates = async () => {
    const templates = await trackBusy(loadAgendaTemplates(supabase))
    setMe((m) => (m ? { ...m, templates } : m))
  }

  const setHasHours = (hasHours: boolean) => setMe((m) => (m ? { ...m, hasHours } : m))
  const setDisplayName = (display_name: string) => setMe((m) => (m?.profile ? { ...m, profile: { ...m.profile, display_name } } : m))
  const setSendsReminders = (sendsReminders: boolean) => setMe((m) => (m ? { ...m, sendsReminders } : m))

  const signOut = async () => {
    storeActing(null)
    setActingFor(null)
    await trackBusy(supabase.auth.signOut())
  }

  const switchActing = async (id: string | null) => {
    if (!userId) return
    storeActing(id)
    setMe(await trackBusy(loadWho(userId, id)))
  }

  const reloadMentoring = async () => {
    if (!userId) return
    setMe(await trackBusy(loadWho(userId, me?.actingFor?.for_id ?? null)))
  }

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        profile: current?.profile ?? null,
        roles: current?.roles ?? [],
        office: current?.office ?? null,
        hasHours: current?.hasHours ?? false,
        setHasHours,
        setDisplayName,
        sendsReminders: current?.sendsReminders ?? true,
        setSendsReminders,
        templates: current?.templates ?? [],
        reloadTemplates,
        signOut,
        organization: current?.organization ?? null,
        mentoring: current?.mentoring ?? [],
        mentoredBy: current?.mentoredBy ?? [],
        actingFor: current?.actingFor ?? null,
        hasOwnRoles: current?.hasOwnRoles ?? false,
        callingsHidden: !!current?.actingFor && !current.actingFor.sees_callings,
        switchActing,
        reloadMentoring,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
