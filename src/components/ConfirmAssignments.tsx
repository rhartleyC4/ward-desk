import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined'
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { ANSWER_COLORS, ANSWER_LABELS, assignmentMessage, assignmentSubject, MEETING_PARTS, PART_LABELS, type AgendaAssignment, type AssignmentAnswer } from '../lib/assignments'
import type { IsoDate } from '../lib/dates'
import { emailLink, smsLink } from '../lib/messages'
import type { Profile } from '../lib/queries'
import { Muted } from './Layout'

export type RecordAnswer = (id: string, status: Exclude<AssignmentAnswer, 'asked'>, reply?: string | null) => Promise<boolean>

type Props = {
  assignments: AgendaAssignment[]
  people: Profile[]
  meeting: string
  date: IsoDate
  startTime: string | null
  me: { id: string; name: string }
  onRecord: RecordAnswer
}

/** One person to ask by text or email, then record what they said. */
function ConfirmOne({ assignment: a, person, meeting, date, startTime, me, onRecord }: Omit<Props, 'assignments' | 'people'> & { assignment: AgendaAssignment; person: Profile | undefined }) {
  const name = person?.display_name ?? ''
  const [text, setText] = useState(() => assignmentMessage({ name, part: a.part, meeting, date, startTime, myName: me.name }))
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const label = `${PART_LABELS[a.part]}: ${name || 'someone'}`

  return (
    <Box component="article" aria-label={label} sx={{ py: 1.5 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography sx={{ fontWeight: 600, flex: 1 }}>{label}</Typography>
        <Chip size="small" variant="outlined" color={ANSWER_COLORS[a.status]} label={ANSWER_LABELS[a.status]} />
      </Stack>
      <TextField label="Message" multiline minRows={3} fullWidth value={text} onChange={(e) => setText(e.target.value)} />
      <Stack direction="row" useFlexGap sx={{ mt: 1, gap: 1, flexWrap: 'wrap' }}>
        <Button variant="outlined" startIcon={<SmsOutlinedIcon />} component="a" href={smsLink(text)}>
          Text
        </Button>
        <Button variant="outlined" startIcon={<EmailOutlinedIcon />} component="a" href={emailLink(assignmentSubject(meeting, date), text, person?.email ?? '')}>
          Email
        </Button>
      </Stack>

      <Typography variant="body2" sx={{ mt: 1.5, color: 'text.secondary' }}>
        When they answer:
      </Typography>
      {declining ? (
        <Stack
          component="form"
          spacing={1}
          sx={{ mt: 0.5 }}
          onSubmit={(e) => {
            e.preventDefault()
            void onRecord(a.id, 'declined', reason).then((ok) => ok && setDeclining(false))
          }}
        >
          <TextField label="What they said (optional)" placeholder="Out of town that week" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          <Stack direction="row" spacing={1}>
            <Button type="submit" variant="contained">
              Record no
            </Button>
            <Button onClick={() => setDeclining(false)}>Cancel</Button>
          </Stack>
        </Stack>
      ) : (
        <Stack direction="row" useFlexGap sx={{ mt: 0.5, gap: 1, flexWrap: 'wrap' }}>
          {a.status !== 'accepted' && (
            <Button variant="contained" onClick={() => void onRecord(a.id, 'accepted')}>
              They said yes
            </Button>
          )}
          {a.status !== 'declined' && <Button onClick={() => setDeclining(true)}>They said no</Button>}
        </Stack>
      )}
    </Box>
  )
}

/**
 * For someone who doesn't use the app: ask them by text or email, then record their answer for
 * them. Hidden until opened, since most people answer in the app.
 */
export function ConfirmAssignments({ assignments, people, ...rest }: Props) {
  const [open, setOpen] = useState(false)
  // Your own parts need no asking.
  const others = MEETING_PARTS.flatMap((part) => assignments.filter((a) => a.part === part && a.assignee_id !== rest.me.id))
  if (!others.length) return null

  return (
    <Box sx={{ mt: 0.5 }}>
      <Button size="small" onClick={() => setOpen(!open)} aria-expanded={open} sx={{ color: 'text.secondary' }}>
        {open ? 'Hide confirming for them' : 'Not using the app? Confirm for them'}
      </Button>
      {open && (
        <Box sx={{ mt: 1, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Muted>Text or email each person, then record what they said. Whoever made the assignment is told.</Muted>
          <Stack divider={<Divider flexItem />}>
            {others.map((a) => (
              <ConfirmOne key={`${a.id}-${a.assignee_id}`} assignment={a} person={people.find((p) => p.id === a.assignee_id)} {...rest} />
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  )
}
