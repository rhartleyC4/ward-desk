import CheckIcon from '@mui/icons-material/Check'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { personLabel } from '../lib/agenda'
import { appointmentPurpose, defaultSecretaryFor, leadersScheduledBy, schedulersFrom, splitAppointments, toInputs, toTimestamp, whenLabel, withDefaultSecretary } from '../lib/appointments'
import type { Enums } from '../lib/database.types'
import type { Appointment, AppointmentsData } from '../lib/queries'
import { nativeSelect } from '../theme'
import { Muted, SectionCard, Side, Split } from './Layout'

export type AppointmentsActions = {
  schedule: (id: string, scheduledAt: string) => void
  complete: (id: string) => void
  cancel: (id: string) => void
  add: (appointment: { interviewer_id: string; person_name: string; purpose: Enums<'interview_purpose'>; scheduled_at: string | null }) => void
  setSecretary: (leaderId: string, secretaryId: string, on: boolean) => void
}

const shrink = { inputLabel: { shrink: true } } as const

function WhenFields({ value, onChange, name }: { value: { date: string; time: string }; onChange: (v: { date: string; time: string }) => void; name: string }) {
  return (
    <>
      <TextField
        type="date"
        label="Date"
        slotProps={{ ...shrink, htmlInput: { 'aria-label': `Date for ${name}` } }}
        value={value.date}
        onChange={(e) => onChange({ ...value, date: e.target.value })}
        sx={{ flex: '1 1 9.5rem' }}
      />
      <TextField
        type="time"
        label="Time"
        slotProps={{ ...shrink, htmlInput: { 'aria-label': `Time for ${name}` } }}
        value={value.time}
        onChange={(e) => onChange({ ...value, time: e.target.value })}
        sx={{ flex: '1 1 7rem' }}
      />
    </>
  )
}

