import { useAuth } from '../auth/AuthProvider'
import { ErrorNote, Loading } from '../components/Layout'
import { ScheduleEditor, type ScheduleActions } from '../components/ScheduleEditor'
import { canEditSchedule, isSecretaryOffice } from '../lib/access'
import * as q from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

/** The standing schedule, editable by the bishopric. */
export function SchedulePage() {
  const { roles, templates } = useAuth()
  const { data, error, reload } = useAsync(async () => {
    const [schedule, profiles, bishopric, secretaries] = await Promise.all([q.loadSchedule(supabase), q.loadProfiles(supabase), q.loadBishopric(supabase), q.loadSecretaries(supabase)])
    return { ...schedule, profiles, bishopric, secretaries: secretaries.filter((s) => isSecretaryOffice(s.office)), agendaTemplates: templates }
  }, [templates])
  const save = useAction()

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  const run = (fn: () => Promise<void>) =>
    save.act(fn).then((ok) => {
      if (ok) reload()
      return ok
    })

  const actions: ScheduleActions = {
    saveEvent: (e, id) => run(() => q.saveEvent(supabase, e, id)),
    deleteEvent: (id) => run(() => q.deleteEvent(supabase, id)),
    saveRotation: (r, id) => run(() => q.saveRotation(supabase, r, id)),
    deleteRotation: (id) => run(() => q.deleteRotation(supabase, id)),
    addStewardship: (userId, area) => run(() => q.addStewardship(supabase, userId, area)),
    deleteStewardship: (id) => run(() => q.deleteStewardship(supabase, id)),
  }

  return (
    <>
      <ErrorNote error={save.error} />
      <ScheduleEditor data={data} canEdit={canEditSchedule(roles)} actions={actions} busy={save.busy} />
    </>
  )
}
