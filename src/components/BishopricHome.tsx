import EventNoteIcon from '@mui/icons-material/EventNote'
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff'
import PersonAddIcon from '@mui/icons-material/PersonAddAlt1'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { AgendaItem } from '../lib/agenda'
import { WEEK_AHEAD, isEmptyDay, meetingChoices, planDays, schedulersFor, waitingForTime, writableSections, type DayPlan, type HomeSacrament } from '../lib/bishopricHome'
import { longDate, shortDate, weekday, type IsoDate } from '../lib/dates'
import type { Enums } from '../lib/database.types'
import { timeLabel, WEEKDAYS } from '../lib/availability'
import type { AgendaSection, AgendaTemplate, Appointment, AppointmentsData } from '../lib/queries'
import { bookedRange, minutesLabel, wardParts } from '../lib/slots'
import { Muted, SectionCard } from './Layout'
import { ThisMonth } from './ThisMonth'
import type { Rotation } from '../lib/schedule'

export type BishopricHomeData = Pick<AppointmentsData, 'appointments' | 'assignments' | 'secretaries' | 'bishopric'> & {
  /** The meetings this leader can open. */
  templates: AgendaTemplate[]
  agendaItems: AgendaItem[]
  sacrament: HomeSacrament[]
  rotations: Rotation[]
}

export type InterviewRequest = { person_name: string; purpose: Enums<'interview_purpose'>; interviewer_id: string; is_youth: boolean; parent_name: string | null }

export type BishopricHomeActions = {
  requestInterview: (request: InterviewRequest) => Promise<boolean>
  addItem: (section: Pick<AgendaSection, 'id' | 'kind'>, body: string, eventDate: IsoDate | null) => Promise<boolean>
}

type Props = { data: BishopricHomeData; userId: string; today: IsoDate; timeZone: string; actions: BishopricHomeActions; busy: boolean }

const PURPOSES: { value: Enums<'interview_purpose'>; label: string; hint?: string }[] = [
  { value: 'temple_recommend', label: 'Temple recommend' },
  { value: 'calling', label: 'Extending a calling' },
  { value: 'youth', label: 'Youth interview' },
  { value: 'ppi', label: 'PPI', hint: 'Personal priesthood interview' },
  { value: 'advancement', label: 'Advancement', hint: 'Priesthood ordination or a new class' },
  { value: 'tithing_declaration', label: 'Tithing declaration' },
  { value: 'other', label: 'Something else' },
]
const purposeLabel = (p: Enums<'interview_purpose'>) => PURPOSES.find((x) => x.value === p)?.label ?? ''

const dayName = (date: IsoDate) => WEEKDAYS[weekday(date)]
const fullDay = (date: IsoDate) => `${dayName(date)}, ${longDate(date)}`
const nameOf = (id: string, data: BishopricHomeData) => data.bishopric.find((p) => p.id === id)?.display_name ?? 'you'

// ---------------------------------------------------------------------------
// The day and the week
// ---------------------------------------------------------------------------

function AppointmentLine({ appointment: a, timeZone }: { appointment: Appointment & { time: string }; timeZone: string }) {
  const purpose = purposeLabel(a.purpose)
  return (
    <Box sx={{ display: 'flex', gap: 1.5, py: 0.75, alignItems: 'baseline' }}>
      <Typography sx={{ minWidth: 120, fontWeight: 600 }}>{bookedRange(a.scheduled_at!, a.duration_minutes, timeZone)}</Typography>
      <Box>
        <Typography component="span">{a.person_name ?? 'Someone'}</Typography>
        {purpose && a.purpose !== 'other' && <Muted>{purpose}</Muted>}
        {a.is_youth && <Chip size="small" variant="outlined" color="warning" label="youth" sx={{ ml: 1 }} />}
      </Box>
    </Box>
  )
}

