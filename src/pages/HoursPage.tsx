import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { DAYS_AHEAD, HoursView, type HoursActions } from '../components/HoursView'
import { ErrorNote, Loading } from '../components/Layout'
import { keepsHours } from '../lib/availability'
import { addDays } from '../lib/dates'
import * as q from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'
import { wardToday } from '../lib/wardToday'

export function HoursPage() {
  const { profile, office, hasHours, setHasHours } = useAuth()
  const today = wardToday()
  const { data, error, reload } = useAsync(() => q.loadHours(supabase, today, addDays(today, DAYS_AHEAD - 1)), [today])
  const save = useAction()
  // A leader sees his own hours; a secretary starts on the first leader and can switch.
  const isLeader = keepsHours(office)
  const [picked, setPicked] = useState<string | null>(null)
  // Sent here on sign-in without hours: keep the welcome up until this visit ends.
  const [firstTime] = useState(isLeader && !hasHours)

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  const leaderId = picked ?? (isLeader && profile ? profile.id : data.leaders[0]?.id)
  if (!leaderId) return <ErrorNote error="No bishop or counselors have signed in yet." />

  const run = (fn: () => Promise<void>) =>
    save.act(fn).then((ok) => {
      if (ok) reload()
      return ok
    })

  const actions: HoursActions = {
    addUsual: async (weekday, block) => {
      const ok = await run(() => q.addUsualHours(supabase, leaderId, weekday, block))
      if (ok && leaderId === profile?.id) setHasHours(true)
      return ok
    },
    deleteUsual: (id) =>
      run(() => q.deleteUsualHours(supabase, id)).then((ok) => {
        if (ok && leaderId === profile?.id) setHasHours(data.hours.some((h) => h.user_id === leaderId && h.id !== id))
      }),
    addDay: (date, block) => run(() => q.addDayHours(supabase, leaderId, date, block)),
    dayOff: (date) => void run(() => q.markDayOff(supabase, leaderId, date)),
    resetDay: (date) => void run(() => q.resetDay(supabase, leaderId, date)),
  }

  return (
    <>
      <ErrorNote error={save.error} />
      <HoursView data={data} leaderId={leaderId} onLeader={setPicked} from={today} firstTime={firstTime} selfId={isLeader ? profile?.id : undefined} actions={actions} busy={save.busy} />
    </>
  )
}
