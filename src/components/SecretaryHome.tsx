import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import RemoveIcon from '@mui/icons-material/Remove'
import Alert from '@mui/material/Alert'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { NavLink } from 'react-router'
import { appointmentPurpose, leadersScheduledBy, splitAppointments } from '../lib/appointments'
import { dayLabel, daysFor, WEEKDAYS } from '../lib/availability'
import { daysBetween, longDate, todayIso, weekday, type IsoDate } from '../lib/dates'
import { audienceFor, type MessageTemplate } from '../lib/messages'
import type { Appointment, AppointmentsData } from '../lib/queries'
import { adjustMinutes, bookedRange, minutesLabel, openSlots, overlapping, slotLabel, slotsByDay, wardParts, type Slot } from '../lib/slots'
import type { HoursData } from './HoursView'
import { Muted, SectionCard } from './Layout'
import { MessagePanel, TemplatesEditor } from './Messages'

export type SecretaryHomeData = AppointmentsData & HoursData & { templates: MessageTemplate[] }

export type SecretaryHomeActions = {
  book: (id: string, at: string, minutes: number) => Promise<boolean>
  setLength: (id: string, minutes: number) => void
  complete: (id: string) => void
  /** Records the times sent in a message. */
  offer: (id: string, times: string[]) => void
  /** Marks an appointment as a youth's, so messages go to a parent. */
  setYouth: (id: string, isYouth: boolean, parentName: string | null) => void
  saveTemplate: (t: Omit<MessageTemplate, 'id'> & { id?: string }) => Promise<boolean>
  deleteTemplate: (id: string) => void
}

/** How far ahead open times are offered. */
export const DAYS_AHEAD = 14
/** Days with open times shown before "More days". */
const FIRST_DAYS = 3

type Ctx = { data: SecretaryHomeData; today: IsoDate; now: Date; timeZone: string; myName: string; actions: SecretaryHomeActions; busy: boolean }

const leaderName = (id: string | null, data: SecretaryHomeData) => data.bishopric.find((l) => l.id === id)?.display_name ?? 'Unassigned'
const shortDay = (date: IsoDate) => `${WEEKDAYS[weekday(date)].slice(0, 3)}, ${longDate(date)}`

