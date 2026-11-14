import { useAuth } from '../auth/AuthProvider'
import { AppointmentsView, type AppointmentsActions } from '../components/AppointmentsView'
import { ErrorNote, Loading, SaveError } from '../components/Layout'
import * as q from '../lib/queries'
import { supabase, WARD_TIME_ZONE } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

export function AppointmentsPage() {
  const { profile } = useAuth()
  const { data, error, reload } = useAsync(() => q.loadAppointments(supabase), [])
  const save = useAction()
  const run = (fn: () => Promise<void>) => save.act(fn).then((ok) => ok && reload())

  const actions: AppointmentsActions = {
    schedule: (id, scheduledAt) => run(() => q.updateAppointment(supabase, id, { scheduled_at: scheduledAt })),
    complete: (id) => run(() => q.updateAppointment(supabase, id, { status: 'completed' })),
    cancel: (id) => run(() => q.updateAppointment(supabase, id, { status: 'cancelled' })),
    // Youth interviews are with youth, so their messages go to a parent.
    add: (appointment) => run(() => q.addAppointment(supabase, { ...appointment, is_youth: appointment.purpose === 'youth' })),
    setSecretary: (leaderId, secretaryId, on) => run(() => (on ? q.addSecretary : q.removeSecretary)(supabase, leaderId, secretaryId)),
    setLength: (id, minutes) => run(() => q.updateAppointment(supabase, id, { duration_minutes: minutes })),
    setYouth: (id, isYouth, parentName) => run(() => q.updateAppointment(supabase, id, { is_youth: isYouth, parent_name: parentName })),
  }

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  return (
    <>
      <SaveError action={save} />
      <AppointmentsView data={data} userId={profile?.id ?? ''} actions={actions} timeZone={WARD_TIME_ZONE} busy={save.busy} />
    </>
  )
}