function AppointmentRow({ appointment: a, data, actions, timeZone }: { appointment: Appointment; data: AppointmentsData; actions: AppointmentsActions; timeZone: string }) {
  const [editing, setEditing] = useState(!a.scheduled_at)
  const [when, setWhen] = useState(toInputs(a.scheduled_at, timeZone))
  const name = a.person_name ?? 'Unnamed'
  const leader = personLabel(a.interviewer_id, data.profiles) || 'Unassigned'

  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!when.date || !when.time) return
    actions.schedule(a.id, toTimestamp(when.date, when.time, timeZone))
    if (a.scheduled_at) setEditing(false)
  }

  return (
    <Box component="article" aria-label={name}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
        <Typography>
          {a.scheduled_at && <strong>{whenLabel(a.scheduled_at, timeZone)} · </strong>}
          {name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          with {leader}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {appointmentPurpose(a, data.needs, data.candidates)}
      </Typography>
      {editing ? (
        <Stack component="form" onSubmit={save} direction="row" useFlexGap sx={{ mt: 1, gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <WhenFields value={when} onChange={setWhen} name={name} />
          <Button type="submit" variant="contained">
            Save
          </Button>
          {a.scheduled_at ? (
            <Button onClick={() => setEditing(false)}>Back</Button>
          ) : (
            <Button onClick={() => actions.cancel(a.id)}>Not needed</Button>
          )}
        </Stack>
      ) : (
        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
          <Button size="small" startIcon={<CheckIcon />} onClick={() => actions.complete(a.id)}>
            Done
          </Button>
          <Button size="small" onClick={() => setEditing(true)}>
            Reschedule
          </Button>
          <Button size="small" onClick={() => actions.cancel(a.id)}>
            Cancel
          </Button>
        </Stack>
      )}
    </Box>
  )
}

function AddAppointment({ data, onAdd, timeZone }: { data: AppointmentsData; onAdd: AppointmentsActions['add']; timeZone: string }) {
  const empty = { interviewer_id: '', person_name: '', purpose: 'other' as Enums<'interview_purpose'> }
  const [form, setForm] = useState(empty)
  const [when, setWhen] = useState({ date: '', time: '' })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.interviewer_id || !form.person_name.trim()) return
    onAdd({ ...form, person_name: form.person_name.trim(), scheduled_at: when.date && when.time ? toTimestamp(when.date, when.time, timeZone) : null })
    setForm(empty)
    setWhen({ date: '', time: '' })
  }
  return (
    <Box component="form" onSubmit={submit} aria-label="Add an appointment">
      {/* Wraps by the card's width rather than the screen's, so it fits the side column too. */}
      <Stack direction="row" useFlexGap sx={{ gap: 1.5, flexWrap: 'wrap' }}>
        <TextField label="Name" value={form.person_name} onChange={(e) => setForm({ ...form, person_name: e.target.value })} sx={{ flex: '1 1 100%' }} />
        <TextField select label="With" slotProps={nativeSelect} value={form.interviewer_id} onChange={(e) => setForm({ ...form, interviewer_id: e.target.value })} sx={{ flex: '1 1 8rem' }}>
          <option value="">—</option>
          {data.bishopric.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </TextField>
        <TextField
          select
          label="Purpose"
          slotProps={nativeSelect}
          value={form.purpose}
          onChange={(e) => setForm({ ...form, purpose: e.target.value as Enums<'interview_purpose'> })}
          sx={{ flex: '1 1 8rem' }}
        >
          <option value="calling">Calling</option>
          <option value="temple_recommend">Temple recommend</option>
          <option value="ppi">PPI</option>
          <option value="youth">Youth</option>
          <option value="tithing_declaration">Tithing declaration</option>
          <option value="advancement">Advancement</option>
          <option value="other">Other</option>
        </TextField>
      </Stack>
      <Stack direction="row" useFlexGap sx={{ mt: 1.5, gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <WhenFields value={when} onChange={setWhen} name="the new appointment" />
        <Button type="submit" variant="outlined">
          Add
        </Button>
      </Stack>
      <Muted>Leave the time blank to schedule it later.</Muted>
    </Box>
  )
}

/** Which secretaries schedule for each leader. */
export function WhoSchedules({ data, onChange }: { data: AppointmentsData; onChange: AppointmentsActions['setSecretary'] }) {
  const schedulers = schedulersFrom(data.secretaries, data.assignments)
  if (!schedulers.length) return <Muted>No executive secretaries yet. An admin sets each person's office in Settings, under Who can sign in.</Muted>
  return (
    <Stack divider={<Divider flexItem />} spacing={1.5}>
      {data.bishopric.map((leader) => {
        const label = personLabel(leader.id, data.profiles) || leader.display_name
        const fallback = defaultSecretaryFor(leader.id, data.assignments, data.secretaries)
        return (
          <Box key={leader.id} role="group" aria-label={`Who schedules for ${label}`}>
            <Typography variant="h3">{leader.display_name}</Typography>
            {fallback && <Muted>No one picked, so {fallback.display_name} schedules, as the only executive secretary.</Muted>}
            <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', columnGap: 2 }}>
              {schedulers.map((s) => (
                <FormControlLabel
                  key={s.id}
                  label={s.display_name}
                  control={
                    <Checkbox
                      checked={data.assignments.some((a) => a.leader_id === leader.id && a.secretary_id === s.id)}
                      onChange={(e) => onChange(leader.id, s.id, e.target.checked)}
                    />
                  }
                />
              ))}
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}

/**
 * The executive secretaries' list: appointments the bishopric has assigned that still need a time,
 * then the ones booked. Each secretary sees the leaders they schedule for unless they ask for everyone.
 */
export function AppointmentsView({
  data,
  userId,
  actions,
  timeZone,
}: {
  data: AppointmentsData
  userId: string
  actions: AppointmentsActions
  timeZone: string
}) {
  const mine = leadersScheduledBy(userId, withDefaultSecretary(data.assignments, data.bishopric.map((l) => l.id), data.secretaries))
  const [scope, setScope] = useState<'mine' | 'all'>(mine.length ? 'mine' : 'all')
  const { toSchedule, scheduled } = splitAppointments(data.appointments, scope === 'mine' && mine.length ? mine : undefined)
  const mineLabel = mine.map((id) => personLabel(id, data.profiles)).filter(Boolean).join(', ')

  return (
    <>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Typography variant="h1">Appointments</Typography>
        {/* Nothing to switch between when this secretary covers every leader. */}
        {mine.length > 0 && mine.length < data.bishopric.length && (
          <ToggleButtonGroup size="small" exclusive value={scope} onChange={(_, v) => v && setScope(v)} aria-label="Whose appointments">
            <ToggleButton value="mine">For {mineLabel}</ToggleButton>
            <ToggleButton value="all">Everyone</ToggleButton>
          </ToggleButtonGroup>
        )}
      </Stack>

      <Split>
        <SectionCard title={`To schedule (${toSchedule.length})`}>
          {toSchedule.length ? (
            <Stack divider={<Divider flexItem />} spacing={1.5}>
              {toSchedule.map((a) => (
                <AppointmentRow key={a.id} appointment={a} data={data} actions={actions} timeZone={timeZone} />
              ))}
            </Stack>
          ) : (
            <Muted>Nothing waiting. Names the bishopric assigns in the meeting show up here.</Muted>
          )}
        </SectionCard>

        <SectionCard title="Scheduled">
          {scheduled.length ? (
            <Stack divider={<Divider flexItem />} spacing={1.5}>
              {scheduled.map((a) => (
                <AppointmentRow key={a.id} appointment={a} data={data} actions={actions} timeZone={timeZone} />
              ))}
            </Stack>
          ) : (
            <Muted>No appointments booked.</Muted>
          )}
        </SectionCard>

        <Side>
          <SectionCard title="Add an appointment">
            <AddAppointment data={data} onAdd={actions.add} timeZone={timeZone} />
          </SectionCard>
        </Side>
      </Split>
    </>
  )
}
