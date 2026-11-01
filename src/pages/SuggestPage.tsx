import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { ErrorNote, SectionCard } from '../components/Layout'
import { submitSuggestion } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction } from '../lib/useAsync'

export function SuggestPage() {
  const [form, setForm] = useState({ calling_title: '', person_name: '', notes: '' })
  const [sent, setSent] = useState(false)
  const save = useAction()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await save.act(() =>
      submitSuggestion(supabase, {
        calling_title: form.calling_title.trim(),
        person_name: form.person_name.trim(),
        notes: form.notes.trim() || undefined,
      }),
    )
    if (ok) {
      setSent(true)
      setForm({ calling_title: '', person_name: '', notes: '' })
    }
  }

  return (
    <SectionCard title="Suggest a name">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Suggestions go only to the bishopric. You won't see them again after sending.
      </Typography>
      {sent && (
        <Alert severity="success" role="status" sx={{ mb: 2 }}>
          Thanks, your suggestion was sent.
        </Alert>
      )}
      <Stack component="form" onSubmit={submit} spacing={1.5}>
        <TextField label="Calling" required value={form.calling_title} onChange={(e) => setForm({ ...form, calling_title: e.target.value })} />
        <TextField label="Name" required value={form.person_name} onChange={(e) => setForm({ ...form, person_name: e.target.value })} />
        <TextField label="Notes (optional)" multiline minRows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <Button type="submit" variant="contained" disabled={save.busy}>
          Send suggestion
        </Button>
      </Stack>
      <ErrorNote error={save.error} />
    </SectionCard>
  )
}
