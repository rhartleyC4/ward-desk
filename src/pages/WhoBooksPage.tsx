import Typography from '@mui/material/Typography'
import { WhoSchedules } from '../components/AppointmentsView'
import { ErrorNote, Loading, Muted, SectionCard } from '../components/Layout'
import { schedulersFrom, soleScheduler } from '../lib/appointments'
import * as q from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

/** Which secretary schedules for each leader. */
export function WhoBooksPage() {
  const { data, error, reload } = useAsync(() => q.loadAppointments(supabase), [])
  const save = useAction()

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  const sole = soleScheduler(data.assignments, data.secretaries) ? schedulersFrom(data.secretaries, data.assignments)[0] : null

  return (
    <>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Who books for whom
      </Typography>
      <ErrorNote error={save.error} />
      <SectionCard>
        {sole ? (
          <Muted>
            {sole.display_name} is the only executive secretary and books for everyone. Once there's an assistant executive secretary, choose here who books for each leader.
          </Muted>
        ) : (
          <WhoSchedules
            data={data}
            onChange={(leaderId, secretaryId, on) => void save.act(() => (on ? q.addSecretary : q.removeSecretary)(supabase, leaderId, secretaryId)).then((ok) => ok && reload())}
          />
        )}
      </SectionCard>
    </>
  )
}
