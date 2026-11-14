// How many things on each main tab are waiting on the signed-in person, for the badges on the tab bar.
// Rechecked on every page change and whenever ward data may have changed (see liveUpdates).
// This is also where the live-updates channel is opened, since it already knows who's signed in.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { canPlanMeetings, canSeeCallings, canSendRequests, hasBishopricHome, hasSecretaryHome } from '../lib/access'
import { showOnAppIcon } from '../lib/appBadge'
import { listenForWardChanges, onWardChange } from '../lib/liveUpdates'
import { loadTabCounts } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { totalCount, type TabCounts } from '../lib/tabCounts'
import { wardToday } from '../lib/wardToday'

const WaitingContext = createContext<{ counts: TabCounts; refresh: () => void }>({ counts: {}, refresh: () => {} })

export function WaitingProvider({ children }: { children: ReactNode }) {
  const { profile, roles, office, templates, callingsHidden } = useAuth()
  const { pathname } = useLocation()
  const [counts, setCounts] = useState<TabCounts>({})
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const userId = profile?.id
  const bishopric = canSendRequests(roles)
  const home = hasSecretaryHome(roles, office) ? 'secretary' : hasBishopricHome(roles, office) ? 'leader' : null
  // Suggestions are sorted in the callings section, so only someone whose agenda has one gets the badge.
  const callings = canSeeCallings(roles, callingsHidden) && templates.some((t) => t.sections.some((s) => s.kind === 'callings'))
  const sacrament = canPlanMeetings(roles)

  useEffect(() => {
    if (!userId || !roles.length) return
    let live = true
    // The badges are a nudge; if they can't load, the pages themselves still show everything.
    loadTabCounts(supabase, { userId, bishopric, home, callings, sacrament, today: wardToday(), now: new Date() }).then(
      (c) => live && setCounts(c),
      () => {},
    )
    return () => {
      live = false
    }
  }, [userId, bishopric, home, callings, sacrament, roles.length, pathname, tick])

  // Mirror the total on the installed app's icon, and clear it on sign-out.
  const total = totalCount(counts)
  useEffect(() => showOnAppIcon(total), [total])
  useEffect(() => () => showOnAppIcon(0), [])

  // Hear about changes other people make, while someone with a role is signed in.
  const signedIn = !!userId && roles.length > 0
  useEffect(() => {
    if (!signedIn) return
    return listenForWardChanges({ client: supabase, doc: document })
  }, [signedIn, userId])

  useEffect(() => onWardChange(refresh), [refresh])

  return <WaitingContext.Provider value={{ counts, refresh }}>{children}</WaitingContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export const useTabCounts = () => useContext(WaitingContext).counts
// oxlint-disable-next-line react/only-export-components
export const useRefreshWaiting = () => useContext(WaitingContext).refresh
