import CheckIcon from '@mui/icons-material/Check'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { canSendRequests } from '../lib/access'
import { meetingLine, PART_LABELS, waitingAnswer } from '../lib/assignments'
import * as q from '../lib/queries'
import { FORMER_MEMBER, callingRequestSummary, requestStatusLine, unreceived, waitingOn } from '../lib/requests'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'
import { wardToday } from '../lib/wardToday'
import { Muted, SaveError, SectionCard } from './Layout'
import { useRefreshWaiting } from './WaitingCount'

const SHOWN = 3

/**
 * On Home: requests waiting on this person, meeting assignments to accept or decline, and calling
 * requests sent to them, with the answer right here so it takes a single tap. Shows nothing when
 * nothing is waiting.
 */
export function RequestsOnHome() {
  const { profile, roles } = useAuth()
  const userId = profile?.id ?? ''
  const bishopric = canSendRequests(roles)
  const refreshBadge = useRefreshWaiting()
  const { data, reload } = useAsync(
    async () => {
      const [requests, callingRequests, people, assignments] = await Promise.all([
        q.loadRequests(supabase),
        bishopric ? q.loadCallingRequests(supabase) : Promise.resolve([]),
        q.loadProfiles(supabase),
        q.loadMyAssignments(supabase),
      ])
      return { requests, callingRequests, people, assignments }
    },
    [bishopric],
  )
  const save = useAction()
  if (!data) return null

  const today = wardToday()
  const mine = waitingOn(userId, data.requests)
  const calling = unreceived(data.callingRequests, userId)
  const parts = waitingAnswer(data.assignments, today)
  if (!mine.length && !calling.length && !parts.length) return null

  const from = (id: string | null) => (id === null ? FORMER_MEMBER : (data.people.find((p) => p.id === id)?.display_name ?? 'Someone'))
  const ack = (fn: () => Promise<void>) =>
    void save.act(fn).then((ok) => {
      if (ok) {
        reload()
        refreshBadge()
      }
    })

  type Item = { id: string; title: string; line: string; onAck: (() => void) | null; ackLabel?: string; onDecline?: () => void }
  const items: Item[] = [
    ...parts.map((a) => ({
      id: a.id,
      title: PART_LABELS[a.part],
      line: meetingLine(a),
      ackLabel: 'Accept',
      onAck: () =>
        ack(async () => {
          await q.answerAssignment(supabase, a.id, 'accepted')
          void q.pushAbout(supabase, 'assignment_answered', a.id)
        }),
      onDecline: () =>
        ack(async () => {
          await q.answerAssignment(supabase, a.id, 'declined')
          void q.pushAbout(supabase, 'assignment_answered', a.id)
        }),
    })),
    ...mine.map((r) => ({
      id: r.id,
      title: r.title,
      line: `From ${from(r.from_id)} · ${requestStatusLine(r, today)}`,
      onAck:
        r.status === 'sent'
          ? () =>
              ack(async () => {
                await q.answerRequest(supabase, r.id, 'seen')
                void q.pushAbout(supabase, 'request_answered', r.id)
              })
          : null,
    })),
    ...calling.map((r) => ({
      id: r.id,
      title: callingRequestSummary(r),
      line: `Calling request from ${from(r.requested_by)}${r.organization ? ` (${r.organization})` : ''}`,
      onAck: () =>
        ack(async () => {
          await q.receiveCallingRequest(supabase, r.id, userId)
          void q.pushAbout(supabase, 'calling_request_received', r.id)
        }),
    })),
  ]

  return (
    <SectionCard title="Waiting for you">
      <SaveError action={save} />
      <Stack spacing={1.5}>
        {items.slice(0, SHOWN).map((i) => (
          <Stack key={i.id} direction="row" sx={{ alignItems: 'center', gap: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600 }}>{i.title}</Typography>
              <Muted>{i.line}</Muted>
            </Box>
            {i.onDecline && (
              <Button disabled={save.busy} onClick={i.onDecline} aria-label={`Decline: ${i.title}`} sx={{ flexShrink: 0 }}>
                Decline
              </Button>
            )}
            {i.onAck && (
              <Button variant="outlined" startIcon={<CheckIcon />} disabled={save.busy} onClick={i.onAck} aria-label={`${i.ackLabel ?? 'Got it'}: ${i.title}`} sx={{ flexShrink: 0 }}>
                {i.ackLabel ?? 'Got it'}
              </Button>
            )}
          </Stack>
        ))}
      </Stack>
      <Button component={Link} to="/requests" variant="contained" sx={{ mt: 2 }}>
        {items.length > SHOWN ? `See all ${items.length}` : 'Open requests'}
      </Button>
    </SectionCard>
  )
}
