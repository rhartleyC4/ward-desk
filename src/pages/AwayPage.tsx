import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ErrorNote, Loading, Muted, SectionCard } from '../components/Layout'
import { personLabel } from '../lib/agenda'
import { longDate, todayIso } from '../lib/dates'
import { addAbsence, deleteAbsence, loadAbsences, loadProfiles } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

const shrink = { inputLabel: { shrink: true } } as const

export function AwayPage() {
  const { session } = useAuth()
  const today = todayIso()
  const { data, error, reload } = useAsync(async () => {
    const [absences, profiles] = await Promise.all([loadAbsences(supabase, today), loadProfiles(supabase)])
    return { absences, profiles }
  }, [today])
  const save = useAction()
  const [form, setForm] = useState({ starts_on: '', ends_on: '', location: '' })

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await save.act(() =>
      addAbsence(supabase, { starts_on: form.starts_on, ends_on: form.ends_on || form.starts_on, location: form.location.trim() || null }),
    )
    if (ok) {
      setForm({ starts_on: '', ends_on: '', location: '' })
      reload()
    }
  }

  return (
    <>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Away dates
      </Typography>
      <SectionCard title="I'll be away">
        <Grid component="form" container spacing={1.5} onSubmit={submit}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField label="From" type="date" required slotProps={shrink} value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              label="Through"
              type="date"
              slotProps={{ ...shrink, htmlInput: { min: form.starts_on } }}
              value={form.ends_on}
              onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField label="Where (optional)" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 2 }}>
            <Button type="submit" variant="contained" fullWidth disabled={save.busy}>
              Add
            </Button>
          </Grid>
        </Grid>
        <ErrorNote error={save.error} />
      </SectionCard>

      <SectionCard title="Upcoming">
        {data.absences.length ? (
          <Table size="small">
            <TableBody>
              {data.absences.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{personLabel(a.user_id, data.profiles)}</TableCell>
                  <TableCell>
                    {longDate(a.starts_on)}
                    {a.ends_on !== a.starts_on && ` – ${longDate(a.ends_on)}`}
                  </TableCell>
                  <TableCell>{a.location}</TableCell>
                  <TableCell align="right" sx={{ width: 48 }}>
                    {a.user_id === session?.user.id && (
                      <IconButton size="small" aria-label="Remove" onClick={() => save.act(() => deleteAbsence(supabase, a.id)).then((ok) => ok && reload())}>
                        <DeleteOutlinedIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Muted>No one is away.</Muted>
        )}
      </SectionCard>
    </>
  )
}
