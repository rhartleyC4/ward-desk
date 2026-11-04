import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ErrorNote, Loading } from '../components/Layout'
import { DAYS_AHEAD, SecretaryHome, type SecretaryHomeActions } from '../components/SecretaryHome'
import { addDays, todayIso } from '../lib/dates'
import * as q from '../lib/queries'
import { supabase, WARD_TIME_ZONE } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

export function HomePage() {
  const { profile } = useAuth()
  const today = todayIso()
  const { data, error, reload } = useAsync(async () => {
    const [appointments, hours, templates, lengths] = await Promise.all([
      q.loadAppointments(supabase),
      q.loadHours(supabase, today, addDays(today, DAYS_AHEAD - 1)),
      q.loadTemplates(supabase),
      q.loadLengths(supabase),
    ])
    return { ...appointments, ...hours, templates, lengths }
  }, [today])
  const save = useAction()
  // Times before this are past. Fixed for the visit; reopening the page moves it on.
  const [now] = useState(() => new Date())

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  const run = (fn: () => Promise<void>) =>
    save.act(fn).then((ok) => {
      if (ok) reload()
      return ok
    })

  const actions: SecretaryHomeActions = {
    book: (id, at, minutes) => run(() => q.updateAppointment(supabase, id, { scheduled_at: at, duration_minutes: minutes })),
    setLength: (id, minutes) => void run(() => q.updateAppointment(supabase, id, { duration_minutes: minutes })),
    complete: (id) => void run(() => q.updateAppointment(supabase, id, { status: 'completed' })),
    offer: (id, times) => void run(() => q.markOffered(supabase, id, times)),
    setYouth: (id, isYouth, parentName) => void run(() => q.updateAppointment(supabase, id, { is_youth: isYouth, parent_name: parentName })),
    saveTemplate: (t) => run(() => q.saveTemplate(supabase, t)),
    deleteTemplate: (id) => void run(() => q.deleteTemplate(supabase, id)),
    release: (id) => void run(() => q.releaseOffered(supabase, id)),
    setUsualLength: (purpose, minutes) => void run(() => q.setUsualLength(supabase, purpose, minutes)),
  }

  return (
    <>
      <ErrorNote error={save.error} />
      <SecretaryHome data={data} userId={profile?.id ?? ''} myName={profile?.display_name ?? ''} today={today} now={now} timeZone={WARD_TIME_ZONE} actions={actions} busy={save.busy} />
    </>
  )
}
