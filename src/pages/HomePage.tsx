import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { BishopricHome, type BishopricHomeActions } from '../components/BishopricHome'
import { ErrorNote, Loading } from '../components/Layout'
import { RequestsOnHome } from '../components/RequestsOnHome'
import { SetupCard } from '../components/Setup'
import { useRefreshWaiting } from '../components/WaitingCount'
import { DAYS_AHEAD, SecretaryHome, type SecretaryHomeActions } from '../components/SecretaryHome'
import { hasSecretaryHome } from '../lib/access'
import { WEEK_AHEAD } from '../lib/bishopricHome'
import { addDays } from '../lib/dates'
import * as q from '../lib/queries'
import { supabase, WARD_TIME_ZONE } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'
import { wardToday } from '../lib/wardToday'

export function HomePage() {
  const { roles, office } = useAuth()
  return hasSecretaryHome(roles, office) ? <SecretaryHomePage /> : <BishopricHomePage />
}

function BishopricHomePage() {
  const { profile, templates } = useAuth()
  // Times before this are past. Fixed for the visit; reopening the page moves it on.
  const [now] = useState(() => new Date())
  const userId = profile?.id ?? ''
  const today = wardToday()
  const { data, error, reload } = useAsync(async () => {
    // The bishopric attends every meeting in the database's eyes, so these are all of them.
    const [appointments, sacrament, agendaItems, rotations, absences] = await Promise.all([
      q.loadAppointments(supabase),
      q.loadSundays(supabase, today, addDays(today, WEEK_AHEAD)),
      q.loadOpenAgendaItems(supabase, templates.flatMap((t) => t.sections.map((s) => s.id))),
      q.loadRotations(supabase),
      q.loadAbsences(supabase, today),
    ])
    return { ...appointments, templates, agendaItems, sacrament, rotations, absences }
  }, [today, templates])
  const save = useAction()
  // What's done here changes the tab badges and the app icon, so recount them too.
  const refreshBadge = useRefreshWaiting()

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  const run = (fn: () => Promise<void>) =>
    save.act(fn).then((ok) => {
      if (ok) {
        reload()
        refreshBadge()
      }
      return ok
    })

  const actions: BishopricHomeActions = {
    requestInterview: (r) => run(() => q.addAppointment(supabase, { ...r, scheduled_at: null })),
    addItem: (section, body, eventDate) => run(() => q.addAgendaItem(supabase, section, body, eventDate)),
    report: (a, report) => run(() => q.reportAppointment(supabase, a, report, userId)),
  }

  return (
    <>
      <ErrorNote error={save.error} />
      <SetupCard />
      <RequestsOnHome />
      <BishopricHome data={data} userId={userId} today={today} now={now} timeZone={WARD_TIME_ZONE} actions={actions} busy={save.busy} />
    </>
  )
}

function SecretaryHomePage() {
  const { profile, sendsReminders } = useAuth()
  const today = wardToday()
  const { data, error, reload } = useAsync(async () => {
    const [appointments, hours, templates, lengths, schedule, reminders] = await Promise.all([
      q.loadAppointments(supabase),
      q.loadHours(supabase, today, addDays(today, DAYS_AHEAD - 1)),
      q.loadTemplates(supabase),
      q.loadLengths(supabase),
      q.loadSchedule(supabase),
      q.loadMeetingReminders(supabase, addDays(today, 1)),
    ])
    return { ...appointments, ...hours, templates, lengths, rotations: schedule.rotations, stewardships: schedule.stewardships, events: reminders.events, meetingsSent: reminders.sent }
  }, [today])
  const save = useAction()
  // What's done here changes the tab badges and the app icon, so recount them too.
  const refreshBadge = useRefreshWaiting()
  // Times before this are past. Fixed for the visit; reopening the page moves it on.
  const [now] = useState(() => new Date())

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  const run = (fn: () => Promise<void>) =>
    save.act(fn).then((ok) => {
      if (ok) {
        reload()
        refreshBadge()
      }
      return ok
    })

  const actions: SecretaryHomeActions = {
    book: (id, at, minutes) => run(() => q.updateAppointment(supabase, id, { scheduled_at: at, duration_minutes: minutes })),
    setLength: (id, minutes) => void run(() => q.updateAppointment(supabase, id, { duration_minutes: minutes })),
    offer: (id, times) => void run(() => q.markOffered(supabase, id, times)),
    setYouth: (id, isYouth, parentName) => void run(() => q.updateAppointment(supabase, id, { is_youth: isYouth, parent_name: parentName })),
    release: (id) => void run(() => q.releaseOffered(supabase, id)),
  }

  return (
    <>
      <ErrorNote error={save.error} />
      <SetupCard />
      <RequestsOnHome />
      <SecretaryHome data={data} userId={profile?.id ?? ''} myName={profile?.display_name ?? ''} today={today} now={now} timeZone={WARD_TIME_ZONE} sendsReminders={sendsReminders} actions={actions} busy={save.busy} />
    </>
  )
}
