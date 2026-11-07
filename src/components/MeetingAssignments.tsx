import CheckIcon from '@mui/icons-material/Check'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { ANSWER_LABELS, meetingLine, PART_LABELS, upcomingForMe, type AssignmentAnswer, type MyAssignment } from '../lib/assignments'
import type { IsoDate } from '../lib/dates'
import type { Profile } from '../lib/queries'
import { Muted, SectionCard } from './Layout'

export type AnswerAssignment = (id: string, status: Exclude<AssignmentAnswer, 'asked'>, reply?: string | null) => Promise<boolean>

/** One assignment for the person asked: what and when, with Accept and Decline. */
export function AssignmentForMe({ assignment: a, people, onAnswer, busy }: { assignment: MyAssignment; people: Pick<Profile, 'id' | 'display_name'>[]; onAnswer: AnswerAssignment; busy: boolean }) {
  const [declining, setDeclining] = useState(false)
  const [note, setNote] = useState('')
  const from = people.find((p) => p.id === a.assigned_by)?.display_name

  return (
    <Box component="article" aria-label={`${PART_LABELS[a.part]}, ${a.meeting_name}`} sx={{ py: 1 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontWeight: 600, flex: 1 }}>{PART_LABELS[a.part]}</Typography>
        <Chip size="small" color={a.status === 'asked' ? 'warning' : 'success'} label={a.status === 'asked' ? 'New' : ANSWER_LABELS[a.status]} />
      </Stack>
      <Muted>
        {meetingLine(a)}
        {from ? ` · from ${from}` : ''}
      </Muted>

      {!declining && (
        <Stack direction="row" useFlexGap sx={{ mt: 1, gap: 1, flexWrap: 'wrap' }}>
          {a.status === 'asked' && (
            <Button variant="contained" startIcon={<CheckIcon />} disabled={busy} onClick={() => onAnswer(a.id, 'accepted')}>
              Accept
            </Button>
          )}
          <Button variant={a.status === 'asked' ? 'outlined' : 'text'} disabled={busy} onClick={() => setDeclining(true)} sx={a.status === 'asked' ? undefined : { color: 'text.secondary' }}>
            {a.status === 'asked' ? 'Decline' : "I can't anymore"}
          </Button>
        </Stack>
      )}
      {declining && (
        <Stack
          component="form"
          spacing={1}
          sx={{ mt: 1 }}
          onSubmit={(e) => {
            e.preventDefault()
            void onAnswer(a.id, 'declined', note).then((ok) => ok && setDeclining(false))
          }}
        >
          <TextField label="Let them know why (optional)" placeholder="Out of town that week" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          <Stack direction="row" spacing={1}>
            <Button type="submit" variant="contained" disabled={busy}>
              Decline
            </Button>
            <Button onClick={() => setDeclining(false)}>Cancel</Button>
          </Stack>
        </Stack>
      )}
    </Box>
  )
}

/** On Requests: prayers and spiritual thoughts this person has coming up. Shows nothing when there are none. */
export function MyAssignments({ assignments, people, today, onAnswer, busy }: { assignments: MyAssignment[]; people: Pick<Profile, 'id' | 'display_name'>[]; today: IsoDate; onAnswer: AnswerAssignment; busy: boolean }) {
  const upcoming = upcomingForMe(assignments, today)
  if (!upcoming.length) return null
  return (
    <SectionCard title="Meeting assignments">
      <Stack divider={<Divider flexItem />}>
        {upcoming.map((a) => (
          <AssignmentForMe key={a.id} assignment={a} people={people} onAnswer={onAnswer} busy={busy} />
        ))}
      </Stack>
    </SectionCard>
  )
}
