import CheckIcon from '@mui/icons-material/Check'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { timeLabel, WEEKDAYS } from '../lib/availability'
import { longDate, weekday, type IsoDate } from '../lib/dates'
import { meetingReminded, meetingWhen, type AgendaAssignments, type MeetingReminder, type RemindedEvent } from '../lib/followUp'
import { ASSIGNMENT_LABELS, assignmentLines, audienceFor, meetingSubject, missingAssignments, NOT_ASSIGNED, usesVariable, type MeetingAssignments, type MessageTemplate } from '../lib/messages'
import type { Appointment } from '../lib/queries'
import { bookedRange, slotLabel, wardParts } from '../lib/slots'
import { Muted, SectionCard } from './Layout'
import { MessagePanel } from './Messages'

export type RemindersActions = {
  /** Records the reminder for an appointment, or with `false` takes it back. */
  remind: (id: string, sent: boolean) => void
  remindMeeting: (eventId: string, sent: boolean) => void
}

export type RemindersProps = {
  date: IsoDate
  /** Booked appointments on `date` for the leaders this secretary schedules for. */
  appointments: Appointment[]
  /** Standing meetings on `date` this secretary reminds people about. */
  meetings: RemindedEvent[]
  sent: MeetingReminder[]
  /** That day's agendas, for who has the prayers and the spiritual thought. */
  agendas: AgendaAssignments[]
  /** The meetings with agendas, to link to the one to fill in. */
  agendaTemplates: { id: string; slug: string; name: string }[]
  templates: MessageTemplate[]
  leaderName: (id: string | null) => string
  myName: string
  timeZone: string
  actions: RemindersActions
  busy: boolean
}

const dayLabel = (date: IsoDate) => `${WEEKDAYS[weekday(date)]}, ${longDate(date)}`

function Sent({ label, onUndo, busy }: { label: string; onUndo: () => void; busy: boolean }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
      <CheckIcon fontSize="small" color="success" />
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Button size="small" disabled={busy} onClick={onUndo}>
        Undo
      </Button>
    </Stack>
  )
}