function DayLines({ day, timeZone, openButtons }: { day: DayPlan<Appointment, AgendaTemplate>; timeZone: string; openButtons: boolean }) {
  return (
    <>
      {day.sacrament && (
        <Box sx={{ display: 'flex', gap: 1, py: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 600 }}>{day.sacrament.title || 'Sacrament meeting'}</Typography>
          {day.sacrament.conducting && <Chip size="small" color="primary" label="You're conducting" />}
          <Button component={Link} to="/sacrament" size="small">
            Program
          </Button>
        </Box>
      )}
      {day.rotations.map((r, i) => (
        <Box key={`r${i}`} sx={{ display: 'flex', gap: 1, py: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 600 }}>{r.title}</Typography>
          <Chip size="small" variant="outlined" color="secondary" label={r.assignee_id ? 'Your turn' : 'Rotation'} />
        </Box>
      ))}
      {day.meetings.map(({ template, openItems }) => (
        <Box key={template.id} sx={{ display: 'flex', gap: 1, py: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 600, flexBasis: { xs: '100%', sm: 'auto' } }}>
            {template.start_time && `${timeLabel(template.start_time)} `}
            {template.name}
          </Typography>
          <Muted>
            {openItems} open {openItems === 1 ? 'item' : 'items'}
          </Muted>
          <Button component={Link} to={`/agenda/${template.slug}/${day.date}`} size="small" variant={openButtons ? 'contained' : 'text'}>
            Open agenda
          </Button>
        </Box>
      ))}
      {day.appointments.map((a) => (
        <AppointmentLine key={a.id} appointment={a} timeZone={timeZone} />
      ))}
    </>
  )
}

function Today({ today, week, timeZone }: { today: DayPlan<Appointment, AgendaTemplate>; week: DayPlan<Appointment, AgendaTemplate>[]; timeZone: string }) {
  const next = week.find((d) => !isEmptyDay(d))
  const n = today.appointments.length
  return (
    <SectionCard title="Today">
      {isEmptyDay(today) ? (
        <>
          <Typography>Nothing on your calendar today.</Typography>
          {next && <Muted>Next: {dayName(next.date)}, {nextLabel(next, timeZone)}</Muted>}
        </>
      ) : (
        <>
          {n > 0 && (
            <Muted>
              {n} {n === 1 ? 'appointment' : 'appointments'}
              {' · '}
              {minutesLabel(today.appointments.reduce((sum, a) => sum + a.duration_minutes, 0))} in all
            </Muted>
          )}
          <DayLines day={today} timeZone={timeZone} openButtons />
        </>
      )}
    </SectionCard>
  )
}

/** "7:00 PM, temple recommend" for the first thing on a later day. */
function nextLabel(day: DayPlan<Appointment, AgendaTemplate>, timeZone: string): string {
  if (day.sacrament) return day.sacrament.conducting ? 'sacrament meeting (you are conducting)' : 'sacrament meeting'
  const meeting = day.meetings[0]
  if (!meeting && day.rotations[0]) return day.rotations[0].title
  if (meeting) return `${meeting.template.start_time ? `${timeLabel(meeting.template.start_time)} ` : ''}${meeting.template.name}`
  const a = day.appointments[0]
  return `${bookedRange(a.scheduled_at!, a.duration_minutes, timeZone)}, ${a.person_name ?? 'an appointment'}`
}

