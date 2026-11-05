import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { BishopricHome, type BishopricHomeActions } from '../components/BishopricHome'
import { ErrorNote, Loading } from '../components/Layout'
import { SetupCard } from '../components/Setup'
import { DAYS_AHEAD, SecretaryHome, type SecretaryHomeActions } from '../components/SecretaryHome'
import { hasSecretaryHome } from '../lib/access'
import { WEEK_AHEAD } from '../lib/bishopricHome'
import { addDays, todayIso } from '../lib/dates'
import * as q from '../lib/queries'
import { supabase, WARD_TIME_ZONE } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

export function HomePage() {
  const { roles, office } = useAuth()
  return hasSecretaryHome(roles, office) ? <SecretaryHomePage /> : <BishopricHomePage />
}

function BishopricHomePage() {
  const { profile, templates } = useAuth()
  const userId = profile?.id ?? ''
  const today = todayIso()
  const { data, error, reload } = useAsync(async () => {
    // The bishopric attends every meeting in the database's eyes, so these are all of them.
    const [appointments, sacrament, agendaItems, rotations] = await Promise.all([
      q.loadAppointments(supabase),
      q.loadSundays(supabase, today, addDays(today, WEEK_AHEAD)),
      q.loadOpenAgendaItems(supabase, templates.flatMap((t) => t.sections.map((s) => s.id))),
      q.loadRotations(supabase),
    ])
    return { ...appointments, templates, agendaItems, sacrament, rotations }
  }, [today, templates])
  const save = useAction()

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  const run = (fn: () => Promise<void>) =>
    save.act(fn).then((ok) => {
      if (ok) reload()
      return ok
    })

  const actions: BishopricHomeActions = {
    requestInterview: (r) => run(() => q.addAppointment(supabase, { ...r, scheduled_at: null })),
    addItem: (section, body, eventDate) => run(() => q.addAgendaItem(supabase, section, body, eventDate)),
  }

  return (
    <>
      <ErrorNote error={save.error} />
      <SetupCard />
      <BishopricHome data={data} userId={userId} today={today} timeZone={WARD_TIME_ZONE} actions={actions} busy={save.busy} />
    </>
  )
}

function SecretaryHomePage() {
  const { profile } = useAuth()
  const today = todayIso()
  const { data, error, reload } = useAsync(async () => {
    const [appointments, hours, templates, lengths, schedule] = await Promise.all([
      q.loadAppointments(supabase),
      q.loadHours(supabase, today, addDays(today, DAYS_AHEAD - 1)),
      q.loadTemplates(supabase),
      q.loadLengths(supabase),
      q.loadSchedule(supabase),
    ])
    return { ...appointments, ...hours, templates, lengths, rotations: schedule.rotations, stewardships: schedule.stewardships }
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
    release: (id) => void run(() => q.releaseOffered(supabase, id)),
  }

  return (
    <>
      <ErrorNote error={save.error} />
      <SetupCard />
      <SecretaryHome data={data} userId={profile?.id ?? ''} myName={profile?.display_name ?? ''} today={today} now={now} timeZone={WARD_TIME_ZONE} actions={actions} busy={save.busy} />
    </>
  )
}