/** One reminder: what it's for, whether it's sent, and the message to send, open to begin with when it's the first one left. */
function ReminderRow({ title, detail, done, startOpen, onUndo, onDoneAnotherWay, busy, children }: {
  title: string
  detail: string
  done: boolean
  startOpen: boolean
  onUndo: () => void
  onDoneAnotherWay: () => void
  busy: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(startOpen)
  return (
    <Box component="article" aria-label={title}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
          <Muted>{detail}</Muted>
        </Box>
        {done ? (
          <Sent label="Reminder sent" onUndo={onUndo} busy={busy} />
        ) : (
          <Button size="small" variant={open ? 'text' : 'outlined'} onClick={() => setOpen(!open)}>
            {open ? 'Hide' : 'Write reminder'}
          </Button>
        )}
      </Stack>
      {open && (
        <>
          {children}
          {!done && (
            <Button size="small" sx={{ mt: 1 }} disabled={busy} onClick={onDoneAnotherWay}>
              Already reminded another way
            </Button>
          )}
        </>
      )}
    </Box>
  )
}

/**
 * The reminders to send for a day: each booked appointment's person (or their parent), and the
 * standing meetings this secretary reminds people about. Each opens a message from a template,
 * ready to copy, text or email; sending marks it done.
 */
const ASSIGNMENT_VARIABLES = ['assignments', 'opening_prayer', 'spiritual_thought', 'closing_prayer']

/** Who has what on the meeting's agenda that day, with a way to fill in what's missing. */
function MeetingAssignmentsLine({ assignments, link }: { assignments: MeetingAssignments; link?: string }) {
  return (
    <Box sx={{ mt: 0.5 }}>
      {ASSIGNMENT_LABELS.map(({ key, label }) => (
        <Typography key={key} variant="body2" color={assignments[key]?.trim() ? 'text.primary' : 'text.secondary'}>
          {label}: {assignments[key]?.trim() || NOT_ASSIGNED}
        </Typography>
      ))}
      {link && (
        <Button size="small" component={Link} to={link} sx={{ p: 0, minWidth: 0 }}>
          {assignmentLines(assignments) ? 'Change on the agenda' : 'Fill in on the agenda'}
        </Button>
      )}
    </Box>
  )
}

export function Reminders({ date, appointments, meetings, sent, agendas, agendaTemplates, templates, leaderName, myName, timeZone, actions, busy }: RemindersProps) {
  const firstOpen = [...meetings.filter((m) => !meetingReminded(m.id, date, sent)).map((m) => m.id), ...appointments.filter((a) => !a.reminded_at).map((a) => a.id)][0]
  return (
    <>
      {meetings.length > 0 && (
        <SectionCard title="Meetings">
          <Stack divider={<Divider flexItem />} spacing={1.5}>
            {meetings.map((m) => {
              const when = meetingWhen(date, m.start_time)
              const agendaTemplate = agendaTemplates.find((t) => t.id === m.agenda_template_id)
              const agenda = agendas.find((a) => a.template_id === m.agenda_template_id)
              const assignments: MeetingAssignments = { openingPrayer: agenda?.opening_prayer, spiritualThought: agenda?.spiritual_thought, closingPrayer: agenda?.closing_prayer }
              const warn = (body: string) => {
                if (!agendaTemplate) return ASSIGNMENT_VARIABLES.some((v) => usesVariable(body, v)) ? "This meeting isn't linked to an agenda, so who has the prayers can't be filled in. Pick its agenda in Settings › Standing schedule." : null
                const missing = missingAssignments(body, assignments)
                return missing.length ? `No one is down for ${missing.join(', ').toLowerCase()} on the agenda yet.` : null
              }
              return (
                <ReminderRow
                  key={m.id}
                  title={m.title}
                  detail={m.start_time ? `${timeLabel(m.start_time)} · everyone who attends` : 'Everyone who attends'}
                  done={meetingReminded(m.id, date, sent)}
                  startOpen={m.id === firstOpen}
                  onUndo={() => actions.remindMeeting(m.id, false)}
                  onDoneAnotherWay={() => actions.remindMeeting(m.id, true)}
                  busy={busy}
                >
                  {agendaTemplate && <MeetingAssignmentsLine assignments={assignments} link={`/agenda/${agendaTemplate.slug}/${date}`} />}
                  <MessagePanel
                    kind="meeting"
                    audience="member"
                    templates={templates}
                    subject={meetingSubject(m.title)}
                    values={{ name: '', leader: '', minutes: 0, myName, meeting: m.title, when, assignments }}
                    onSent={() => actions.remindMeeting(m.id, true)}
                    warn={warn}
                  />
                </ReminderRow>
              )
            })}
          </Stack>
        </SectionCard>
      )}
      <SectionCard title="Appointments">
        {appointments.length ? (
          <Stack divider={<Divider flexItem />} spacing={1.5}>
            {appointments.map((a) => {
              const leader = leaderName(a.interviewer_id)
              return (
                <ReminderRow
                  key={a.id}
                  title={a.person_name ?? 'Unnamed'}
                  detail={`${bookedRange(a.scheduled_at!, a.duration_minutes, timeZone)} with ${leader}${a.is_youth ? ' · text a parent' : ''}`}
                  done={!!a.reminded_at}
                  startOpen={a.id === firstOpen}
                  onUndo={() => actions.remind(a.id, false)}
                  onDoneAnotherWay={() => actions.remind(a.id, true)}
                  busy={busy}
                >
                  <MessagePanel
                    key={`${a.is_youth}|${a.parent_name}`}
                    kind="reminder"
                    audience={audienceFor(a)}
                    templates={templates}
                    values={{ name: a.person_name ?? '', leader, minutes: a.duration_minutes, myName, time: slotLabel(wardParts(a.scheduled_at!, timeZone)), parentName: a.parent_name }}
                    onSent={() => actions.remind(a.id, true)}
                  />
                </ReminderRow>
              )
            })}
          </Stack>
        ) : (
          <Muted>No appointments booked for {dayLabel(date)}.</Muted>
        )}
      </SectionCard>
    </>
  )
}

/** On the secretary's Home: what's left to remind for tomorrow, with a way in. Nothing when there's nothing on. */
export function RemindersSummary({ date, appointments, meetings, sent }: Pick<RemindersProps, 'date' | 'appointments' | 'meetings' | 'sent'>) {
  if (!appointments.length && !meetings.length) return null
  const appointmentsLeft = appointments.filter((a) => !a.reminded_at).length
  const meetingsLeft = meetings.filter((m) => !meetingReminded(m.id, date, sent))
  const left = appointmentsLeft + meetingsLeft.length
  return (
    <SectionCard
      title={`Reminders for ${WEEKDAYS[weekday(date)]}`}
      action={
        <Button size="small" variant={left ? 'contained' : 'text'} component={Link} to={`/reminders?date=${date}`}>
          {left ? 'Send reminders' : 'See them'}
        </Button>
      }
    >
      {!left ? (
        <Muted>All sent. Nice work.</Muted>
      ) : (
        <>
          {meetingsLeft.map((m) => (
            <Typography key={m.id}>{m.title}</Typography>
          ))}
          {appointments.length > 0 && (
            <Typography>
              {appointmentsLeft
                ? `${appointmentsLeft} of ${appointments.length} appointment${appointments.length === 1 ? '' : 's'} to remind`
                : appointments.length === 1 ? 'Appointment reminded' : `All ${appointments.length} appointments reminded`}
            </Typography>
          )}
        </>
      )}
    </SectionCard>
  )
}