function ComingUp({ week, timeZone }: { week: DayPlan<Appointment, AgendaTemplate>[]; timeZone: string }) {
  const days = week.filter((d) => !isEmptyDay(d))
  return (
    <SectionCard title="Coming up">
      {!days.length ? (
        <Muted>Nothing else this week.</Muted>
      ) : (
        days.map((day) => (
          <Box key={day.date} sx={{ '& + &': { mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' } }}>
            <Typography variant="h3">{fullDay(day.date)}</Typography>
            <DayLines day={day} timeZone={timeZone} openButtons={false} />
          </Box>
        ))
      )}
    </SectionCard>
  )
}

function Waiting({ data, userId, timeZone }: { data: BishopricHomeData; userId: string; timeZone: string }) {
  const waiting = waitingForTime(userId, data.appointments)
  if (!waiting.length) return null
  const schedulers = schedulersFor(userId, data.assignments, data.secretaries)
  return (
    <SectionCard title="Waiting for a time">
      <Muted>{schedulers.length ? `${schedulers.map((s) => s.display_name).join(' or ')} will find a time for these.` : 'A secretary will find a time for these.'}</Muted>
      {waiting.map((a) => (
        <Box key={a.id} sx={{ py: 0.75 }}>
          <Typography component="span">{a.person_name ?? 'Someone'}</Typography>
          <Muted>
            {[a.purpose !== 'other' && purposeLabel(a.purpose), `asked ${shortDate(wardParts(a.created_at, timeZone).date)}`].filter(Boolean).join(' · ')}
          </Muted>
        </Box>
      ))}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Guided steps
// ---------------------------------------------------------------------------

/** One question per screen, with Back, Next and Cancel always in the same place. */
function StepFrame({ step, of, question, children, onBack, onCancel, nextLabel, canNext, busy, onNext }: {
  step: number
  of: number
  question: string
  children: ReactNode
  onBack: () => void
  onCancel: () => void
  nextLabel: string
  canNext: boolean
  busy: boolean
  onNext: () => void
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (canNext && !busy) onNext()
  }
  return (
    <Box component="form" onSubmit={submit} aria-label={question}>
      <Typography variant="body2" color="text.secondary">
        Step {step} of {of}
      </Typography>
      <Typography variant="h2" sx={{ mt: 0.5, mb: 1.5 }}>
        {question}
      </Typography>
      {children}
      <Stack direction="row" useFlexGap sx={{ mt: 2, gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button type="submit" variant="contained" size="large" disabled={!canNext || busy}>
          {nextLabel}
        </Button>
        {step > 1 && (
          <Button size="large" variant="outlined" onClick={onBack}>
            Back
          </Button>
        )}
        <Button size="large" onClick={onCancel}>
          Cancel
        </Button>
      </Stack>
    </Box>
  )
}

function Choices<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <RadioGroup aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <FormControlLabel
          key={o.value}
          value={o.value}
          control={<Radio />}
          label={
            <Box sx={{ py: 0.5 }}>
              <Typography>{o.label}</Typography>
              {o.hint && <Muted>{o.hint}</Muted>}
            </Box>
          }
        />
      ))}
    </RadioGroup>
  )
}

function Done({ message, again, onAgain, onClose }: { message: string; again: string; onAgain: () => void; onClose: () => void }) {
  return (
    <Box role="status">
      <Typography variant="h2" sx={{ mb: 1 }}>
        Done
      </Typography>
      <Typography>{message}</Typography>
      <Stack direction="row" useFlexGap sx={{ mt: 2, gap: 1, flexWrap: 'wrap' }}>
        <Button variant="contained" size="large" onClick={onClose}>
          Back to home
        </Button>
        <Button variant="outlined" size="large" onClick={onAgain}>
          {again}
        </Button>
      </Stack>
    </Box>
  )
}

function RequestInterview({ data, userId, actions, busy, onClose }: { data: BishopricHomeData; userId: string; actions: BishopricHomeActions; busy: boolean; onClose: () => void }) {
  const leaders = data.bishopric
  const blank = { person_name: '', is_youth: false, parent_name: '', purpose: 'temple_recommend' as Enums<'interview_purpose'>, interviewer_id: leaders.some((l) => l.id === userId) ? userId : (leaders[0]?.id ?? '') }
  const [form, setForm] = useState(blank)
  const [step, setStep] = useState(1)
  const [sent, setSent] = useState<string | null>(null)
  const name = form.person_name.trim()

  if (sent) return <Done message={sent} again="Ask for another" onAgain={() => (setForm(blank), setStep(1), setSent(null))} onClose={onClose} />

  const frame = { of: 3, step, busy, onBack: () => setStep(step - 1), onCancel: onClose }
  if (step === 1)
    return (
      <StepFrame {...frame} question="Who is the interview with?" nextLabel="Next" canNext={!!name} onNext={() => setStep(2)}>
        <TextField autoFocus label="Their name" placeholder="Sister Ames" value={form.person_name} onChange={(e) => setForm({ ...form, person_name: e.target.value })} />
        <FormControlLabel sx={{ mt: 1 }} label="They're under 18 (messages go to a parent)" control={<Checkbox checked={form.is_youth} onChange={(e) => setForm({ ...form, is_youth: e.target.checked })} />} />
        {form.is_youth && <TextField label="Parent's name" placeholder="Brother Ames" value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} sx={{ mt: 1 }} />}
      </StepFrame>
    )
  if (step === 2)
    return (
      <StepFrame {...frame} question={`What is it for?`} nextLabel="Next" canNext onNext={() => setStep(3)}>
        <Choices label="Kind of interview" value={form.purpose} options={PURPOSES} onChange={(purpose) => setForm({ ...form, purpose })} />
      </StepFrame>
    )

  const submit = async () => {
    const leader = form.interviewer_id
    const ok = await actions.requestInterview({ person_name: name, purpose: form.purpose, interviewer_id: leader, is_youth: form.is_youth, parent_name: form.is_youth ? form.parent_name.trim() || null : null })
    if (!ok) return
    const schedulers = schedulersFor(leader, data.assignments, data.secretaries).map((s) => s.display_name)
    const who = schedulers.length ? schedulers.join(' or ') : 'A secretary'
    const withWhom = leader === userId ? 'you' : nameOf(leader, data)
    setSent(`${who} will find a time for ${name} to meet with ${withWhom}.`)
  }
  return (
    <StepFrame {...frame} question={`Who will meet with ${name}?`} nextLabel="Ask for this interview" canNext={!!form.interviewer_id} onNext={submit}>
      <Choices label="Meets with" value={form.interviewer_id} options={leaders.map((l) => ({ value: l.id, label: l.id === userId ? `Me (${l.display_name ?? 'you'})` : (l.display_name ?? l.email) }))} onChange={(interviewer_id) => setForm({ ...form, interviewer_id })} />
    </StepFrame>
  )
}

function AddToMeeting({ data, today, actions, busy, onClose }: { data: BishopricHomeData; today: IsoDate; actions: BishopricHomeActions; busy: boolean; onClose: () => void }) {
  const choices = meetingChoices(data.templates, today)
  const [templateId, setTemplateId] = useState(choices[0]?.template.id ?? '')
  const choice = choices.find((c) => c.template.id === templateId) ?? choices[0]
  const sections = choice ? writableSections(choice.template) : []
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? '')
  const section = sections.find((s) => s.id === sectionId) ?? sections[0]
  const [text, setText] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [screen, setScreen] = useState<'meeting' | 'section' | 'text'>(choices.length > 1 ? 'meeting' : sections.length > 1 ? 'section' : 'text')
  const [sent, setSent] = useState<string | null>(null)

  if (!choice || !section) return null
  // The meeting and section questions are skipped when there's only one answer.
  const screens = [choices.length > 1 && 'meeting', sections.length > 1 && 'section', 'text'].filter(Boolean) as (typeof screen)[]
  const step = screens.indexOf(screen) + 1
  const frame = { of: screens.length, step, busy, onBack: () => setScreen(screens[step - 2]), onCancel: onClose }
  const next = () => setScreen(screens[step])

  if (sent)
    return (
      <Done
        message={sent}
        again="Add another"
        onAgain={() => {
          setText('')
          setEventDate('')
          setSent(null)
          setScreen(screens[0])
        }}
        onClose={onClose}
      />
    )

  if (screen === 'meeting')
    return (
      <StepFrame {...frame} question="Which meeting is it for?" nextLabel="Next" canNext onNext={next}>
        <Choices
          label="Meeting"
          value={choice.template.id}
          options={choices.map((c) => ({ value: c.template.id, label: c.template.name, hint: `Next: ${c.date === today ? 'today' : fullDay(c.date)}` }))}
          onChange={(id) => {
            setTemplateId(id)
            setSectionId(writableSections(choices.find((c) => c.template.id === id)!.template)[0]?.id ?? '')
          }}
        />
      </StepFrame>
    )
  if (screen === 'section')
    return (
      <StepFrame {...frame} question={`Which part of the ${choice.template.name} agenda?`} nextLabel="Next" canNext onNext={next}>
        <Choices label="Agenda section" value={section.id} options={sections.map((s) => ({ value: s.id, label: s.title, hint: s.kind === 'calendar' ? 'An event with a date' : undefined }))} onChange={setSectionId} />
      </StepFrame>
    )

  const dated = section.kind === 'calendar'
  const submit = async () => {
    const ok = await actions.addItem(section, text.trim(), dated && eventDate ? eventDate : null)
    if (ok) setSent(`Added to “${section.title}” for ${choice.template.name} ${choice.date === today ? 'today' : `on ${fullDay(choice.date)}`}.`)
  }
  return (
    <StepFrame {...frame} question={dated ? 'What is the event?' : 'What should be discussed?'} nextLabel="Add to the agenda" canNext={!!text.trim()} onNext={submit}>
      <TextField autoFocus multiline minRows={2} label={dated ? 'Event' : 'Item'} value={text} onChange={(e) => setText(e.target.value)} />
      {dated && <TextField type="date" label="Date of the event" value={eventDate} onChange={(e) => setEventDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ mt: 1.5, maxWidth: 220 }} />}
      <Muted>
        It will show on {choice.template.name}, {choice.date === today ? 'today' : fullDay(choice.date)}.
      </Muted>
    </StepFrame>
  )
}

