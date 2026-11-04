import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { blockLabel, dayLabel, daysFor, overlaps, usualOn, WEEKDAYS, type Block, type Day, type DayChange, type UsualHours } from '../lib/availability'
import { longDate, weekday, type IsoDate } from '../lib/dates'
import type { Absence, Profile } from '../lib/queries'
import { nativeSelect } from '../theme'
import { Muted, SectionCard } from './Layout'

export type HoursData = { hours: UsualHours[]; changes: DayChange[]; absences: Absence[]; leaders: Profile[] }

export type HoursActions = {
  addUsual: (weekday: number, block: Block) => Promise<boolean>
  deleteUsual: (id: string) => void
  addDay: (date: IsoDate, block: Block) => Promise<boolean>
  dayOff: (date: IsoDate) => void
  resetDay: (date: IsoDate) => void
}

/** How many days ahead the week-by-week list shows. */
export const DAYS_AHEAD = 14

const shrink = { inputLabel: { shrink: true } } as const
const empty = { starts_at: '', ends_at: '' }

/** Checks a typed block of time against the ones already there; returns why it can't be added. */
function problem(block: Block, existing: Block[]): string | null {
  if (!block.starts_at || !block.ends_at) return 'Enter a start and end time.'
  if (block.ends_at <= block.starts_at) return 'The end time must be after the start time.'
  if (overlaps(existing, block)) return 'That overlaps hours already set for this day.'
  return null
}

function TimeRange({ value, onChange }: { value: Block; onChange: (b: Block) => void }) {
  return (
    <>
      <Grid size={{ xs: 6, sm: 3 }}>
        <TextField label="From" type="time" slotProps={shrink} value={value.starts_at} onChange={(e) => onChange({ ...value, starts_at: e.target.value })} />
      </Grid>
      <Grid size={{ xs: 6, sm: 3 }}>
        <TextField label="To" type="time" slotProps={shrink} value={value.ends_at} onChange={(e) => onChange({ ...value, ends_at: e.target.value })} />
      </Grid>
    </>
  )
}

const KIND_CHIP: Partial<Record<Day['kind'], { label: string; color: 'warning' | 'info' }>> = {
  changed: { label: 'Changed', color: 'info' },
  away: { label: 'Away', color: 'warning' },
}

