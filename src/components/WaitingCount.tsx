// How many requests are waiting on the signed-in person, for the badge on the Requests tab.
// Rechecked on every page change and when the app comes back to the front.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { canSendRequests } from '../lib/access'
import { countWaiting } from '../lib/queries'
import { supabase } from '../lib/supabase'

const WaitingContext = createContext<{ count: number; refresh: () => void }>({ count: 0, refresh: () => {} })

export function WaitingProvider({ children }: { children: ReactNode }) {
  const { profile, roles } = useAuth()
  const { pathname } = useLocation()
  const [count, setCount] = useState(0)
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const userId = profile?.id
  const bishopric = canSendRequests(roles)

  useEffect(() => {
    if (!userId || !roles.length) return
    let live = true
    // The badge is a nudge; if it can't load, the page itself still shows everything.
    countWaiting(supabase, userId, bishopric).then(
      (n) => live && setCount(n),
      () => {},
    )
    return () => {
      live = false
    }
  }, [userId, bishopric, roles.length, pathname, tick])

  useEffect(() => {
    const onShow = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [refresh])

  return <WaitingContext.Provider value={{ count, refresh }}>{children}</WaitingContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export const useWaitingCount = () => useContext(WaitingContext).count
// oxlint-disable-next-line react/only-export-components
export const useRefreshWaiting = () => useContext(WaitingContext).refresh