function ActionButton({ icon, label, hint, onClick, to, disabled }: { icon: ReactNode; label: string; hint: string; onClick?: () => void; to?: string; disabled?: boolean }) {
  // Pages opened from here offer a way back to Home.
  const link = to ? { component: Link, to, state: { back: { to: '/home', label: 'Home' } } } : {}
  return (
    <Button
      {...link}
      onClick={onClick}
      disabled={disabled}
      variant="outlined"
      fullWidth
      startIcon={icon}
      sx={{ justifyContent: 'flex-start', textAlign: 'left', py: 1.5, px: 2, textTransform: 'none', '& .MuiButton-startIcon': { mr: 1.5 } }}
    >
      <Box>
        <Typography sx={{ fontWeight: 600, color: 'text.primary' }}>{label}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {hint}
        </Typography>
      </Box>
    </Button>
  )
}

function QuickActions(props: Props) {
  const [open, setOpen] = useState<'interview' | 'agenda' | null>(null)
  const close = () => setOpen(null)
  const canAdd = meetingChoices(props.data.templates, props.today).length > 0
  return (
    <SectionCard title={open ? undefined : 'What would you like to do?'}>
      {open === 'interview' ? (
        <RequestInterview {...props} onClose={close} />
      ) : open === 'agenda' ? (
        <AddToMeeting {...props} onClose={close} />
      ) : (
        <Stack sx={{ gap: 1 }}>
          <ActionButton icon={<PersonAddIcon />} label="Ask for an interview" hint="A secretary will find a time and send the message." onClick={() => setOpen('interview')} />
          <ActionButton
            icon={<EventNoteIcon />}
            label="Add something to a meeting"
            hint={canAdd ? 'Put an item on an upcoming agenda.' : 'There are no meetings set up yet.'}
            onClick={() => setOpen('agenda')}
            disabled={!canAdd}
          />
          <ActionButton icon={<FlightTakeoffIcon />} label="I'll be away" hint="Let the bishopric know the days you're gone." to="/away" />
        </Stack>
      )}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------

/** The bishop's and counselors' home: today, quick actions, the week ahead, and open requests. */
export function BishopricHome(props: Props) {
  const { data, userId, today, timeZone } = props
  const [todayPlan, ...week] = planDays({ userId, from: today, days: WEEK_AHEAD + 1, appointments: data.appointments, templates: data.templates, agendaItems: data.agendaItems, sacrament: data.sacrament, rotations: data.rotations, timeZone })
  return (
    <>
      <Typography variant="h1" sx={{ mb: 1.5 }}>
        {fullDay(today)}
      </Typography>
      <Today today={todayPlan} week={week} timeZone={timeZone} />
      <QuickActions {...props} />
      <ComingUp week={week} timeZone={timeZone} />
      <ThisMonth userId={userId} today={today} rotations={data.rotations} />
      <Waiting data={data} userId={userId} timeZone={timeZone} />
    </>
  )
}
