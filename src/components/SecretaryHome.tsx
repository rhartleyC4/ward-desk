import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import RemoveIcon from '@mui/icons-material/Remove'
import Alert from '@mui/material/Alert'
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
import type { Appointment, AppointmentsData } from '../lib/queries'
import { adjustMinutes, bookedRange, minutesLabel, openSlots, overlapping, slotLabel, slotsByDay, wardParts, type Slot } from '../lib/slots'
import type { HoursData } from './HoursView'
import { Muted, SectionCard } from './Layout'

export type SecretaryHomeData = AppointmentsData & HoursData

export type SecretaryHomeActions = {
  book: (id: string, at: string, minutes: number) => Promise<boolean>
  setLength: (id: string, minutes: number) => void
  complete: (id: string) => void
}

/** How far ahead open times are offered. */
export const DAYS_AHEAD = 14
/** Days with open times shown before "More days". */
const FIRST_DAYS = 3

type Ctx = { data: SecretaryHomeData; today: IsoDate; now: Date; timeZone: string; actions: SecretaryHomeActions; busy: boolean }

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

/** Open times for one appointment, by day, at the length chosen. Picking one and booking it saves both. */
function TimePicker({ appointment: a, ctx }: { appointment: Appointment; ctx: Ctx }) {
  const { data, today, now, timeZone, actions, busy } = ctx
  const [minutes, setMinutes] = useState(a.duration_minutes)
  const [picked, setPicked] = useState<Slot | null>(null)
  const [allDays, setAllDays] = useState(false)
  const leaderId = a.interviewer_id!
  const leader = leaderName(leaderId, data)

  const slots = openSlots({ leaderId, from: today, days: DAYS_AHEAD, hours: data.hours, changes: data.changes, absences: data.absences, booked: data.appointments, now, timeZone, minutes, ignoreId: a.id })
  const days = slotsByDay(slots)
  const shown = allDays ? days : days.slice(0, FIRST_DAYS)
  const hasHours = data.hours.some((h) => h.user_id === leaderId)
  // A picked time that no longer fits (the length grew into the next booking) is dropped.
  const stillOpen = picked && slots.some((s) => s.at === picked.at)

  const changeLength = (m: number) => {
    setMinutes(m)
    setPicked(null)
  }

  return (
    <Box sx={{ mt: 1, pl: { sm: 1 } }}>
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
          {shown.map((day) => (
            <Box key={day.date} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {shortDay(day.date)}
              </Typography>
              <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
                {day.slots.map((s) => {
                  const on = picked?.at === s.at
                  return (
                    <Chip
                      key={s.at}
                      label={slotLabel(s).split(' at ')[1]}
                      clickable
                      color={on ? 'primary' : 'default'}
                      variant={on ? 'filled' : 'outlined'}
                      aria-pressed={on}
                      aria-label={slotLabel(s)}
                      onClick={() => setPicked(on ? null : s)}
                    />
                  )
                })}
              </Stack>
              {/* Right under the day picked, so it's in reach on a phone. */}
              {stillOpen && picked.date === day.date && (
                <Button variant="contained" sx={{ mt: 1 }} disabled={busy} onClick={() => actions.book(a.id, picked.at, minutes)}>
                  Book {slotLabel(picked)}
                </Button>
              )}
            </Box>
          ))}
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
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {appointmentPurpose(a, ctx.data.needs, ctx.data.candidates)} · {waiting < 1 ? 'added today' : `waiting ${waiting} day${waiting === 1 ? '' : 's'}`}
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
  const name = a.person_name ?? 'Unnamed'
  const past = new Date(a.scheduled_at!) < ctx.now
  return (
    <Box component="article" aria-label={name}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography>
            <strong>{shortDay(wardParts(a.scheduled_at!, ctx.timeZone).date)}</strong> {bookedRange(a.scheduled_at!, a.duration_minutes, ctx.timeZone)} · {name}
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
          <Button size="small" startIcon={<CheckIcon />} disabled={ctx.busy} onClick={() => ctx.actions.complete(a.id)}>
            Done
          </Button>
        </Stack>
      </Stack>
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
export function SecretaryHome({ data, userId, today, now, timeZone, actions, busy }: { data: SecretaryHomeData; userId: string; today: IsoDate; now: Date; timeZone: string; actions: SecretaryHomeActions; busy: boolean }) {
  const assigned = leadersScheduledBy(userId, data.assignments)
  const leaderIds = assigned.length ? data.bishopric.filter((l) => assigned.includes(l.id)).map((l) => l.id) : data.bishopric.map((l) => l.id)
  const { toSchedule, scheduled } = splitAppointments(data.appointments, leaderIds)
  const clashes = overlapping(data.appointments)
  const ctx: Ctx = { data, today, now, timeZone, actions, busy }

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
    </>
  )
}
