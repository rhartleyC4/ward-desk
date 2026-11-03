import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AppRole } from '../lib/access'
import { loadMe, type AgendaTemplate, type Profile } from '../lib/queries'
import { supabase } from '../lib/supabase'

type AuthState = {
  loading: boolean
  session: Session | null
  profile: Profile | null
  roles: AppRole[]
  /** The meetings whose agendas this user can open. */
  templates: AgendaTemplate[]
  signOut: () => Promise<void>
}

type Me = { userId: string; profile: Profile | null; roles: AppRole[]; templates: AgendaTemplate[] }

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
      .catch(() => !cancelled && setMe({ userId, profile: null, roles: [], templates: [] }))
    return () => {
      cancelled = true
    }
  }, [userId])

  // Roles for a new session arrive after the session itself; until they do, we're still loading,
  // otherwise routing would briefly see "no roles" and redirect away.
  const current = userId && me?.userId === userId ? me : null
  const loading = !sessionKnown || (!!userId && !current)

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ loading, session, profile: current?.profile ?? null, roles: current?.roles ?? [], templates: current?.templates ?? [], signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
