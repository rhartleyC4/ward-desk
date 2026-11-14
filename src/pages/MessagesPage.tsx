import Typography from '@mui/material/Typography'
import { ErrorNote, Loading, SaveError, SectionCard } from '../components/Layout'
import { TemplatesEditor } from '../components/Messages'
import * as q from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

/** The texts and emails the secretaries start from. */
export function MessagesPage() {
  const { data, error, reload } = useAsync(() => q.loadTemplates(supabase), [])
  const save = useAction()

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  const run = (fn: () => Promise<void>) =>
    save.act(fn).then((ok) => {
      if (ok) reload()
      return ok
    })

  return (
    <>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Message templates
      </Typography>
      <SaveError action={save} />
      <SectionCard>
        <TemplatesEditor templates={data} busy={save.busy} onSave={(t) => run(() => q.saveTemplate(supabase, t))} onDelete={(id) => void run(() => q.deleteTemplate(supabase, id))} />
      </SectionCard>
    </>
  )
}
