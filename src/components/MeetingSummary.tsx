import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { personLabel, programFor } from '../lib/agenda'
import { longDate } from '../lib/dates'
import type { Absence, Meeting, ProgramItem, Profile } from '../lib/queries'
import { isAway } from '../lib/schedule'

const TYPE_LABELS: Record<Meeting['meeting_type'], string> = {
  regular: '',
  fast_sunday: 'Fast Sunday',
  stake_conference: 'Stake Conference',
  general_conference: 'General Conference',
  ward_conference: 'Ward Conference',
  special_program: 'Special program',
}

const KIND_LABELS: Record<ProgramItem['kind'], string> = {
  talk: 'Talk',
  musical_number: 'Musical number',
  intermediate_hymn: 'Intermediate hymn',
  testimonies: 'Testimonies',
  other: '',
}

const STATUS_LABELS: Record<ProgramItem['status'], string> = {
  planned: 'idea',
  invited: 'invited',
  confirmed: 'confirmed',
  declined: 'declined',
}

const STATUS_COLORS: Record<ProgramItem['status'], 'default' | 'info' | 'success' | 'error'> = {
  planned: 'default',
  invited: 'info',
  confirmed: 'success',
  declined: 'error',
}

const hymn = (n: number | null) => (n ? `#${n}` : '—')

function Label({ children }: { children: string }) {
  return (
    <Box component="span" sx={{ color: 'text.secondary' }}>
      {children}
    </Box>
  )
}

/** One Sunday, laid out like a row of the Sacrament tab. */
export function MeetingSummary({
  date,
  meeting,
  items,
  profiles,
  absences,
}: {
  date: string
  meeting: Meeting | undefined
  items: ProgramItem[]
  profiles: Profile[]
  absences: Absence[]
}) {
  if (!meeting) {
    return (
      <div>
        <Typography variant="h2">{longDate(date)}</Typography>
        <Typography color="text.secondary">Not planned yet.</Typography>
      </div>
    )
  }

  const away = isAway(meeting.conducting_id, date, absences)
  const conducting = personLabel(meeting.conducting_id, profiles)
  const program = programFor(meeting.id, items)
  const noProgram = meeting.meeting_type === 'stake_conference' || meeting.meeting_type === 'general_conference'

  return (
    <Stack spacing={1}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="h2">{longDate(date)}</Typography>
        {meeting.meeting_type !== 'regular' && <Chip size="small" color="secondary" label={meeting.title || TYPE_LABELS[meeting.meeting_type]} />}
      </Stack>
      {away && (
        <Alert severity="warning" role="status">
          {conducting} is away {away.location ? `(${away.location}) ` : ''}this Sunday.
        </Alert>
      )}
      {!noProgram && (
        <>
          <Typography variant="body2">
            <Label>Presiding</Label> {meeting.presiding || '—'} · <Label>Conducting</Label> {conducting || '—'}
          </Typography>
          <Typography variant="body2">
            <Label>Hymns</Label> {hymn(meeting.opening_hymn)} / {hymn(meeting.sacrament_hymn)} / {hymn(meeting.closing_hymn)} ·{' '}
            <Label>Prayers</Label> {meeting.invocation || '—'} / {meeting.benediction || '—'}
          </Typography>
          {program.length > 0 ? (
            <Box component="ol" sx={{ m: 0, pl: 3, typography: 'body2' }}>
              {program.map((p) => (
                <li key={p.id}>
                  {p.kind !== 'talk' && <Label>{`${KIND_LABELS[p.kind]} `}</Label>}
                  {p.person_name}
                  {p.hymn_number ? ` #${p.hymn_number}` : ''}
                  {p.topic ? ` — ${p.topic}` : ''}
                  {p.note ? <Label>{` (${p.note})`}</Label> : null}
                  {p.status !== 'confirmed' && p.kind === 'talk' ? (
                    <Chip size="small" variant="outlined" color={STATUS_COLORS[p.status]} label={STATUS_LABELS[p.status]} sx={{ ml: 1, height: 20 }} />
                  ) : null}
                </li>
              ))}
            </Box>
          ) : (
            meeting.meeting_type === 'regular' && (
              <Typography variant="body2" color="text.secondary">
                No speakers yet.
              </Typography>
            )
          )}
        </>
      )}
    </Stack>
  )
}
