import CheckIcon from '@mui/icons-material/Check'
import PersonAddIcon from '@mui/icons-material/PersonAddAlt1'
import SendIcon from '@mui/icons-material/SendOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link } from 'react-router'
import type { MyAssignment } from '../lib/assignments'
import { ORGANIZATIONS, type ListedCalling } from '../lib/callings'
import { addDays, longDate, shortDate, type IsoDate } from '../lib/dates'
import type { Candidate, Profile } from '../lib/queries'
import {
  asStage,
  CALLING_REQUEST_KINDS,
  callingRequestSummary,
  dayOf,
  FORMER_MEMBER,
  isOpen,
  isOverlooked,
  needsRelease,
  requestStatusLine,
  sentBy,
  STAGE_HINTS,
  STAGE_LABELS,
  takesNames,
  UNSEEN_AFTER_DAYS,
  waitingOn,
  type CallingRequest,
  type CallingRequestKind,
  type CallingStage,
  type MyCallingRequest,
  type Recipient,
  type Request,
  type RequestStatus,
} from '../lib/requests'
import { nativeSelect } from '../theme'
import { CallingField } from './CallingField'
import { Muted, SectionCard, Side, Split } from './Layout'
import { MyAssignments, type AnswerAssignment } from './MeetingAssignments'
import { ActionButton, Choices, StepFrame } from './Steps'

const nameOf = (id: string | null, people: Pick<Profile, 'id' | 'display_name'>[]) =>
  id === null ? FORMER_MEMBER : (people.find((p) => p.id === id)?.display_name ?? 'Someone')
const dateLabel = { inputLabel: { shrink: true } } as const

// ---------------------------------------------------------------------------
// A request sent to you
// ---------------------------------------------------------------------------

export type AnswerRequest = (id: string, status: Exclude<RequestStatus, 'sent'>, reply?: string | null) => Promise<boolean>

