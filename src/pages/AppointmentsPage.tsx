import { useAuth } from '../auth/AuthProvider'
import { AppointmentsView, type AppointmentsActions } from '../components/AppointmentsView'
import { ErrorNote, Loading } from '../components/Layout'
import { canManageMeetings } from '../lib/access'
import * as q from '../lib/queries'
import { supabase, WARD_TIME_ZONE } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

export function AppointmentsPage() {
  const { roles, profile } = useAuth()
  const { data, error, reload } = useAsync(() => q.loadAppointments(supabase), [])
  const save = useAction()
  const run = (fn: () => Promise<void>) => save.act(fn).then((ok) => ok && reload())

  const actions: AppointmentsActions = {
    schedule: (id, scheduledAt) => run(() => q.updateAppointment(supabase, id, { scheduled_at: scheduledAt })),
    complete: (id) => run(() => q.updateAppointment(supabase, id, { status: 'completed' })),
    cancel: (id) => run(() => q.updateAppointment(supabase, id, { status: 'cancelled' })),
    add: (appointment) => run(() => q.addAppointment(supabase, appointment)),
    setSecretary: (leaderId, secretaryId, on) => run(() => (on ? q.addSecretary : q.removeSecretary)(supabase, leaderId, secretaryId)),
  }

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  return (
    <>
      <ErrorNote error={save.error} />
      <AppointmentsView data={data} userId={profile?.id ?? ''} actions={actions} timeZone={WARD_TIME_ZONE} canAssign={canManageMeetings(roles)} />
    </>
  )
}
