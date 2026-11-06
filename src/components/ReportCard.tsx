import CheckIcon from '@mui/icons-material/Check'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { WEEKDAYS } from '../lib/availability'
import { longDate, weekday } from '../lib/dates'
import type { Appointment, Report } from '../lib/queries'
import { bookedRange, wardParts } from '../lib/slots'
import { Muted, SectionCard } from './Layout'
import { Choices } from './Steps'

export type ReportAction = (appointment: Appointment, report: Report) => Promise<boolean>

type Next = 'reschedule' | 'handled'

/** "Didn't come": find a new time, or say how the leader will handle it. */
function Missed({ appointment: a, secretary, onReport, onCancel, busy }: { appointment: Appointment; secretary: string; onReport: ReportAction; onCancel: () => void; busy: boolean }) {
  const [next, setNext] = useState<Next>('reschedule')
  const [note, setNote] = useState('')
  const name = a.person_name ?? 'They'
  const canSave = next === 'reschedule' || !!note.trim()
  const save = () => onReport(a, next === 'reschedule' ? { outcome: 'reschedule', note: note.trim() || null } : { outcome: 'handled', note: note.trim() })
  return (
    <Box
      component="form"
      aria-label={`What next for ${name}`}
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave && !busy) void save()
      }}
      sx={{ mt: 1 }}
    >
      <Typography variant="h3" sx={{ mb: 0.5 }}>
        What should happen next?
      </Typography>
      <Choices
        label="What next"
        value={next}
        onChange={setNext}
        options={[
          { value: 'reschedule', label: 'Find a new time', hint: `${secretary} will reach out and book another time.` },
          { value: 'handled', label: "I'll take care of it", hint: 'Nothing goes back to the secretary. Say how you\'ll handle it.' },
        ]}
      />
      <TextField
        multiline
        minRows={2}
        label={next === 'reschedule' ? 'Note for the secretary (optional)' : 'How will you handle it?'}
        placeholder={next === 'reschedule' ? 'Evenings work better for them' : "I'll catch him after church"}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 500 } }}
        sx={{ mt: 1 }}
      />
      <Stack direction="row" useFlexGap sx={{ mt: 1.5, gap: 1, flexWrap: 'wrap' }}>
        <Button type="submit" variant="contained" size="large" disabled={!canSave || busy}>
          {next === 'reschedule' ? `Send back to ${secretary}` : 'Save'}
        </Button>
        <Button size="large" onClick={onCancel}>
          Cancel
        </Button>
      </Stack>
    </Box>
  )
}

function ReportRow({ appointment: a, timeZone, secretary, onReport, busy }: { appointment: Appointment; timeZone: string; secretary: string; onReport: ReportAction; busy: boolean }) {
  const [missed, setMissed] = useState(false)
  const name = a.person_name ?? 'Someone'
  const date = wardParts(a.scheduled_at!, timeZone).date
  return (
    <Box component="article" aria-label={name}>
      <Typography sx={{ fontWeight: 600 }}>{name}</Typography>
      <Muted>
        {WEEKDAYS[weekday(date)]}, {longDate(date)} · {bookedRange(a.scheduled_at!, a.duration_minutes, timeZone)}
      </Muted>
      {missed ? (
        <Missed appointment={a} secretary={secretary} onReport={onReport} onCancel={() => setMissed(false)} busy={busy} />
      ) : (
        <Stack direction="row" useFlexGap sx={{ mt: 1, gap: 1, flexWrap: 'wrap' }}>
          <Button variant="contained" size="large" startIcon={<CheckIcon />} disabled={busy} onClick={() => void onReport(a, { outcome: 'done' })}>
            Done
          </Button>
          <Button variant="outlined" size="large" disabled={busy} onClick={() => setMissed(true)}>
            Didn't come
          </Button>
        </Stack>
      )}
    </Box>
  )
}

/**
 * The leader's appointments that are over, to mark done or missed. A missed one goes back to the
 * secretary for a new time, or the leader says how they'll handle it.
 */
export function ReportCard({ appointments, timeZone, secretaryFor, onReport, busy }: {
  /** Already filtered to this leader's ended, unreported appointments (toReport). */
  appointments: Appointment[]
  timeZone: string
  /** Who books for this appointment's leader, as named on the button ("the secretary" if no one). */
  secretaryFor: (a: Appointment) => string
  onReport: ReportAction
  busy: boolean
}) {
  if (!appointments.length) return null
  const markAll = async () => {
    for (const a of appointments) if (!(await onReport(a, { outcome: 'done' }))) return
  }
  return (
    <SectionCard
      title="How did these go?"
      waiting={appointments.length}
      action={
        appointments.length > 1 && (
          <Button size="small" disabled={busy} onClick={() => void markAll()}>
            Mark all done
          </Button>
        )
      }
    >
      <Stack divider={<Divider flexItem />} spacing={1.5}>
        {appointments.map((a) => (
          <ReportRow key={a.id} appointment={a} timeZone={timeZone} secretary={secretaryFor(a)} onReport={onReport} busy={busy} />
        ))}
      </Stack>
    </SectionCard>
  )
}
