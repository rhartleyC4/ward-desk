import AddIcon from '@mui/icons-material/Add'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent, type ReactNode } from 'react'
import { personLabel } from '../lib/agenda'
import type { EventDraft, Profile, RotationDraft, StandingEvent, StandingRotation } from '../lib/queries'
import { formatTime, monthsLabel, rotationDayLabel } from '../lib/schedule'
import { ORGANIZATIONS } from '../lib/callings'
import type { Tables } from '../lib/database.types'
import { nativeSelect } from '../theme'
import { Muted, SectionCard } from './Layout'

export type ScheduleData = {
  events: StandingEvent[]
  rotations: StandingRotation[]
  stewardships: Tables<'stewardships'>[]
  profiles: Profile[]
  /** The bishop and counselors, who can be given a rotation or an assignment. */
  bishopric: Profile[]
}

export type ScheduleActions = {
  saveEvent: (event: EventDraft, id?: string) => Promise<boolean>
  deleteEvent: (id: string) => Promise<boolean>
  saveRotation: (rotation: RotationDraft, id?: string) => Promise<boolean>
  deleteRotation: (id: string) => Promise<boolean>
  addStewardship: (userId: string, area: string) => Promise<boolean>
  deleteStewardship: (id: string) => Promise<boolean>
}

type Props = { data: ScheduleData; canEdit: boolean; actions: ScheduleActions; busy: boolean }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const NTH = ['', '1st', '2nd', '3rd', '4th', '5th']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Every Sunday, 8:30" or "2nd Sunday, 9:15". */
function eventWhen(e: Pick<StandingEvent, 'weekday' | 'week_of_month' | 'start_time'>): string {
  const day = e.week_of_month ? `${NTH[e.week_of_month]} ${DAYS[e.weekday]}` : `Every ${DAYS[e.weekday]}`
  return e.start_time ? `${day}, ${formatTime(e.start_time)}` : day
}

/** "Bishop Avery" or the label ("EQ President") for someone not in the app. */
function rotationWho(r: StandingRotation, profiles: Profile[]): string {
  return r.assignee_id ? personLabel(r.assignee_id, profiles) : (r.assignee_label ?? '')
}

