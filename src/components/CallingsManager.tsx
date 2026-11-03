import CheckIcon from '@mui/icons-material/Check'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { needsToDiscuss, unsortedSuggestions } from '../lib/agenda'
import { appointmentFor, NEEDS_APPOINTMENT, whenLabel } from '../lib/appointments'
import type { IsoDate } from '../lib/dates'
import type { Enums, TablesUpdate } from '../lib/database.types'
import type { Appointment, CallingNeed, Candidate, Profile } from '../lib/queries'
import { nativeSelect } from '../theme'
import { CallingField } from './CallingField'
import { Muted } from './Layout'

const STATUSES: { value: Enums<'candidate_status'>; label: string }[] = [
  { value: 'suggested', label: 'Suggested' },
  { value: 'discussing', label: 'Discussing' },
  { value: 'approved', label: 'Approved' },
  { value: 'extended', label: 'Extended' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'sustained', label: 'Sustained' },
  { value: 'set_apart', label: 'Set apart' },
]

const dateLabel = { inputLabel: { shrink: true } } as const

export type CallingsData = {
  needs: CallingNeed[]
  candidates: Candidate[]
  appointments: Appointment[]
  bishopric: Profile[]
  profiles: Profile[]
}

export type CallingsActions = {
  addNeed: (need: { calling_title: string; release_name: string | null }) => void
  updateNeed: (id: string, changes: TablesUpdate<'calling_needs'>) => void
  addCandidate: (needId: string, name: string) => void
  updateCandidate: (id: string, changes: TablesUpdate<'calling_candidates'>) => void
  /** Sets the sustain and release dates and marks the appointment met. */
  acceptCandidate: (candidate: Candidate) => void
  /** Who in the bishopric meets with the person; null takes the appointment back. */
  assignAppointment: (candidate: Candidate, leaderId: string | null) => void
}

/** Where the appointment stands, for the line under the "Meets with" picker. */
function appointmentNote(appointment: Appointment | undefined, timeZone: string): string {
  if (!appointment) return ''
  if (appointment.status === 'completed') return 'Met'
  return appointment.scheduled_at ? whenLabel(appointment.scheduled_at, timeZone) : 'Waiting to be scheduled'
}

function CandidateRow({ candidate: c, data, actions, timeZone }: { candidate: Candidate; data: CallingsData; actions: CallingsActions; timeZone: string }) {
  const appointment = appointmentFor(c.id, data.appointments)
  const open = appointment?.status === 'scheduled' ? appointment : undefined
  const showMeets = NEEDS_APPOINTMENT.includes(c.status) || !!open
  const showSustain = ['accepted', 'sustained', 'set_apart'].includes(c.status)

  return (
    // Name on its own line on phones, then status and the rest two to a row; one row from sm up.
    <Grid container spacing={1.5} sx={{ alignItems: 'center' }}>
      <Grid size={{ xs: 12, sm: 3 }} sx={c.status === 'declined' ? { textDecoration: 'line-through', color: 'text.secondary' } : undefined}>
        {c.person_name}
      </Grid>
      <Grid size={{ xs: 6, sm: 3 }}>
        <TextField
          select
          label="Status"
          slotProps={{ ...nativeSelect, htmlInput: { 'aria-label': `Status for ${c.person_name}` } }}
          value={c.status}
          onChange={(e) => {
            const status = e.target.value as Enums<'candidate_status'>
            if (status === 'accepted') actions.acceptCandidate(c)
            else actions.updateCandidate(c.id, { status })
          }}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </TextField>
      </Grid>
      {showMeets && (
        <Grid size={{ xs: 6, sm: 3 }}>
          <TextField
            select
            label="Meets with"
            slotProps={{ ...nativeSelect, htmlInput: { 'aria-label': `Who meets with ${c.person_name}` } }}
            value={open?.interviewer_id ?? ''}
            onChange={(e) => actions.assignAppointment(c, e.target.value || null)}
            helperText={appointmentNote(appointment, timeZone) || undefined}
          >
            <option value="">—</option>
            {data.bishopric.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </TextField>
        </Grid>
      )}
      {showSustain && (
        <Grid size={{ xs: 6, sm: 3 }}>
          <TextField
            type="date"
            label="Sustain on"
            slotProps={dateLabel}
            value={c.sustain_on ?? ''}
            onChange={(e) => actions.updateCandidate(c.id, { sustain_on: e.target.value || null })}
            helperText="Moves to Sustainings that day"
          />
        </Grid>
      )}
    </Grid>
  )
}

function NeedBlock({ need, data, actions, timeZone }: { need: CallingNeed; data: CallingsData; actions: CallingsActions; timeZone: string }) {
  const [name, setName] = useState('')
  const all = data.candidates.filter((c) => c.need_id === need.id)

  return (
    <Box component="article" aria-label={need.calling_title}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
        <Typography variant="h3">{need.calling_title}</Typography>
        <Button size="small" startIcon={<CheckIcon />} onClick={() => actions.updateNeed(need.id, { status: 'filled' })}>
          Mark filled
        </Button>
      </Stack>
      {need.release_name && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, mb: 1.5 }}>
          <Typography variant="body2">
            <Box component="span" sx={{ color: 'text.secondary' }}>
              Release:
            </Box>{' '}
            {need.release_name}
          </Typography>
          <TextField
            type="date"
            label="Announce on"
            slotProps={dateLabel}
            value={need.release_on ?? ''}
            onChange={(e) => actions.updateNeed(need.id, { release_on: e.target.value || null })}
            sx={{ width: 180 }}
          />
        </Stack>
      )}
      {all.length > 0 && (
        <Stack divider={<Divider flexItem />} spacing={1.5}>
          {all.map((c) => (
            <CandidateRow key={c.id} candidate={c} data={data} actions={actions} timeZone={timeZone} />
          ))}
        </Stack>
      )}
      <Stack
        component="form"
        direction="row"
        spacing={1}
        sx={{ mt: 1.5 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          actions.addCandidate(need.id, name.trim())
          setName('')
        }}
      >
        <TextField
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name to consider"
          slotProps={{ htmlInput: { 'aria-label': `Name to consider for ${need.calling_title}` } }}
        />
        <Button type="submit" variant="outlined">
          Add
        </Button>
      </Stack>
    </Box>
  )
}

