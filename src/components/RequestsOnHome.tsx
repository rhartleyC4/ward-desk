import CheckIcon from '@mui/icons-material/Check'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { canSendRequests } from '../lib/access'
import { todayIso } from '../lib/dates'
import * as q from '../lib/queries'
import { callingRequestSummary, requestStatusLine, unreceived, waitingOn } from '../lib/requests'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'
import { ErrorNote, Muted, SectionCard } from './Layout'
import { useRefreshWaiting } from './WaitingCount'

const SHOWN = 3

/**
 * On Home: requests waiting on this person and calling requests sent to them, with Got it right
 * here so acknowledging one takes a single tap. Shows nothing when nothing is waiting.
 */
export function RequestsOnHome() {
  const { profile, roles } = useAuth()
  const userId = profile?.id ?? ''
  const bishopric = canSendRequests(roles)
  const refreshBadge = useRefreshWaiting()
  const { data, reload } = useAsync(
    async () => {
      const [requests, callingRequests, people] = await Promise.all([q.loadRequests(supabase), bishopric ? q.loadCallingRequests(supabase) : Promise.resolve([]), q.loadProfiles(supabase)])
      return { requests, callingRequests, people }
    },
    [bishopric],
  )
  const save = useAction()
  if (!data) return null

  const mine = waitingOn(userId, data.requests)
  const calling = unreceived(data.callingRequests, userId)
  if (!mine.length && !calling.length) return null

  const today = todayIso()
  const from = (id: string) => data.people.find((p) => p.id === id)?.display_name ?? 'Someone'
  const ack = (fn: () => Promise<void>) =>
    void save.act(fn).then((ok) => {
      if (ok) {
        reload()
        refreshBadge()
      }
    })

  const items = [
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
      <ErrorNote error={save.error} />
      <Stack spacing={1.5}>
        {items.slice(0, SHOWN).map((i) => (
          <Stack key={i.id} direction="row" sx={{ alignItems: 'center', gap: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600 }}>{i.title}</Typography>
              <Muted>{i.line}</Muted>
            </Box>
            {i.onAck && (
              <Button variant="outlined" startIcon={<CheckIcon />} disabled={save.busy} onClick={i.onAck} aria-label={`Got it: ${i.title}`} sx={{ flexShrink: 0 }}>
                Got it
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
