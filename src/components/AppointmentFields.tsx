// Controls for one appointment, shared by the secretary's Home (before booking), the Appointments
// tab (after) and the Reminders page (the day before).

import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import type { Enums } from '../lib/database.types'
import type { Appointment } from '../lib/queries'
import { adjustMinutes, minutesLabel } from '../lib/slots'

/** Shorter and longer by the usual steps, never below the least a kind of interview takes. */
export function LengthControl({ minutes, onChange, purpose, name, busy }: { minutes: number; onChange: (m: number) => void; purpose: Enums<'interview_purpose'>; name: string; busy: boolean }) {
  const shorter = adjustMinutes(minutes, -1, purpose)
  const longer = adjustMinutes(minutes, 1, purpose)
  return (
    <Stack direction="row" sx={{ alignItems: 'center' }} role="group" aria-label={`Length for ${name}`}>
      <IconButton size="small" aria-label={`Shorter for ${name}`} disabled={busy || shorter === minutes} onClick={() => onChange(shorter)}>
        <RemoveIcon fontSize="small" />
      </IconButton>
      <Typography variant="body2" sx={{ minWidth: 64, textAlign: 'center' }}>
        {minutesLabel(minutes)}
      </Typography>
      <IconButton size="small" aria-label={`Longer for ${name}`} disabled={busy || longer === minutes} onClick={() => onChange(longer)}>
        <AddIcon fontSize="small" />
      </IconButton>
    </Stack>
  )
}

/** Records whether this is a youth's appointment, and the parent to greet. */
export type SetYouth = (id: string, isYouth: boolean, parentName: string | null) => void

/**
 * Whether this is a youth (under 18), whose parent gets the message, and the parent's name for
 * the greeting. Saved as soon as it changes, so the next message uses it.
 */
export function YouthFields({ appointment: a, onChange, busy }: { appointment: Appointment; onChange: SetYouth; busy: boolean }) {
  const [parent, setParent] = useState(a.parent_name ?? '')
  const name = a.person_name ?? 'this person'
  const saveParent = () => {
    const next = parent.trim() || null
    if (next !== a.parent_name) onChange(a.id, true, next)
  }
  return (
    <Stack direction="row" useFlexGap sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
      <FormControlLabel
        label="Youth under 18: message a parent"
        control={<Checkbox checked={a.is_youth} disabled={busy} onChange={(e) => onChange(a.id, e.target.checked, a.parent_name)} />}
      />
      {a.is_youth && (
        <TextField
          label="Parent's name"
          placeholder="Sister Quinn"
          size="small"
          value={parent}
          onChange={(e) => setParent(e.target.value)}
          onBlur={saveParent}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          slotProps={{ htmlInput: { 'aria-label': `Parent's name for ${name}` } }}
          sx={{ flex: '1 1 12rem', maxWidth: 280 }}
        />
      )}
    </Stack>
  )
}
