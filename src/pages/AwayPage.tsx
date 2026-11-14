import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import Box from '@mui/material/Box'
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
import { ErrorNote, Loading, Muted, SaveError, SectionCard } from '../components/Layout'
import { ShortSundaysNote } from '../components/ShortSundays'
import { personLabel } from '../lib/agenda'
import { shortSundays, shortSundaysWith } from '../lib/coverage'
import { longDate } from '../lib/dates'
import { addAbsence, deleteAbsence, loadAbsences, loadBishopric, loadProfiles } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'
import { wardToday } from '../lib/wardToday'

const shrink = { inputLabel: { shrink: true } } as const

export function AwayPage() {
  const { session } = useAuth()
  const today = wardToday()
  const { data, error, reload } = useAsync(async () => {
    const [absences, profiles, bishopric] = await Promise.all([loadAbsences(supabase, today), loadProfiles(supabase), loadBishopric(supabase)])
    return { absences, profiles, leaderIds: bishopric.map((p) => p.id) }
  }, [today])
  const save = useAction()
  const [form, setForm] = useState({ starts_on: '', ends_on: '', location: '' })

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  // Warn before adding dates that leave a Sunday with one or none of the bishopric, and keep
  // showing every such Sunday ahead so the others see it too.
  const draft = { user_id: session?.user.id ?? '', starts_on: form.starts_on, ends_on: form.ends_on || form.starts_on, location: null }
  const draftShort = shortSundaysWith(draft, data.leaderIds, data.absences)
  const lastDay = data.absences.reduce((max, a) => (a.ends_on > max ? a.ends_on : max), today)
  const upcomingShort = shortSundays(today, lastDay, data.leaderIds, data.absences)

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
        <SaveError action={save} />
        {draftShort.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <ShortSundaysNote sundays={draftShort} leaderIds={data.leaderIds} people={data.profiles} intro="With these dates" />
          </Box>
        )}
      </SectionCard>

      <ShortSundaysNote sundays={upcomingShort} leaderIds={data.leaderIds} people={data.profiles} />

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
