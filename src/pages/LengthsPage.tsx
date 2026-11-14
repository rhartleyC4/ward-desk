import Typography from '@mui/material/Typography'
import { ErrorNote, Loading, Muted, SaveError, SectionCard } from '../components/Layout'
import { UsualLengths } from '../components/SecretaryHome'
import * as q from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

/** How long each kind of appointment usually takes. */
export function LengthsPage() {
  const { data, error, reload } = useAsync(() => q.loadLengths(supabase), [])
  const save = useAction()

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  return (
    <>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Usual lengths
      </Typography>
      <SaveError action={save} />
      <SectionCard>
        <Muted>New appointments start at these. You can still change any one when booking.</Muted>
        <UsualLengths lengths={data} busy={save.busy} onChange={(purpose, minutes) => void save.act(() => q.setUsualLength(supabase, purpose, minutes)).then((ok) => ok && reload())} />
      </SectionCard>
    </>
  )
}