function Row({ primary, secondary, onEdit, editLabel }: { primary: ReactNode; secondary: ReactNode; onEdit?: () => void; editLabel: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography>{primary}</Typography>
        <Muted>{secondary}</Muted>
      </Box>
      {onEdit && (
        <IconButton aria-label={editLabel} onClick={onEdit}>
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  )
}

function FormButtons({ busy, canSave, onCancel, onDelete, saveLabel }: { busy: boolean; canSave: boolean; onCancel: () => void; onDelete?: () => void; saveLabel: string }) {
  return (
    <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
      <Button type="submit" variant="contained" disabled={busy || !canSave}>
        {saveLabel}
      </Button>
      <Button onClick={onCancel}>Cancel</Button>
      {onDelete && (
        <Button color="error" onClick={onDelete} disabled={busy} sx={{ ml: 'auto' }}>
          Delete
        </Button>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Regular meetings
// ---------------------------------------------------------------------------

function EventForm({ event, busy, onSave, onCancel, onDelete }: { event?: StandingEvent; busy: boolean; onSave: (e: EventDraft) => void; onCancel: () => void; onDelete?: () => void }) {
  const [title, setTitle] = useState(event?.title ?? '')
  const [weekday, setWeekday] = useState(event?.weekday ?? 0)
  const [week, setWeek] = useState(event?.week_of_month ?? 0)
  const [time, setTime] = useState(event?.start_time?.slice(0, 5) ?? '')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (title.trim()) onSave({ title: title.trim(), weekday, week_of_month: week || null, start_time: time || null })
  }
  return (
    <Box component="form" onSubmit={submit} aria-label={event ? `Edit ${event.title}` : 'New meeting'} sx={{ py: 1 }}>
      <Grid container spacing={1.5}>
        <Grid size={12}>
          <TextField label="Meeting" required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!event} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <TextField select label="Which weeks" slotProps={nativeSelect} value={week} onChange={(e) => setWeek(Number(e.target.value))}>
            <option value={0}>Every week</option>
            {[1, 2, 3, 4, 5].map((w) => (
              <option key={w} value={w}>
                {NTH[w]} only
              </option>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <TextField select label="Day" slotProps={nativeSelect} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField label="Time (optional)" type="time" slotProps={{ inputLabel: { shrink: true } }} value={time} onChange={(e) => setTime(e.target.value)} />
        </Grid>
      </Grid>
      <FormButtons busy={busy} canSave={!!title.trim()} onCancel={onCancel} onDelete={onDelete} saveLabel={event ? 'Save' : 'Add meeting'} />
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Rotations
// ---------------------------------------------------------------------------

const SOMEONE_ELSE = 'other'

function RotationForm({ rotation, bishopric, busy, onSave, onCancel, onDelete }: {
  rotation?: StandingRotation
  bishopric: Profile[]
  busy: boolean
  onSave: (r: RotationDraft) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [title, setTitle] = useState(rotation?.title ?? '')
  const [who, setWho] = useState(rotation?.assignee_id ?? (rotation ? SOMEONE_ELSE : (bishopric[0]?.id ?? SOMEONE_ELSE)))
  const [label, setLabel] = useState(rotation?.assignee_label ?? '')
  const [months, setMonths] = useState<number[]>(rotation?.months ?? [])
  const [week, setWeek] = useState(rotation?.week_of_month ?? 0)
  const [weekday, setWeekday] = useState(rotation?.weekday ?? 0)
  // Keep an assignee who is no longer one of the bishop and counselors choosable.
  const unlisted = rotation?.assignee_id && !bishopric.some((p) => p.id === rotation.assignee_id) ? rotation.assignee_id : null

  const toggle = (m: number) => setMonths((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m].sort((a, b) => a - b)))
  const canSave = !!title.trim() && months.length > 0
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    const someoneElse = who === SOMEONE_ELSE
    onSave({
      title: title.trim(),
      assignee_id: someoneElse ? null : who,
      assignee_label: someoneElse ? label.trim() || null : null,
      months: [...months].sort((a, b) => a - b),
      week_of_month: week || null,
      weekday: week ? weekday : null,
    })
  }

  return (
    <Box component="form" onSubmit={submit} aria-label={rotation ? `Edit ${rotation.title}` : 'New rotation'} sx={{ py: 1 }}>
      <Grid container spacing={1.5}>
        <Grid size={12}>
          <TextField label="Rotation" required placeholder="PPI: Elders Quorum President" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!rotation} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField select label="Whose turn" slotProps={nativeSelect} value={who} onChange={(e) => setWho(e.target.value)}>
            {bishopric.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
            {unlisted && <option value={unlisted}>Current assignee</option>}
            <option value={SOMEONE_ELSE}>Someone not in the app</option>
          </TextField>
        </Grid>
        {who === SOMEONE_ELSE && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField label="Who (optional)" placeholder="EQ President" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Grid>
        )}
        <Grid size={12}>
          <Typography variant="body2" color="text.secondary" id="rotation-months" sx={{ mb: 0.75 }}>
            Months
          </Typography>
          <Box role="group" aria-labelledby="rotation-months" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(4, minmax(0, 1fr))', sm: 'repeat(6, minmax(0, 1fr))' }, gap: 0.75 }}>
            {MONTHS.map((name, i) => {
              const on = months.includes(i + 1)
              return (
                <Chip
                  key={name}
                  label={name}
                  clickable
                  color={on ? 'primary' : 'default'}
                  variant={on ? 'filled' : 'outlined'}
                  onClick={() => toggle(i + 1)}
                  aria-pressed={on}
                  component="button"
                  type="button"
                  sx={{ width: '100%' }}
                />
              )
            })}
          </Box>
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <TextField select label="Week" slotProps={nativeSelect} value={week} onChange={(e) => setWeek(Number(e.target.value))}>
            <option value={0}>Any time</option>
            {[1, 2, 3, 4, 5].map((w) => (
              <option key={w} value={w}>
                {NTH[w]}
              </option>
            ))}
          </TextField>
        </Grid>
        {week > 0 && (
          <Grid size={{ xs: 6, sm: 4 }}>
            <TextField select label="Day" slotProps={nativeSelect} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </TextField>
          </Grid>
        )}
      </Grid>
      <Muted>
        {who === SOMEONE_ELSE ? 'Reminds the whole bishopric' : 'Reminds whoever has the turn'}
        {week > 0 ? ' on that day.' : ' on the 1st of each month it’s due.'}
      </Muted>
      <FormButtons busy={busy} canSave={canSave} onCancel={onCancel} onDelete={onDelete} saveLabel={rotation ? 'Save' : 'Add rotation'} />
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

/** The calling list's organizations, which fill in who meets with a newly approved name. */
const AREAS = ORGANIZATIONS.filter((o) => o !== 'Other')
const OTHER_AREA = ''

function AddAssignment({ bishopric, taken, busy, onAdd }: { bishopric: Profile[]; taken: Tables<'stewardships'>[]; busy: boolean; onAdd: (userId: string, area: string) => Promise<boolean> }) {
  const [userId, setUserId] = useState(bishopric[0]?.id ?? '')
  const [choice, setChoice] = useState(AREAS[0])
  const [typed, setTyped] = useState('')
  const area = choice === OTHER_AREA ? typed.trim() : choice
  const already = taken.some((t) => t.user_id === userId && t.area.toLowerCase() === area.toLowerCase())
  const sharedWith = taken.find((t) => t.user_id !== userId && t.area.toLowerCase() === area.toLowerCase() && AREAS.includes(t.area))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (userId && area && !already && (await onAdd(userId, area))) setTyped('')
  }
  if (!bishopric.length) return null
  return (
    <Box component="form" onSubmit={submit} aria-label="Add an assignment" sx={{ mt: 2 }}>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField select label="Who" slotProps={nativeSelect} value={userId} onChange={(e) => setUserId(e.target.value)}>
            {bishopric.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: choice === OTHER_AREA ? 4 : 5 }}>
          <TextField select label="Area" slotProps={nativeSelect} value={choice} onChange={(e) => setChoice(e.target.value)}>
            {AREAS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            <option value={OTHER_AREA}>Something else…</option>
          </TextField>
        </Grid>
        {choice === OTHER_AREA && (
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField label="Other area" placeholder="Young Single Adults" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: choice === OTHER_AREA ? 12 : 3 }}>
          <Button type="submit" variant="contained" fullWidth disabled={busy || !area || already} sx={{ height: '100%', minHeight: 40 }}>
            Add
          </Button>
        </Grid>
      </Grid>
      <Box sx={{ mt: 1 }}>
        <Muted>
          {sharedWith
            ? `${bishopric.find((p) => p.id === sharedWith.user_id)?.display_name ?? 'Someone'} also covers ${area}, so Meets with won't fill in for its callings.`
            : 'Areas from the calling list fill in who meets with a newly approved name. Other areas are for reference.'}
        </Muted>
      </Box>
    </Box>
  )
}

// ---------------------------------------------------------------------------

type Editing = { kind: 'event' | 'rotation'; id: string | 'new' } | null

/** The standing schedule (the "Bishopric Schedule" tab): regular meetings, rotations and assignments. */
export function ScheduleEditor({ data, canEdit, actions, busy }: Props) {
  const [editing, setEditing] = useState<Editing>(null)
  const close = () => setEditing(null)
  const after = (ok: boolean) => ok && close()
  const is = (kind: 'event' | 'rotation', id: string) => editing?.kind === kind && editing.id === id
  const addButton = (kind: 'event' | 'rotation', label: string) =>
    canEdit && !editing ? (
      <Button size="small" startIcon={<AddIcon />} onClick={() => setEditing({ kind, id: 'new' })} aria-label={label}>
        Add
      </Button>
    ) : undefined

  const people = new Map<string, Tables<'stewardships'>[]>()
  for (const p of data.bishopric) people.set(p.id, [])
  for (const s of data.stewardships) people.set(s.user_id, [...(people.get(s.user_id) ?? []), s])

  return (
    <>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Standing schedule
      </Typography>
      {canEdit && (
        <Box sx={{ mb: 2 }}>
          <Muted>Changes show on Home, the agendas and the day-ahead reminders.</Muted>
        </Box>
      )}

      <SectionCard title="Regular meetings" action={addButton('event', 'Add a meeting')}>
        {is('event', 'new') && (
          <>
            <EventForm busy={busy} onCancel={close} onSave={(e) => void actions.saveEvent(e).then(after)} />
            <Divider sx={{ my: 1 }} />
          </>
        )}
        {data.events.map((e) =>
          is('event', e.id) ? (
            <EventForm
              key={e.id}
              event={e}
              busy={busy}
              onCancel={close}
              onSave={(d) => void actions.saveEvent(d, e.id).then(after)}
              onDelete={() => void actions.deleteEvent(e.id).then(after)}
            />
          ) : (
            <Row key={e.id} primary={e.title} secondary={eventWhen(e)} editLabel={`Edit ${e.title}`} onEdit={canEdit && !editing ? () => setEditing({ kind: 'event', id: e.id }) : undefined} />
          ),
        )}
        {!data.events.length && <Muted>No regular meetings yet.</Muted>}
      </SectionCard>

      <SectionCard title="Rotations" action={addButton('rotation', 'Add a rotation')}>
        {is('rotation', 'new') && (
          <>
            <RotationForm bishopric={data.bishopric} busy={busy} onCancel={close} onSave={(r) => void actions.saveRotation(r).then(after)} />
            <Divider sx={{ my: 1 }} />
          </>
        )}
        {data.rotations.map((r) => {
          const who = rotationWho(r, data.profiles)
          return is('rotation', r.id) ? (
            <RotationForm
              key={r.id}
              rotation={r}
              bishopric={data.bishopric}
              busy={busy}
              onCancel={close}
              onSave={(d) => void actions.saveRotation(d, r.id).then(after)}
              onDelete={() => void actions.deleteRotation(r.id).then(after)}
            />
          ) : (
            <Row
              key={r.id}
              primary={who ? `${r.title} — ${who}` : r.title}
              secondary={[rotationDayLabel(r), monthsLabel(r.months)].filter(Boolean).join(' · ')}
              editLabel={`Edit ${r.title}${who ? ` (${who})` : ''}`}
              onEdit={canEdit && !editing ? () => setEditing({ kind: 'rotation', id: r.id }) : undefined}
            />
          )
        })}
        {!data.rotations.length && <Muted>No rotations yet.</Muted>}
      </SectionCard>

      <SectionCard title="Bishopric assignments">
        <Grid container spacing={2}>
          {[...people.entries()]
            .filter(([, areas]) => areas.length || canEdit)
            .map(([id, areas]) => (
              <Grid key={id} size={{ xs: 12, sm: 4 }}>
                <Typography variant="h3" sx={{ mb: 1 }}>
                  {data.profiles.find((p) => p.id === id)?.display_name}
                </Typography>
                <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                  {areas.map((a) => (
                    <Chip key={a.id} size="small" label={a.area} onDelete={canEdit ? () => void actions.deleteStewardship(a.id) : undefined} slotProps={{ root: { 'aria-label': a.area } }} />
                  ))}
                  {!areas.length && <Muted>None yet</Muted>}
                </Stack>
              </Grid>
            ))}
        </Grid>
        {!data.stewardships.length && !canEdit && <Muted>No assignments yet.</Muted>}
        {canEdit && <AddAssignment bishopric={data.bishopric} taken={data.stewardships} busy={busy} onAdd={actions.addStewardship} />}
      </SectionCard>
    </>
  )
}