function LengthControl({ minutes, onChange, appointment, busy }: { minutes: number; onChange: (m: number) => void; appointment: Appointment; busy: boolean }) {
  const name = appointment.person_name ?? 'this appointment'
  const shorter = adjustMinutes(minutes, -1, appointment.purpose)
  const longer = adjustMinutes(minutes, 1, appointment.purpose)
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

const YouthTag = () => <Chip size="small" color="warning" variant="outlined" label="youth · text parent" sx={{ ml: 1, verticalAlign: 'middle' }} />

/**
 * Whether this is a youth (under 18), whose parent gets the message, and the parent's name for
 * the greeting. Saved as soon as it changes, so the next message uses it.
 */
function YouthFields({ appointment: a, ctx }: { appointment: Appointment; ctx: Ctx }) {
  const [parent, setParent] = useState(a.parent_name ?? '')
  const name = a.person_name ?? 'this person'
  const saveParent = () => {
    const next = parent.trim() || null
    if (next !== a.parent_name) ctx.actions.setYouth(a.id, true, next)
  }
  return (
    <Stack direction="row" useFlexGap sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
      <FormControlLabel
        label="Youth under 18: message a parent"
        control={<Checkbox checked={a.is_youth} disabled={ctx.busy} onChange={(e) => ctx.actions.setYouth(a.id, e.target.checked, a.parent_name)} />}
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

/**
 * Open times for one appointment, by day, at the length chosen. Pick one to book it, or a few to
 * offer in a message. Times offered before are marked, so the reply is easy to find.
 */
function TimePicker({ appointment: a, ctx }: { appointment: Appointment; ctx: Ctx }) {
  const { data, today, now, timeZone, actions, busy } = ctx
  const [minutes, setMinutes] = useState(a.duration_minutes)
  const [picked, setPicked] = useState<Slot[]>([])
  const [writing, setWriting] = useState(false)
  const [allDays, setAllDays] = useState(false)
  const leaderId = a.interviewer_id!
  const leader = leaderName(leaderId, data)

  const slots = openSlots({ leaderId, from: today, days: DAYS_AHEAD, hours: data.hours, changes: data.changes, absences: data.absences, booked: data.appointments, now, timeZone, minutes, ignoreId: a.id })
  const days = slotsByDay(slots)
  const shown = allDays ? days : days.slice(0, FIRST_DAYS)
  const hasHours = data.hours.some((h) => h.user_id === leaderId)
  const offered = new Set(a.offered_times.map((t) => new Date(t).toISOString()))
  // Picked times that no longer fit (the length grew into the next booking) are dropped.
  const chosen = picked.filter((p) => slots.some((s) => s.at === p.at)).sort((x, y) => x.at.localeCompare(y.at))
  const last = picked.at(-1)

  const changeLength = (m: number) => {
    setMinutes(m)
    setPicked([])
    setWriting(false)
  }
  const toggle = (s: Slot) => setPicked((p) => (p.some((x) => x.at === s.at) ? p.filter((x) => x.at !== s.at) : [...p, s]))

  const actionsRow = chosen.length > 0 && (
    <Box sx={{ mt: 1 }}>
      <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap' }}>
        {chosen.length === 1 && (
          <Button variant="contained" disabled={busy} onClick={() => actions.book(a.id, chosen[0].at, minutes)}>
            Book {slotLabel(chosen[0])}
          </Button>
        )}
        <Button variant={chosen.length === 1 ? 'outlined' : 'contained'} onClick={() => setWriting(!writing)}>
          {writing ? 'Hide message' : `Message ${chosen.length === 1 ? 'this time' : `these ${chosen.length} times`}`}
        </Button>
      </Stack>
      {writing && (
        <MessagePanel
          key={`${chosen.map((c) => c.at).join()}|${a.is_youth}|${a.parent_name}`}
          kind="offer"
          audience={audienceFor(a)}
          templates={data.templates}
          values={{ name: a.person_name ?? '', leader, minutes, myName: ctx.myName, times: chosen.map(slotLabel), parentName: a.parent_name }}
          onSent={() => actions.offer(a.id, chosen.map((c) => c.at))}
        />
      )}
    </Box>
  )

  return (
    <Box sx={{ mt: 1, pl: { sm: 1 } }}>
      <YouthFields appointment={a} ctx={ctx} />
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Muted>Length</Muted>
        <LengthControl minutes={minutes} onChange={changeLength} appointment={a} busy={busy} />
      </Stack>
      {!hasHours ? (
        <Muted>{leader} hasn't set appointment hours yet. Add them on the Hours page, or book a time on the Appointments page.</Muted>
      ) : !days.length ? (
        <Muted>No open {minutesLabel(minutes)} times with {leader} in the next two weeks.</Muted>
      ) : (
        <>
          <Muted>Pick one time to book it, or a few to offer.{offered.size > 0 && ' Times already offered are marked with a dot.'}</Muted>
          {shown.map((day) => (
            <Box key={day.date} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {shortDay(day.date)}
              </Typography>
              <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
                {day.slots.map((s) => {
                  const on = picked.some((p) => p.at === s.at)
                  const wasOffered = offered.has(s.at)
                  return (
                    <Chip
                      key={s.at}
                      label={`${wasOffered ? '• ' : ''}${slotLabel(s).split(' at ')[1]}`}
                      clickable
                      color={on ? 'primary' : wasOffered ? 'info' : 'default'}
                      variant={on ? 'filled' : 'outlined'}
                      aria-pressed={on}
                      aria-label={`${slotLabel(s)}${wasOffered ? ', offered' : ''}`}
                      onClick={() => toggle(s)}
                    />
                  )
                })}
              </Stack>
              {/* Right under the day last picked, so it's in reach on a phone. */}
              {last?.date === day.date && actionsRow}
            </Box>
          ))}
          {last && !shown.some((d) => d.date === last.date) && actionsRow}
          {days.length > FIRST_DAYS && (
            <Button size="small" sx={{ mt: 1 }} onClick={() => setAllDays(!allDays)}>
              {allDays ? 'Fewer days' : `More days (${days.length - FIRST_DAYS})`}
            </Button>
          )}
        </>
      )}
    </Box>
  )
}

function NeedsRow({ appointment: a, ctx }: { appointment: Appointment; ctx: Ctx }) {
  const [open, setOpen] = useState(false)
  const name = a.person_name ?? 'Unnamed'
  const waiting = daysBetween(todayIso(new Date(a.created_at)), ctx.today)

  return (
    <Box component="article" aria-label={name}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography>
            {name} <Typography component="span" variant="body2" color="text.secondary">· {leaderName(a.interviewer_id, ctx.data)}</Typography>
            {a.is_youth && <YouthTag />}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {appointmentPurpose(a, ctx.data.needs, ctx.data.candidates)} · {waiting < 1 ? 'added today' : `waiting ${waiting} day${waiting === 1 ? '' : 's'}`}
            {a.offered_at && ` · offered ${shortDay(todayIso(new Date(a.offered_at)))}`}
          </Typography>
        </Box>
        <Button size="small" variant={open ? 'text' : 'outlined'} onClick={() => setOpen(!open)}>
          {open ? 'Close' : 'Find a time'}
        </Button>
      </Stack>
      {open && <TimePicker appointment={a} ctx={ctx} />}
    </Box>
  )
}

function BookedRow({ appointment: a, ctx, clash }: { appointment: Appointment; ctx: Ctx; clash: boolean }) {
  const [writing, setWriting] = useState(false)
  const name = a.person_name ?? 'Unnamed'
  const past = new Date(a.scheduled_at!) < ctx.now
  const when = wardParts(a.scheduled_at!, ctx.timeZone)
  return (
    <Box component="article" aria-label={name}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography>
            <strong>{shortDay(when.date)}</strong> {bookedRange(a.scheduled_at!, a.duration_minutes, ctx.timeZone)} · {name}
            {a.is_youth && <YouthTag />}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {leaderName(a.interviewer_id, ctx.data)} · {appointmentPurpose(a, ctx.data.needs, ctx.data.candidates)}
          </Typography>
          {past && (
            <Typography variant="body2" color="text.secondary">
              Already past. Mark it done, or move it on the Appointments page.
            </Typography>
          )}
          {clash && !past && (
            <Typography variant="body2" color="warning.main">
              Runs into another appointment with {leaderName(a.interviewer_id, ctx.data)}.
            </Typography>
          )}
        </Box>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
          <LengthControl minutes={a.duration_minutes} onChange={(m) => ctx.actions.setLength(a.id, m)} appointment={a} busy={ctx.busy} />
          {!past && (
            <Button size="small" onClick={() => setWriting(!writing)}>
              {writing ? 'Hide' : 'Message'}
            </Button>
          )}
          <Button size="small" startIcon={<CheckIcon />} disabled={ctx.busy} onClick={() => ctx.actions.complete(a.id)}>
            Done
          </Button>
        </Stack>
      </Stack>
      {writing && (
        <>
          <YouthFields appointment={a} ctx={ctx} />
          <MessagePanel
            key={`${a.is_youth}|${a.parent_name}`}
            kind="confirm"
            audience={audienceFor(a)}
            templates={ctx.data.templates}
            values={{ name: a.person_name ?? '', leader: leaderName(a.interviewer_id, ctx.data), minutes: a.duration_minutes, myName: ctx.myName, time: slotLabel(when), parentName: a.parent_name }}
          />
        </>
      )}
    </Box>
  )
}

function WeekGlance({ leaderIds, ctx }: { leaderIds: string[]; ctx: Ctx }) {
  const { data, today } = ctx
  return (
    <Stack divider={<Divider flexItem />} spacing={1}>
      {leaderIds.map((id) => {
        const days = daysFor(id, today, 7, data.hours, data.changes, data.absences).filter((d) => d.kind !== 'none')
        const hasHours = data.hours.some((h) => h.user_id === id)
        return (
          <Box key={id}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {leaderName(id, data)}
            </Typography>
            {!hasHours && !days.length ? (
              <Typography variant="body2" color="warning.main">
                Hours not set yet
              </Typography>
            ) : days.length ? (
              days.map((d) => (
                <Typography key={d.date} variant="body2" color={d.kind === 'away' || d.kind === 'off' ? 'text.secondary' : 'text.primary'}>
                  {shortDay(d.date)}: {dayLabel(d)}
                </Typography>
              ))
            ) : (
              <Muted>No hours in the next seven days.</Muted>
            )}
          </Box>
        )
      })}
    </Stack>
  )
}

/**
 * The executive secretary's home: who needs an appointment and the open times to book them, what's
 * booked, and when each leader is free this week. Shows the leaders this secretary schedules for,
 * or everyone if they haven't been assigned any.
 */
export function SecretaryHome({
  data,
  userId,
  myName,
  today,
  now,
  timeZone,
  actions,
  busy,
}: {
  data: SecretaryHomeData
  userId: string
  /** How messages are signed. */
  myName: string
  today: IsoDate
  now: Date
  timeZone: string
  actions: SecretaryHomeActions
  busy: boolean
}) {
  const assigned = leadersScheduledBy(userId, data.assignments)
  const leaderIds = assigned.length ? data.bishopric.filter((l) => assigned.includes(l.id)).map((l) => l.id) : data.bishopric.map((l) => l.id)
  const { toSchedule, scheduled } = splitAppointments(data.appointments, leaderIds)
  const clashes = overlapping(data.appointments)
  const ctx: Ctx = { data, today, now, timeZone, myName, actions, busy }

  return (
    <>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Your week
      </Typography>

      {!assigned.length && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          You aren't assigned to schedule for anyone yet, so this shows every leader. The bishopric sets who schedules for whom on the Appointments page.
        </Alert>
      )}

      <SectionCard title={`Needs an appointment (${toSchedule.length})`}>
        {toSchedule.length ? (
          <Stack divider={<Divider flexItem />} spacing={1.5}>
            {toSchedule.map((a) => (
              <NeedsRow key={a.id} appointment={a} ctx={ctx} />
            ))}
          </Stack>
        ) : (
          <Muted>No one is waiting. Names the bishopric assigns show up here.</Muted>
        )}
      </SectionCard>

      <SectionCard title={`Booked (${scheduled.length})`}>
        {scheduled.length ? (
          <Stack divider={<Divider flexItem />} spacing={1.5}>
            {scheduled.map((a) => (
              <BookedRow key={a.id} appointment={a} ctx={ctx} clash={clashes.has(a.id)} />
            ))}
          </Stack>
        ) : (
          <Muted>Nothing booked yet.</Muted>
        )}
      </SectionCard>

      <SectionCard
        title="Bishopric this week"
        action={
          <Button size="small" component={NavLink} to="/hours">
            Change hours
          </Button>
        }
      >
        <WeekGlance leaderIds={leaderIds} ctx={ctx} />
      </SectionCard>

      <SectionCard title="Message templates">
        <TemplatesEditor templates={data.templates} onSave={actions.saveTemplate} onDelete={actions.deleteTemplate} busy={busy} />
      </SectionCard>
    </>
  )
}