function AddNeed({ onAdd }: { onAdd: CallingsActions['addNeed'] }) {
  const [form, setForm] = useState({ calling_title: '', release_name: '' })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.calling_title.trim()) return
    onAdd({ calling_title: form.calling_title.trim(), release_name: form.release_name.trim() || null })
    setForm({ calling_title: '', release_name: '' })
  }
  return (
    <Box component="form" onSubmit={submit} aria-label="Add a calling to fill">
      <Typography variant="h3" sx={{ mb: 1 }}>
        Add a calling to fill
      </Typography>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 5 }}>
          <CallingField value={form.calling_title} onChange={(calling_title) => setForm({ ...form, calling_title })} />
        </Grid>
        <Grid size={{ xs: 12, sm: 5 }}>
          <TextField label="Releasing (optional)" value={form.release_name} onChange={(e) => setForm({ ...form, release_name: e.target.value })} />
        </Grid>
        <Grid size={{ xs: 12, sm: 2 }}>
          <Button type="submit" variant="contained" fullWidth>
            Add
          </Button>
        </Grid>
      </Grid>
    </Box>
  )
}

/**
 * Everything the bishopric does with callings, worked through during the bishopric meeting. A
 * calling leaves this list on the Sunday its accepted name is sustained.
 */
export function CallingsManager({ date, data, actions, timeZone }: { date: IsoDate; data: CallingsData; actions: CallingsActions; timeZone: string }) {
  const suggestions = unsortedSuggestions(data.candidates)
  const openNeeds = needsToDiscuss(date, data.needs, data.candidates)

  return (
    <Stack divider={<Divider flexItem />} spacing={2}>
      {suggestions.length > 0 && (
        <Box>
          <Typography variant="h3" sx={{ mb: 0.5 }}>
            New suggestions
          </Typography>
          <List disablePadding>
            {suggestions.map((s) => (
              <ListItem key={s.id} disableGutters sx={{ gap: 1, flexWrap: 'wrap' }}>
                <Box sx={{ flex: '1 1 12rem' }}>
                  <strong>{s.person_name}</strong> for {s.calling_title}
                  {s.notes ? (
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      {' '}
                      — {s.notes}
                    </Box>
                  ) : null}
                </Box>
                <TextField
                  select
                  slotProps={{ select: { native: true }, htmlInput: { 'aria-label': `Attach ${s.person_name} to a calling` } }}
                  value=""
                  onChange={(e) => e.target.value && actions.updateCandidate(s.id, { need_id: e.target.value, status: 'discussing' })}
                  sx={{ width: 200 }}
                >
                  <option value="">Attach to…</option>
                  {openNeeds.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.calling_title}
                    </option>
                  ))}
                </TextField>
                <Button size="small" onClick={() => actions.updateCandidate(s.id, { status: 'declined' })}>
                  Dismiss
                </Button>
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {openNeeds.length === 0 && <Muted>No callings to fill.</Muted>}
      {openNeeds.map((need) => (
        <NeedBlock key={need.id} need={need} data={data} actions={actions} timeZone={timeZone} />
      ))}

      <AddNeed onAdd={actions.addNeed} />
    </Stack>
  )
}
