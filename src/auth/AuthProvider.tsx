import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AppRole } from '../lib/access'
import type { Enums } from '../lib/database.types'
import { loadAgendaTemplates, loadMe, type AgendaTemplate, type Profile } from '../lib/queries'
import { supabase } from '../lib/supabase'

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
  /** The meetings whose agendas this user can open. */
  templates: AgendaTemplate[]
  /** Re-reads the meetings after one is created or changed, so the Agenda tabs stay current. */
  reloadTemplates: () => Promise<void>
  signOut: () => Promise<void>
}

type Me = { userId: string; profile: Profile | null; office: Enums<'bishopric_office'> | null; roles: AppRole[]; templates: AgendaTemplate[]; hasHours: boolean }

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
    loadMe(supabase, userId)
      .then((loaded) => !cancelled && setMe({ userId, ...loaded }))
      // Treat a failed lookup as "no roles" rather than spinning forever.
      .catch(() => !cancelled && setMe({ userId, profile: null, office: null, roles: [], templates: [], hasHours: false }))
    return () => {
      cancelled = true
    }
  }, [userId])

  // Roles for a new session arrive after the session itself; until they do, we're still loading,
  // otherwise routing would briefly see "no roles" and redirect away.
  const current = userId && me?.userId === userId ? me : null
  const loading = !sessionKnown || (!!userId && !current)

  const reloadTemplates = async () => {
    const templates = await loadAgendaTemplates(supabase)
    setMe((m) => (m ? { ...m, templates } : m))
  }

  const setHasHours = (hasHours: boolean) => setMe((m) => (m ? { ...m, hasHours } : m))
  const setDisplayName = (display_name: string) => setMe((m) => (m?.profile ? { ...m, profile: { ...m.profile, display_name } } : m))

  const signOut = async () => {
    await supabase.auth.signOut()
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
        templates: current?.templates ?? [],
        reloadTemplates,
        signOut,
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