/** One request for the person asked: what it is, and buttons to say they've seen it and when it's done. */
export function IncomingRequest({ request: r, people, today, onAnswer, busy }: { request: Request; people: Profile[]; today: IsoDate; onAnswer: AnswerRequest; busy: boolean }) {
  const [closing, setClosing] = useState<'done' | 'declined' | null>(null)
  const [note, setNote] = useState('')
  const open = isOpen(r)

  return (
    <Box component="article" aria-label={r.title} sx={{ py: 1 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontWeight: 600, flex: 1, ...(open ? {} : { textDecoration: 'line-through', color: 'text.secondary' }) }}>{r.title}</Typography>
        {r.status === 'sent' && <Chip size="small" color="warning" label="New" />}
      </Stack>
      <Muted>
        From {nameOf(r.from_id, people)} · {requestStatusLine(r, today)}
      </Muted>
      {r.details && <Typography sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>{r.details}</Typography>}
      {r.reply && !open && <Muted>Your note: {r.reply}</Muted>}

      {open && !closing && (
        <Stack direction="row" useFlexGap sx={{ mt: 1, gap: 1, flexWrap: 'wrap' }}>
          {r.status === 'sent' && (
            <Button variant="contained" startIcon={<CheckIcon />} disabled={busy} onClick={() => onAnswer(r.id, 'seen')}>
              Got it
            </Button>
          )}
          <Button variant={r.status === 'sent' ? 'outlined' : 'contained'} disabled={busy} onClick={() => setClosing('done')}>
            It's done
          </Button>
          <Button disabled={busy} onClick={() => setClosing('declined')}>
            I can't do this
          </Button>
        </Stack>
      )}
      {closing && (
        <Stack
          component="form"
          spacing={1}
          sx={{ mt: 1 }}
          onSubmit={(e) => {
            e.preventDefault()
            void onAnswer(r.id, closing, note).then((ok) => ok && setClosing(null))
          }}
        >
          <TextField
            label={closing === 'done' ? 'Anything to add? (optional)' : 'Let them know why (optional)'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={2}
            autoFocus
          />
          <Stack direction="row" spacing={1}>
            <Button type="submit" variant="contained" disabled={busy}>
              {closing === 'done' ? 'Mark done' : 'Send'}
            </Button>
            <Button onClick={() => setClosing(null)}>Cancel</Button>
          </Stack>
        </Stack>
      )}
      {!open && (
        <Button size="small" disabled={busy} onClick={() => onAnswer(r.id, 'seen', null)} sx={{ mt: 0.5 }}>
          Reopen
        </Button>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// A request you sent
// ---------------------------------------------------------------------------

export function SentRequest({ request: r, people, today, timeZone, onTakeBack, busy }: { request: Request; people: Profile[]; today: IsoDate; timeZone: string; onTakeBack: (id: string) => void; busy: boolean }) {
  const overlooked = isOverlooked(r, today, timeZone)
  return (
    <Box component="article" aria-label={r.title} sx={{ py: 1 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontWeight: 600, flex: 1, ...(isOpen(r) ? {} : { color: 'text.secondary' }) }}>{r.title}</Typography>
        <Chip size="small" label={r.status === 'sent' ? 'Not seen yet' : r.status === 'seen' ? 'Seen' : r.status === 'done' ? 'Done' : "Can't do it"} color={r.status === 'done' ? 'success' : r.status === 'declined' ? 'error' : r.status === 'seen' ? 'info' : 'default'} />
      </Stack>
      <Muted>
        To {nameOf(r.to_id, people)} · sent {shortDate(dayOf(r.created_at, timeZone))}
        {r.due_on && isOpen(r) ? ` · due ${longDate(r.due_on)}` : ''}
      </Muted>
      {overlooked && (
        <Typography variant="body2" color="warning.main">
          Not opened after {UNSEEN_AFTER_DAYS} days. You may want to mention it.
        </Typography>
      )}
      {r.reply && <Typography sx={{ mt: 0.5 }}>“{r.reply}”</Typography>}
      {isOpen(r) && (
        <Button
          size="small"
          disabled={busy}
          sx={{ mt: 0.5, color: 'text.secondary' }}
          onClick={() => window.confirm(`Take back “${r.title}”? ${nameOf(r.to_id, people)} won't see it anymore.`) && onTakeBack(r.id)}
        >
          Take back
        </Button>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Sending a request
// ---------------------------------------------------------------------------

export type NewRequestDraft = { to_id: string; title: string; details: string | null; due_on: IsoDate | null }

/** Lists the bishopric, then ward leaders. */
export function RecipientSelect({
  recipients,
  value,
  onChange,
  label = 'Who is it for?',
  noneLabel,
  helperText,
}: {
  recipients: Recipient[]
  value: string
  onChange: (id: string) => void
  label?: string
  /** Lets the choice be left empty, showing this. Otherwise someone must be chosen. */
  noneLabel?: string
  helperText?: string
}) {
  const bishopric = recipients.filter((r) => r.in_bishopric)
  const others = recipients.filter((r) => !r.in_bishopric)
  return (
    <TextField select label={label} required={!noneLabel} value={value} onChange={(e) => onChange(e.target.value)} helperText={helperText} slotProps={nativeSelect}>
      <option value="" disabled={!noneLabel}>
        {noneLabel ?? 'Choose someone'}
      </option>
      <optgroup label="Bishopric">
        {bishopric.map((p) => (
          <option key={p.id} value={p.id}>
            {p.display_name}
          </option>
        ))}
      </optgroup>
      {others.length > 0 && (
        <optgroup label="Ward leaders">
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </optgroup>
      )}
    </TextField>
  )
}

/** Two short steps: who, then what and by when. */
export function NewRequest({ recipients, onSend, onClose, busy }: { recipients: Recipient[]; onSend: (draft: NewRequestDraft) => Promise<boolean>; onClose: () => void; busy: boolean }) {
  const [step, setStep] = useState<1 | 2 | 'sent'>(1)
  const [form, setForm] = useState({ to_id: '', title: '', details: '', due_on: '' })
  const who = recipients.find((r) => r.id === form.to_id)?.display_name ?? ''

  if (step === 'sent') {
    return (
      <Box role="status">
        <Typography variant="h2" sx={{ mb: 1 }}>
          Sent
        </Typography>
        <Typography>{who} will see it on their Requests page. You'll see here when they've read it and when it's done.</Typography>
        <Stack direction="row" useFlexGap sx={{ mt: 2, gap: 1, flexWrap: 'wrap' }}>
          <Button variant="contained" size="large" onClick={onClose}>
            Done
          </Button>
          <Button
            variant="outlined"
            size="large"
            onClick={() => {
              setForm({ to_id: '', title: '', details: '', due_on: '' })
              setStep(1)
            }}
          >
            Send another
          </Button>
        </Stack>
      </Box>
    )
  }

  if (step === 1) {
    return (
      <StepFrame step={1} of={2} question="Who is it for?" onBack={() => setStep(1)} onCancel={onClose} nextLabel="Next" canNext={!!form.to_id} busy={busy} onNext={() => setStep(2)}>
        <RecipientSelect recipients={recipients} value={form.to_id} onChange={(to_id) => setForm({ ...form, to_id })} />
      </StepFrame>
    )
  }

  return (
    <StepFrame
      step={2}
      of={2}
      question={`What would you like ${who} to do?`}
      onBack={() => setStep(1)}
      onCancel={onClose}
      nextLabel="Send request"
      canNext={!!form.title.trim()}
      busy={busy}
      onNext={() =>
        void onSend({ to_id: form.to_id, title: form.title.trim(), details: form.details.trim() || null, due_on: form.due_on || null }).then((ok) => ok && setStep('sent'))
      }
    >
      <Stack spacing={1.5}>
        <TextField label="In a few words" required autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} helperText="Like “Set up chairs for the fireside”" />
        <TextField label="Details (optional)" multiline minRows={3} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
        <TextField type="date" label="By when (optional)" slotProps={dateLabel} value={form.due_on} onChange={(e) => setForm({ ...form, due_on: e.target.value })} sx={{ maxWidth: 220 }} />
      </Stack>
      <Muted>They'll get a notification that doesn't say what it's about. The details stay in the app.</Muted>
    </StepFrame>
  )
}

// ---------------------------------------------------------------------------
// Calling requests, for the bishopric
// ---------------------------------------------------------------------------

/** One leader's calling request, for the bishopric: who asked, what for, the names, and a Got it button. */
export function CallingRequestRow({
  request: r,
  people,
  timeZone,
  candidates,
  onReceive,
  busy,
  showAgendaLink = true,
}: {
  request: CallingRequest
  people: Profile[]
  timeZone: string
  candidates: Pick<Candidate, 'request_id' | 'person_name'>[]
  onReceive?: (id: string) => void
  busy: boolean
  showAgendaLink?: boolean
}) {
  const names = candidates.filter((c) => c.request_id === r.id).map((c) => c.person_name)
  const details = [
    `From ${nameOf(r.requested_by, people)}${r.organization ? ` (${r.organization})` : ''}`,
    `sent ${shortDate(dayOf(r.created_at, timeZone))}`,
    r.needed_by && `needed by ${longDate(r.needed_by)}`,
  ].filter(Boolean)
  return (
    <Box component="article" aria-label={callingRequestSummary(r)} sx={{ py: 1 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontWeight: 600, flex: 1 }}>{callingRequestSummary(r)}</Typography>
        {!r.received_at && <Chip size="small" color="warning" label="New" />}
      </Stack>
      <Muted>{details.join(' · ')}</Muted>
      {names.length > 0 && <Typography sx={{ mt: 0.5 }}>Suggested: {names.join(', ')}</Typography>}
      {r.notes && <Typography sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>{r.notes}</Typography>}
      {r.received_at ? (
        <Muted>
          Received by {nameOf(r.received_by, people)} {shortDate(dayOf(r.received_at, timeZone))}
        </Muted>
      ) : (
        <Muted>Sent to {r.routed_to.map((id) => nameOf(id, people)).join(' and ') || 'the bishopric'}</Muted>
      )}
      <Stack direction="row" useFlexGap sx={{ mt: 1, gap: 1, flexWrap: 'wrap' }}>
        {!r.received_at && onReceive && (
          <Button variant="contained" startIcon={<CheckIcon />} disabled={busy} onClick={() => onReceive(r.id)}>
            Got it
          </Button>
        )}
        {showAgendaLink && (
          <Button component={Link} to="/agenda/bishopric" state={{ back: { to: '/requests', label: 'Requests' } }}>
            Open the callings list
          </Button>
        )}
      </Stack>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Calling requests, for the leader who sent them
// ---------------------------------------------------------------------------

const STAGE_COLORS: Record<CallingStage, 'default' | 'info' | 'warning' | 'success'> = {
  sent: 'default',
  received: 'info',
  in_progress: 'warning',
  finished: 'success',
}

export function MyCallingRequestRow({ request: r, timeZone }: { request: MyCallingRequest; timeZone: string }) {
  const stage = asStage(r.stage)
  return (
    <Box component="article" aria-label={callingRequestSummary(r)} sx={{ py: 1 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontWeight: 600, flex: 1 }}>{callingRequestSummary(r)}</Typography>
        <Chip size="small" color={STAGE_COLORS[stage]} label={STAGE_LABELS[stage]} />
      </Stack>
      <Muted>
        Sent {shortDate(dayOf(r.created_at, timeZone))}
        {r.received_at && r.received_by_name ? ` · received by ${r.received_by_name}` : ''}
      </Muted>
      {r.names.length > 0 && <Muted>You suggested {r.names.join(', ')}</Muted>}
      <Typography variant="body2" sx={{ mt: 0.5 }}>
        {STAGE_HINTS[stage]}
      </Typography>
    </Box>
  )
}

export type CallingRequestForm = {
  kind: CallingRequestKind
  calling_title: string
  organization: string | null
  release_name: string | null
  needed_by: IsoDate | null
  notes: string | null
  names: string[]
}

const EMPTY_FORM = { kind: 'fill' as CallingRequestKind, calling_title: '', organization: '', release_name: '', needed_by: '', notes: '', names: [''] }

/** Three short steps: what kind of change, which calling, then names and anything else. */
export function NewCallingRequest({ callings, onSend, onClose, busy, organization }: {
  callings: ListedCalling[]
  onSend: (form: CallingRequestForm) => Promise<boolean>
  onClose: () => void
  busy: boolean
  /** The organization this leader leads, picked to begin with when the calling list doesn't know. */
  organization?: string | null
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 'sent'>(1)
  const [form, setForm] = useState({ ...EMPTY_FORM, organization: organization ?? '' })
  const listed = callings.find((c) => c.title.toLowerCase() === form.calling_title.trim().toLowerCase())
  const release = needsRelease(form.kind)
  const names = takesNames(form.kind)
  const filledNames = form.names.map((n) => n.trim()).filter(Boolean)
  const canStep2 = !!form.calling_title.trim() && (!release || !!form.release_name.trim()) && (!!listed?.organization || !!form.organization)
  const canSend = form.kind !== 'suggest' || filledNames.length > 0

  if (step === 'sent') {
    return (
      <Box role="status">
        <Typography variant="h2" sx={{ mb: 1 }}>
          Sent to the bishopric
        </Typography>
        <Typography>It's on their list for the next bishopric meeting. You'll see below when they've received it and as they work on it.</Typography>
        <Stack direction="row" useFlexGap sx={{ mt: 2, gap: 1, flexWrap: 'wrap' }}>
          <Button variant="contained" size="large" onClick={onClose}>
            Done
          </Button>
          <Button
            variant="outlined"
            size="large"
            onClick={() => {
              setForm({ ...EMPTY_FORM, organization: organization ?? '' })
              setStep(1)
            }}
          >
            Send another
          </Button>
        </Stack>
      </Box>
    )
  }

  if (step === 1) {
    return (
      <StepFrame step={1} of={3} question="What do you need?" onBack={() => setStep(1)} onCancel={onClose} nextLabel="Next" canNext busy={busy} onNext={() => setStep(2)}>
        <Choices label="What do you need?" value={form.kind} options={CALLING_REQUEST_KINDS.map((k) => ({ value: k.kind, label: k.label, hint: k.hint }))} onChange={(kind) => setForm({ ...form, kind })} />
      </StepFrame>
    )
  }

  if (step === 2) {
    return (
      <StepFrame step={2} of={3} question="Which calling?" onBack={() => setStep(1)} onCancel={onClose} nextLabel="Next" canNext={canStep2} busy={busy} onNext={() => setStep(3)}>
        <Stack spacing={1.5}>
          <CallingField required callings={callings} value={form.calling_title} onChange={(calling_title) => setForm({ ...form, calling_title })} />
          {/* The calling list knows most organizations; ask only when it doesn't. */}
          {form.calling_title.trim() && !listed?.organization && (
            <TextField select required label="Which organization?" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} slotProps={nativeSelect}>
              <option value="" disabled>
                Choose one
              </option>
              {ORGANIZATIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </TextField>
          )}
          {release && <TextField label="Who should be released?" required value={form.release_name} onChange={(e) => setForm({ ...form, release_name: e.target.value })} />}
        </Stack>
      </StepFrame>
    )
  }

  const setName = (i: number, value: string) => setForm({ ...form, names: form.names.map((n, j) => (j === i ? value : n)) })
  return (
    <StepFrame
      step={3}
      of={3}
      question={names ? 'Anyone you would suggest?' : 'Anything else the bishopric should know?'}
      onBack={() => setStep(2)}
      onCancel={onClose}
      nextLabel="Send to the bishopric"
      canNext={canSend}
      busy={busy}
      onNext={() =>
        void onSend({
          kind: form.kind,
          calling_title: form.calling_title.trim(),
          organization: listed?.organization ?? (form.organization || null),
          release_name: release ? form.release_name.trim() : null,
          needed_by: form.needed_by || null,
          notes: form.notes.trim() || null,
          names: names ? filledNames : [],
        }).then((ok) => ok && setStep('sent'))
      }
    >
      <Stack spacing={1.5}>
        {names && (
          <>
            {form.names.map((n, i) => (
              <TextField key={i} label={i === 0 ? (form.kind === 'suggest' ? 'Name' : 'Name (optional)') : 'Another name'} value={n} onChange={(e) => setName(i, e.target.value)} />
            ))}
            {form.names.length < 5 && form.names.every((n) => n.trim()) && (
              <Button startIcon={<PersonAddIcon />} onClick={() => setForm({ ...form, names: [...form.names, ''] })} sx={{ alignSelf: 'flex-start' }}>
                Add another name
              </Button>
            )}
          </>
        )}
        {form.kind !== 'suggest' && (
          <TextField type="date" label="Needed by (optional)" slotProps={dateLabel} value={form.needed_by} onChange={(e) => setForm({ ...form, needed_by: e.target.value })} sx={{ maxWidth: 220 }} />
        )}
        <TextField label="Anything else (optional)" multiline minRows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </Stack>
      <Muted>Only the bishopric sees this. You'll see how it's going, but not their decisions.</Muted>
    </StepFrame>
  )
}

// ---------------------------------------------------------------------------
// The Requests page, put together
// ---------------------------------------------------------------------------

export type RequestsData = {
  requests: Request[]
  people: Profile[]
  recipients: Recipient[]
  callingRequests: CallingRequest[]
  candidates: Pick<Candidate, 'request_id' | 'person_name'>[]
  myCallingRequests: MyCallingRequest[]
  callings: ListedCalling[]
  /** Prayers and spiritual thoughts this person was given. */
  myAssignments: MyAssignment[]
}

export type RequestsActions = {
  send: (draft: NewRequestDraft) => Promise<boolean>
  answer: AnswerRequest
  takeBack: (id: string) => void
  receive: (id: string) => void
  sendCallingRequest: (form: CallingRequestForm) => Promise<boolean>
  answerAssignment: AnswerAssignment
}

/** Closed requests stay on the page this long, so people can see what was finished. */
const KEEP_CLOSED_DAYS = 14

export function RequestsView({
  data,
  userId,
  today,
  timeZone,
  canSend,
  canAskCallings,
  startWith = null,
  actions,
  busy,
  organization = null,
}: {
  data: RequestsData
  userId: string
  today: IsoDate
  timeZone: string
  /** The bishopric sends requests and works calling requests. */
  canSend: boolean
  /** Ward leaders ask for calling changes. */
  canAskCallings: boolean
  startWith?: 'request' | 'calling' | null
  actions: RequestsActions
  busy: boolean
  /** The organization this ward leader leads. */
  organization?: string | null
}) {
  const [open, setOpen] = useState<'request' | 'calling' | null>(startWith)
  const recent = (r: Request) => isOpen(r) || (!!r.closed_at && dayOf(r.closed_at, timeZone) >= addDays(today, -KEEP_CLOSED_DAYS))
  const waiting = waitingOn(userId, data.requests)
  const finished = data.requests.filter((r) => r.to_id === userId && !isOpen(r) && recent(r))
  const sent = sentBy(userId, data.requests).filter(recent)
  const newCalling = data.callingRequests.filter((r) => !r.received_at).sort((a, b) => Number(b.routed_to.includes(userId)) - Number(a.routed_to.includes(userId)))
  const receivedCalling = data.callingRequests.filter((r) => r.received_at && dayOf(r.received_at, timeZone) >= addDays(today, -KEEP_CLOSED_DAYS))

  return (
    <>
      <Typography variant="h1" sx={{ mb: 1.5 }}>
        Requests
      </Typography>

      <Split>
        {(canSend || canAskCallings) && (
          <Side>
            <SectionCard title={open ? undefined : 'What would you like to do?'}>
              {open === 'request' ? (
                <NewRequest recipients={data.recipients} onSend={actions.send} onClose={() => setOpen(null)} busy={busy} />
              ) : open === 'calling' ? (
                <NewCallingRequest callings={data.callings} onSend={actions.sendCallingRequest} onClose={() => setOpen(null)} busy={busy} organization={organization} />
              ) : (
                <Stack sx={{ gap: 1 }}>
                  {canSend && <ActionButton icon={<SendIcon />} label="Ask someone to do something" hint="They'll let you know they've seen it and when it's done." onClick={() => setOpen('request')} />}
                  {canAskCallings && (
                    <ActionButton icon={<PersonAddIcon />} label="Ask for a calling change" hint="Fill a calling, release someone, or suggest a name." onClick={() => setOpen('calling')} />
                  )}
                </Stack>
              )}
            </SectionCard>
          </Side>
        )}

        <MyAssignments assignments={data.myAssignments} people={data.people} today={today} onAnswer={actions.answerAssignment} busy={busy} />

        <SectionCard title="For you">
          {waiting.length ? (
            <Stack divider={<Divider flexItem />}>
              {waiting.map((r) => (
                <IncomingRequest key={r.id} request={r} people={data.people} today={today} onAnswer={actions.answer} busy={busy} />
              ))}
            </Stack>
          ) : (
            <Muted>Nothing waiting for you.</Muted>
          )}
          {finished.length > 0 && (
            <>
              <Typography variant="h3" sx={{ mt: 2 }}>
                Finished lately
              </Typography>
              <Stack divider={<Divider flexItem />}>
                {finished.map((r) => (
                  <IncomingRequest key={r.id} request={r} people={data.people} today={today} onAnswer={actions.answer} busy={busy} />
                ))}
              </Stack>
            </>
          )}
        </SectionCard>

        {canSend && (
          <SectionCard title="Calling requests from leaders">
            {newCalling.length === 0 && receivedCalling.length === 0 && <Muted>None right now.</Muted>}
            <Stack divider={<Divider flexItem />}>
              {newCalling.map((r) => (
                <CallingRequestRow key={r.id} request={r} people={data.people} timeZone={timeZone} candidates={data.candidates} onReceive={actions.receive} busy={busy} />
              ))}
              {receivedCalling.map((r) => (
                <CallingRequestRow key={r.id} request={r} people={data.people} timeZone={timeZone} candidates={data.candidates} busy={busy} showAgendaLink={false} />
              ))}
            </Stack>
          </SectionCard>
        )}

        {canAskCallings && (
          <Side>
            <SectionCard title="Your calling requests">
              {data.myCallingRequests.length ? (
                <Stack divider={<Divider flexItem />}>
                  {data.myCallingRequests.map((r) => (
                    <MyCallingRequestRow key={r.id} request={r} timeZone={timeZone} />
                  ))}
                </Stack>
              ) : (
                <Muted>You haven't sent any.</Muted>
              )}
            </SectionCard>
          </Side>
        )}

        {canSend && (
          <Side>
            <SectionCard title="You asked">
              {sent.length ? (
                <Stack divider={<Divider flexItem />}>
                  {sent.map((r) => (
                    <SentRequest key={r.id} request={r} people={data.people} today={today} timeZone={timeZone} onTakeBack={actions.takeBack} busy={busy} />
                  ))}
                </Stack>
              ) : (
                <Muted>Nothing you've asked for is open.</Muted>
              )}
            </SectionCard>
          </Side>
        )}

        {!canSend && !canAskCallings && waiting.length === 0 && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            When the bishopric asks you to do something, it shows here.
          </Alert>
        )}
      </Split>
    </>
  )
}
