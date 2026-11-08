// A new leader for an organization, one question per screen: which organization, who leads it
// now, what happens to the one before, then a check. change_leader() moves their open work.

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ErrorNote, Loading, Muted, SectionCard } from '../components/Layout'
import { PersonPick } from '../components/PersonPick'
import { Choices, StepFrame } from '../components/Steps'
import { describeWork, organizationsOf, pickReady, type Pick } from '../lib/leadership'
import * as q from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'
import { nativeSelect } from '../theme'

const QUESTIONS = ['Which organization?', 'Who leads it now?', 'And the leader before?', 'Check and confirm']

export function LeaderChangePage() {
  const navigate = useNavigate()
  const { data, error } = useAsync(async () => {
    const [people, callings] = await Promise.all([q.loadLeadershipPeople(supabase), q.loadCallingList(supabase)])
    return { people, organizations: organizationsOf(callings) }
  }, [])
  const [org, setOrg] = useState('')
  const [pick, setPick] = useState<Pick>({ kind: 'new', email: '' })
  const [becomes, setBecomes] = useState<'released' | 'leader'>('released')
  const [at, setAt] = useState(0)
  const [done, setDone] = useState(false)
  const run = useAction()
  const organization = org || data?.organizations[0] || ''
  const outgoing = data?.people.find((p) => p.organization?.toLowerCase() === organization.toLowerCase()) ?? null
  const work = useAsync(async () => (outgoing ? q.loadLeadershipWork(supabase, outgoing.id) : null), [outgoing?.id])

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  // Nobody leads it yet: skip the question about the one before.
  const steps = outgoing ? [0, 1, 2, 3] : [0, 1, 3]
  const step = steps[Math.min(at, steps.length - 1)]
  const newName = pick.kind === 'person' ? (data.people.find((p) => p.id === pick.id)?.display_name ?? 'Them') : pick.kind === 'new' ? pick.email : ''
  const ready = [!!organization, pick.kind !== 'empty' && pickReady(pick) && !(pick.kind === 'person' && pick.id === outgoing?.id), true, true][step]

  const submit = async () => {
    const ok = await run.act(async () => {
      await q.changeLeader(supabase, {
        organization,
        person: pick.kind === 'person' ? pick.id : undefined,
        email: pick.kind === 'new' ? pick.email : undefined,
        outgoingBecomes: becomes,
      })
    })
    if (ok) setDone(true)
  }

  if (done) {
    return (
      <SectionCard title={`${organization} has a new leader`}>
        <Typography>
          {newName} now leads {organization}
          {pick.kind === 'new' ? '. Ask them to sign in; their open work is waiting for them.' : ', with the open work moved to them.'}
        </Typography>
        <Button component={Link} to="/settings" variant="contained" size="large" sx={{ mt: 2 }}>
          Done
        </Button>
      </SectionCard>
    )
  }

  const items = describeWork(work.data)

  return (
    <>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Change a ward leader
      </Typography>
      <StepFrame
        step={at + 1}
        of={steps.length}
        question={QUESTIONS[step]}
        onBack={() => setAt(Math.max(0, at - 1))}
        onCancel={() => navigate('/settings')}
        nextLabel={step === 3 ? 'Make the change' : 'Next'}
        canNext={ready}
        busy={run.busy}
        onNext={() => (step === 3 ? void submit() : setAt(at + 1))}
      >
        {step === 0 && (
          <>
            <TextField select fullWidth label="Organization" value={organization} onChange={(e) => setOrg(e.target.value)} slotProps={nativeSelect}>
              {data.organizations.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </TextField>
            <Box sx={{ mt: 1 }}>
              <Muted>{outgoing ? `Led now by ${outgoing.display_name}.` : 'Nobody in Ward Desk leads it yet.'}</Muted>
            </Box>
          </>
        )}
        {step === 1 && (
          <PersonPick
            label={`New leader of ${organization}`}
            people={data.people.filter((p) => !p.office)}
            value={pick}
            onChange={setPick}
            allowEmpty={false}
            exclude={outgoing ? [outgoing.id] : []}
          />
        )}
        {step === 2 && outgoing && (
          <Choices
            label={`What happens to ${outgoing.display_name}`}
            value={becomes}
            onChange={setBecomes}
            options={[
              { value: 'released', label: 'Released', hint: 'No longer a ward leader in Ward Desk' },
              { value: 'leader', label: 'Has another leader calling', hint: 'Keeps using Ward Desk as a leader, without this organization' },
            ]}
          />
        )}
        {step === 3 && (
          <>
            <Typography>
              <b>{organization}:</b> {newName}
            </Typography>
            {outgoing && (
              <Box sx={{ mt: 1.5 }}>
                <Typography>
                  {outgoing.display_name} is {becomes === 'released' ? 'released' : 'kept as a leader'}.
                </Typography>
                {items.length ? (
                  <>
                    <Typography sx={{ mt: 1 }}>Moving to {newName}{pick.kind === 'new' ? ' once they sign in' : ''}:</Typography>
                    <Box component="ul" sx={{ my: 0.5 }}>
                      {items.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </Box>
                  </>
                ) : (
                  <Muted>Nothing open to hand over.</Muted>
                )}
              </Box>
            )}
          </>
        )}
        <ErrorNote error={run.error ?? work.error} />
      </StepFrame>
    </>
  )
}