function DayRow({ day, editing, onEdit, actions, busy }: { day: Day; editing: boolean; onEdit: (on: boolean) => void; actions: HoursActions; busy: boolean }) {
  const [block, setBlock] = useState<Block>(empty)
  const [error, setError] = useState<string | null>(null)
  const chip = KIND_CHIP[day.kind]
  const name = `${WEEKDAYS[weekday(day.date)].slice(0, 3)}, ${longDate(day.date)}`

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    // A changed day adds to its changed hours; any other day starts fresh.
    const why = problem(block, day.kind === 'changed' ? day.blocks : [])
    setError(why)
    if (why) return
    if (await actions.addDay(day.date, block)) setBlock(empty)
  }

  return (
    <Box sx={{ py: 1, borderTop: 1, borderColor: 'divider' }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {name}
          </Typography>
          <Typography variant="body2" color={day.kind === 'none' || day.kind === 'off' ? 'text.secondary' : 'text.primary'}>
            {dayLabel(day)}
          </Typography>
        </Box>
        {chip && <Chip size="small" label={chip.label} color={chip.color} variant="outlined" />}
        {day.kind !== 'away' && (
          <Stack direction="row" sx={{ gap: 0.5 }}>
            <Button size="small" onClick={() => onEdit(!editing)}>
              {editing ? 'Done' : day.kind === 'none' || day.kind === 'off' ? 'Add hours' : 'Change'}
            </Button>
            {(day.kind === 'usual' || day.kind === 'changed') && (
              <Button size="small" disabled={busy} onClick={() => actions.dayOff(day.date)}>
                Not available
              </Button>
            )}
            {(day.kind === 'changed' || day.kind === 'off') && (
              <Button size="small" disabled={busy} onClick={() => actions.resetDay(day.date)}>
                Undo
              </Button>
            )}
          </Stack>
        )}
      </Stack>
      {editing && (
        <Box component="form" onSubmit={submit} sx={{ mt: 1 }}>
          {day.kind === 'usual' && <Muted>Hours you add here replace the usual hours for this day only.</Muted>}
          <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
            <TimeRange value={block} onChange={setBlock} />
            <Grid size={{ xs: 12, sm: 3 }}>
              <Button type="submit" variant="outlined" fullWidth disabled={busy}>
                Add
              </Button>
            </Grid>
          </Grid>
          {error && (
            <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
              {error}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  )
}

export function HoursView({
  data,
  leaderId,
  onLeader,
  from,
  firstTime,
  actions,
  busy,
}: {
  data: HoursData
  leaderId: string
  onLeader: (id: string) => void
  from: IsoDate
  /** A leader opening this for the first time, sent here on sign-in. */
  firstTime: boolean
  actions: HoursActions
  busy: boolean
}) {
  const [usualDay, setUsualDay] = useState(0)
  const [usualBlock, setUsualBlock] = useState<Block>(empty)
  const [usualError, setUsualError] = useState<string | null>(null)
  const [editing, setEditing] = useState<IsoDate | null>(null)

  const mine = data.hours.filter((h) => h.user_id === leaderId)
  const days = daysFor(leaderId, from, DAYS_AHEAD, data.hours, data.changes, data.absences)

  const addUsual = async (e: FormEvent) => {
    e.preventDefault()
    const why = problem(usualBlock, usualOn(leaderId, usualDay, data.hours))
    setUsualError(why)
    if (why) return
    if (await actions.addUsual(usualDay, usualBlock)) setUsualBlock(empty)
  }

  return (
    <>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Appointment hours
      </Typography>

      {firstTime && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Set the times you're usually free for appointments, so the executive secretaries can offer them. When a week is different, change just that day below. Away dates are taken out
          on their own.
        </Alert>
      )}

      {data.leaders.length > 1 && (
        <TextField select label="Hours for" slotProps={nativeSelect} value={leaderId} onChange={(e) => onLeader(e.target.value)} sx={{ mb: 1.5, maxWidth: 320 }}>
          {data.leaders.map((l) => (
            <option key={l.id} value={l.id}>
              {l.display_name ?? l.email}
            </option>
          ))}
        </TextField>
      )}

      <SectionCard title="Usual hours">
        {mine.length ? (
          <Box sx={{ mb: 2 }}>
            {WEEKDAYS.map((name, day) =>
              usualOn(leaderId, day, data.hours).map((h, i) => (
                <Stack key={h.id} direction="row" sx={{ alignItems: 'center', py: 0.5, borderTop: i ? 0 : 1, borderColor: 'divider' }}>
                  <Typography variant="body2" sx={{ width: 110, fontWeight: 500 }}>
                    {i ? '' : name}
                  </Typography>
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {blockLabel(h)}
                  </Typography>
                  <IconButton size="small" aria-label={`Remove ${name} ${blockLabel(h)}`} disabled={busy} onClick={() => actions.deleteUsual(h.id)}>
                    <DeleteOutlinedIcon fontSize="small" />
                  </IconButton>
                </Stack>
              )),
            )}
          </Box>
        ) : (
          <Box sx={{ mb: 2 }}>
            <Muted>No usual hours yet. Add each block of time you're free, like Sunday 9–11 AM.</Muted>
          </Box>
        )}
        <Grid component="form" container spacing={1.5} onSubmit={addUsual}>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField select label="Day" slotProps={nativeSelect} value={usualDay} onChange={(e) => setUsualDay(Number(e.target.value))}>
              {WEEKDAYS.map((name, day) => (
                <option key={day} value={day}>
                  {name}
                </option>
              ))}
            </TextField>
          </Grid>
          <TimeRange value={usualBlock} onChange={setUsualBlock} />
          <Grid size={{ xs: 12, sm: 3 }}>
            <Button type="submit" variant="contained" fullWidth disabled={busy}>
              Add
            </Button>
          </Grid>
        </Grid>
        {usualError && (
          <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
            {usualError}
          </Typography>
        )}
      </SectionCard>

      <SectionCard title="Next two weeks">
        <Muted>Change a day when this week is different. Away dates come from the Away page.</Muted>
        <Box sx={{ mt: 1 }}>
          {days.map((day) => (
            <DayRow key={day.date} day={day} editing={editing === day.date} onEdit={(on) => setEditing(on ? day.date : null)} actions={actions} busy={busy} />
          ))}
        </Box>
      </SectionCard>
    </>
  )
}
