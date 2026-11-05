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

/** Usual hours a first-timer starts from: Sunday after church, evenings on weekdays. */
const suggested = (day: number): Block => (day === 0 ? { starts_at: '09:00', ends_at: '11:00' } : { starts_at: '19:00', ends_at: '20:30' })

function StepBar({ step, of }: { step: number; of: number }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
        Step {step} of {of}
      </Typography>
      <Stack direction="row" spacing={0.75} aria-hidden>
        {Array.from({ length: of }, (_, i) => (
          <Box key={i} sx={{ flex: 1, height: 5, borderRadius: 3, bgcolor: i < step ? 'primary.main' : 'action.selected' }} />
        ))}
      </Stack>
    </Box>
  )
}

/**
 * Setting usual hours for the first time, one question per screen: which days, then what times.
 * "Add them one at a time" drops back to the full form.
 */
export function HoursWizard({ who, onSave, onSkip, busy }: { who: string | null; onSave: (hours: { weekday: number; block: Block }[]) => Promise<boolean>; onSkip: () => void; busy: boolean }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [days, setDays] = useState<number[]>([])
  const [blocks, setBlocks] = useState<Record<number, Block>>({})
  const [error, setError] = useState<string | null>(null)

  const toggle = (day: number) => {
    setDays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day].sort()))
    setBlocks((b) => (b[day] ? b : { ...b, [day]: suggested(day) }))
  }

  const save = async () => {
    for (const day of days) {
      const why = problem(blocks[day], [])
      if (why) return setError(`${WEEKDAYS[day]}: ${why}`)
    }
    setError(null)
    await onSave(days.map((day) => ({ weekday: day, block: blocks[day] })))
  }

  return (
    <SectionCard>
      <StepBar step={step} of={2} />
      {step === 1 ? (
        <>
          <Typography variant="h2" component="h2" sx={{ mb: 0.5 }}>
            Which days {who ? `can ${who}` : 'can you'} usually meet for interviews?
          </Typography>
          <Muted>Pick every day that works. You'll set the times next. The secretaries offer times inside these hours.</Muted>
          <Box role="group" aria-label="Days" sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, my: 2.5, maxWidth: 420 }}>
            {WEEKDAYS.map((name, day) => {
              const on = days.includes(day)
              return (
                <Button
                  key={day}
                  aria-label={name}
                  aria-pressed={on}
                  variant={on ? 'contained' : 'outlined'}
                  onClick={() => toggle(day)}
                  sx={{ minWidth: 0, aspectRatio: '1', borderRadius: '50%', p: 0, fontSize: '0.9375rem' }}
                >
                  {name.slice(0, 1)}
                </Button>
              )
            })}
          </Box>
          <Stack spacing={1}>
            <Button variant="contained" size="large" disabled={!days.length} onClick={() => setStep(2)}>
              Next
            </Button>
            <Button onClick={onSkip}>Add them one at a time instead</Button>
          </Stack>
        </>
      ) : (
        <>
          <Typography variant="h2" component="h2" sx={{ mb: 0.5 }}>
            What times on {days.length > 1 ? 'those days' : 'that day'}?
          </Typography>
          <Muted>These are a starting point. Change any day later, or add a second block of time on the same day.</Muted>
          <Stack spacing={2} sx={{ my: 2.5 }}>
            {days.map((day) => (
              <Box key={day} role="group" aria-label={WEEKDAYS[day]}>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>{WEEKDAYS[day]}</Typography>
                <Grid container spacing={1.5}>
                  <TimeRange value={blocks[day]} onChange={(b) => setBlocks({ ...blocks, [day]: b })} />
                </Grid>
              </Box>
            ))}
          </Stack>
          {error && (
            <Typography variant="body2" color="error" sx={{ mb: 1 }}>
              {error}
            </Typography>
          )}
          <Stack spacing={1}>
            <Button variant="contained" size="large" disabled={busy} onClick={() => void save()}>
              Save hours
            </Button>
            <Button onClick={() => setStep(1)}>Back</Button>
          </Stack>
        </>
      )}
    </SectionCard>
  )
}

export function HoursView({
  data,
  leaderId,
  onLeader,
  from,
  firstTime,
  selfId,
  actions,
  busy,
}: {
  data: HoursData
  leaderId: string
  onLeader: (id: string) => void
  from: IsoDate
  /** A leader opening this for the first time, sent here on sign-in. */
  firstTime: boolean
  /** The signed-in leader, whose own hours are asked about as "you". */
  selfId?: string
  actions: HoursActions
  busy: boolean
}) {
  const [usualDay, setUsualDay] = useState(0)
  const [usualBlock, setUsualBlock] = useState<Block>(empty)
  const [usualError, setUsualError] = useState<string | null>(null)
  const [editing, setEditing] = useState<IsoDate | null>(null)
  const [skipped, setSkipped] = useState<string[]>([])

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

      {firstTime && mine.length > 0 && (
        <Alert severity="success" sx={{ mb: 1.5 }}>
          Thanks. The secretaries can now offer these times. When a week is different, change just that day below. Away dates are taken out on their own.
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

      {!mine.length && !skipped.includes(leaderId) ? (
        <HoursWizard
          key={leaderId}
          who={leaderId === selfId ? null : (data.leaders.find((l) => l.id === leaderId)?.display_name ?? null)}
          busy={busy}
          onSkip={() => setSkipped([...skipped, leaderId])}
          onSave={async (hours) => {
            for (const h of hours) if (!(await actions.addUsual(h.weekday, h.block))) return false
            return true
          }}
        />
      ) : (
      <>
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
        <Muted>Change a day when this week is different. Away dates come from "Dates I'll be away" in Settings.</Muted>
        <Box sx={{ mt: 1 }}>
          {days.map((day) => (
            <DayRow key={day.date} day={day} editing={editing === day.date} onEdit={(on) => setEditing(on ? day.date : null)} actions={actions} busy={busy} />
          ))}
        </Box>
      </SectionCard>
      </>
      )}
    </>
  )
}
