// Change of bishopric, one question per screen: who holds each office now, what happens to those
// leaving, whether the outgoing bishop mentors the new one, then a check of what moves to whom.
// run_handover() does the rest in one step.

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { ErrorNote, Loading, Muted, SaveError, SectionCard } from '../components/Layout'
import { PersonPick } from '../components/PersonPick'
import { Choices, StepFrame } from '../components/Steps'
import { addDays, longDate, type IsoDate } from '../lib/dates'
import {
  currentSeats,
  describeWork,
  doubleBooked,
  holderOf,
  leavingPeople,
  MENTOR_DEFAULT_DAYS,
  MENTOR_MAX_DAYS,
  mentorDayAllowed,
  mentorEndsAt,
  officeLabel,
  OFFICES,
  organizationsOf,
  pickReady,
  type Leaving,
  type Office,
  type Pick,
  type Seats,
  type Work,
} from '../lib/leadership'
import * as q from '../lib/queries'
import { supabase, WARD_TIME_ZONE } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'
import { wardToday } from '../lib/wardToday'
import { nativeSelect } from '../theme'

type Step = 'bishop' | 'first_counselor' | 'second_counselor' | 'others' | 'leaving' | 'mentor' | 'check'

const QUESTIONS: Record<Step, string> = {
  bishop: "Who's the new bishop?",
  first_counselor: 'Who is first counselor?',
  second_counselor: 'Who is second counselor?',
  others: 'Secretaries and clerk',
  leaving: 'The people leaving',
  mentor: 'Help for the new bishop',
  check: 'Check and confirm',
}

const OTHER_OFFICES: Office[] = ['executive_secretary', 'assistant_executive_secretary', 'ward_clerk']

export function HandoverPage() {
  const navigate = useNavigate()
  const { reloadMentoring } = useAuth()
  const { data, error } = useAsync(async () => {
    const [people, callings] = await Promise.all([q.loadLeadershipPeople(supabase), q.loadCallingList(supabase)])
    return { people, organizations: organizationsOf(callings) }
  }, [])
  const [seats, setSeats] = useState<Seats | null>(null)
  const [leaving, setLeaving] = useState<Record<string, Leaving>>({})
  const [mentor, setMentor] = useState(true)
  const [mentorDay, setMentorDay] = useState<IsoDate>(addDays(wardToday(), MENTOR_DEFAULT_DAYS))
  const [mentorCallings, setMentorCallings] = useState(false)
  const [at, setAt] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const run = useAction()
  const work = useAsync(async () => {
    if (!data) return {} as Record<string, Work | null>
    const holders = OFFICES.map(({ office }) => holderOf(data.people, office)).filter((p) => !!p)
    const loaded = await Promise.all(holders.map(async (p) => [p!.id, await q.loadLeadershipWork(supabase, p!.id)] as const))
    return Object.fromEntries(loaded)
  }, [data])

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />
  const { people, organizations } = data
  const current = seats ?? currentSeats(people)
  const outgoingBishop = holderOf(people, 'bishop')
  const newBishop = current.bishop
  const leavers = leavingPeople(people, current)
  const bishopChanges = !!outgoingBishop && !(newBishop.kind === 'person' && newBishop.id === outgoingBishop.id)
  const canMentor = bishopChanges && newBishop.kind === 'person' && leavers.some((p) => p.id === outgoingBishop!.id)

  const steps: Step[] = ['bishop', 'first_counselor', 'second_counselor', 'others', ...(leavers.length ? (['leaving'] as Step[]) : []), ...(bishopChanges ? (['mentor'] as Step[]) : []), 'check']
  const step = steps[Math.min(at, steps.length - 1)]
  const nameOf = (id: string) => people.find((p) => p.id === id)?.display_name ?? 'Someone'
  // Picking someone for an office takes them out of any other one, which is then left to fill.
  const setSeat = (office: Office, pick: Pick) => {
    const next = { ...current, [office]: pick }
    if (pick.kind === 'person') {
      for (const { office: o } of OFFICES) {
        const s = next[o]
        if (o !== office && s.kind === 'person' && s.id === pick.id) next[o] = { kind: 'empty' }
      }
    }
    setSeats(next)
  }
  const leavingOf = (id: string): Leaving => leaving[id] ?? { becomes: 'released', organization: organizations[0] ?? '' }

  const ready: Record<Step, boolean> = {
    bishop: newBishop.kind !== 'empty' && pickReady(newBishop),
    first_counselor: pickReady(current.first_counselor),
    second_counselor: pickReady(current.second_counselor),
    others: OTHER_OFFICES.every((o) => pickReady(current[o])),
    leaving: leavers.every((p) => leavingOf(p.id).becomes === 'released' || !!leavingOf(p.id).organization),
    mentor: !mentor || !canMentor || mentorDayAllowed(mentorDay, wardToday()),
    check: !doubleBooked(current),
  }

  const submit = async () => {
    const ok = await run.act(async () => {
      await q.runHandover(supabase, {
        seats: current,
        leaving: Object.fromEntries(leavers.map((p) => [p.id, leavingOf(p.id)])),
        mentorEndsAt: canMentor && mentor ? mentorEndsAt(mentorDay, WARD_TIME_ZONE) : null,
        mentorSeesCallings: mentorCallings,
      })
    })
    setConfirming(false)
    if (ok) {
      setDone(true)
      await reloadMentoring()
    }
  }

  if (done) {
    const newcomers = OFFICES.flatMap(({ office }) => (current[office].kind === 'new' ? [{ office, email: (current[office] as { email: string }).email }] : []))
    return (
      <SectionCard title="The new bishopric is set">
        <Typography>Open work has moved to whoever holds each office now.</Typography>
        {newcomers.length > 0 && (
          <>
            <Typography sx={{ mt: 1.5 }}>Ask these people to sign in. Their work is waiting for them:</Typography>
            <Box component="ul" sx={{ mt: 0.5 }}>
              {newcomers.map((n) => (
                <li key={n.office}>
                  {officeLabel(n.office)}: {n.email}
                </li>
              ))}
            </Box>
          </>
        )}
        <Button component={Link} to="/settings" variant="contained" size="large" sx={{ mt: 2 }}>
          Done
        </Button>
      </SectionCard>
    )
  }

  const officeStep = (office: Office) => (
    <>
      <PersonPick label={officeLabel(office)} people={people} value={current[office]} onChange={(p) => setSeat(office, p)} current={holderOf(people, office)} allowEmpty={office !== 'bishop'} />
      {office === 'bishop' && (
        <Box sx={{ mt: 1 }}>
          <Muted>Counselors and secretaries can stay, change office, or be someone new on the next steps.</Muted>
        </Box>
      )}
    </>
  )

  // Who takes each outgoing person's work, for the check step.
  const handovers = OFFICES.flatMap(({ office }) => {
    const from = holderOf(people, office)
    const to = current[office]
    if (!from || (to.kind === 'person' && to.id === from.id)) return []
    const fallback = office === 'first_counselor' || office === 'second_counselor' ? 'the bishop' : office === 'assistant_executive_secretary' ? 'the executive secretary' : null
    const toName = to.kind === 'person' ? nameOf(to.id) : to.kind === 'new' ? `${to.email} (once they sign in)` : fallback ? `${fallback} (the office is left empty)` : null
    return [{ office, from, toName, items: describeWork(work.data?.[from.id]) }]
  })

  return (
    <>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Change of bishopric
      </Typography>
      <StepFrame
        step={at + 1}
        of={steps.length}
        question={QUESTIONS[step]}
        onBack={() => setAt(Math.max(0, at - 1))}
        onCancel={() => navigate('/settings')}
        nextLabel={step === 'check' ? 'Make the change' : 'Next'}
        canNext={ready[step]}
        busy={run.busy}
        onNext={() => (step === 'check' ? setConfirming(true) : setAt(at + 1))}
      >
        {(step === 'bishop' || step === 'first_counselor' || step === 'second_counselor') && officeStep(step)}

        {step === 'others' && (
          <Stack spacing={2}>
            {OTHER_OFFICES.map((office) => (
              <PersonPick key={office} label={officeLabel(office)} people={people} value={current[office]} onChange={(p) => setSeat(office, p)} current={holderOf(people, office)} />
            ))}
          </Stack>
        )}

        {step === 'leaving' && (
          <Stack spacing={2.5}>
            {leavers.map((p) => {
              const l = leavingOf(p.id)
              return (
                <Box key={p.id}>
                  <Typography sx={{ fontWeight: 600 }}>
                    {p.display_name}, {officeLabel(p.office)}
                  </Typography>
                  <Choices
                    label={`What happens to ${p.display_name}`}
                    value={l.becomes}
                    onChange={(becomes) => setLeaving({ ...leaving, [p.id]: { ...l, becomes } })}
                    options={[
                      { value: 'released', label: 'Released', hint: 'Leaves the bishopric. An admin stays an admin.' },
                      { value: 'leader', label: 'Stays as a ward leader', hint: 'Called to lead an organization' },
                    ]}
                  />
                  {l.becomes === 'leader' && (
                    <TextField select fullWidth label="Which organization?" value={l.organization} onChange={(e) => setLeaving({ ...leaving, [p.id]: { ...l, organization: e.target.value } })} slotProps={nativeSelect}>
                      {organizations.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </TextField>
                  )}
                </Box>
              )
            })}
          </Stack>
        )}

        {step === 'mentor' &&
          (canMentor ? (
            <>
              <Choices
                label="Mentoring"
                value={mentor ? 'yes' : 'no'}
                onChange={(v) => setMentor(v === 'yes')}
                options={[
                  { value: 'yes', label: `Let ${outgoingBishop!.display_name} help for a while`, hint: `He can use Ward Desk as ${nameOf((newBishop as { id: string }).id)}. Everything he does is recorded as the new bishop's, and the new bishop is told.` },
                  { value: 'no', label: 'No mentoring' },
                ]}
              />
              {mentor && (
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                  <TextField
                    type="date"
                    label="Last day"
                    value={mentorDay}
                    onChange={(e) => setMentorDay(e.target.value as IsoDate)}
                    error={!mentorDayAllowed(mentorDay, wardToday())}
                    helperText={`Up to 12 weeks. The new bishop can end it sooner or move the date.`}
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: wardToday(), max: addDays(wardToday(), MENTOR_MAX_DAYS) } }}
                  />
                  <FormControlLabel control={<Switch checked={mentorCallings} onChange={(e) => setMentorCallings(e.target.checked)} />} label="Include callings" />
                  <Muted>Off keeps calling discussions between the new bishopric. The new bishop can change this later on his Account page.</Muted>
                </Stack>
              )}
            </>
          ) : (
            <Muted>
              Mentoring needs the new bishop to have signed in to Ward Desk before the change, and the outgoing bishop to be released. Ask him to sign in
              first if you'd like it.
            </Muted>
          ))}

        {step === 'check' && (
          <Stack spacing={1.5}>
            {doubleBooked(current) && <Alert severity="error">Someone is down for two offices. Go back and pick again.</Alert>}
            {OFFICES.map(({ office }) => {
              const pick = current[office]
              const holder = holderOf(people, office)
              const same = pick.kind === 'person' && holder?.id === pick.id
              const who = pick.kind === 'person' ? nameOf(pick.id) : pick.kind === 'new' ? pick.email : 'Nobody'
              return (
                <Typography key={office}>
                  <b>{officeLabel(office)}:</b> {who}
                  {same ? ' (stays)' : ''}
                </Typography>
              )
            })}
            {handovers.map((h) => (
              <SectionCard key={h.office} title={`From ${h.from.display_name}`}>
                {h.toName ? (
                  h.items.length ? (
                    <>
                      <Typography>To {h.toName}:</Typography>
                      <Box component="ul" sx={{ my: 0.5 }}>
                        {h.items.map((i) => (
                          <li key={i}>{i}</li>
                        ))}
                      </Box>
                    </>
                  ) : (
                    <Muted>Nothing open to hand over.</Muted>
                  )
                ) : (
                  <Muted>The office is left empty; open work stays where it is.</Muted>
                )}
              </SectionCard>
            ))}
            {canMentor && mentor && (
              <Typography>
                {outgoingBishop!.display_name} helps the new bishop until {longDate(mentorDay)}
                {mentorCallings ? ', callings included.' : ', without callings.'}
              </Typography>
            )}
            <Muted>Finished requests and past appointments stay as they are.</Muted>
          </Stack>
        )}
        <ErrorNote error={work.error} />
        <SaveError action={run} />
      </StepFrame>

      <Dialog open={confirming} onClose={() => setConfirming(false)}>
        <DialogTitle>Make the change now?</DialogTitle>
        <DialogContent>
          <DialogContentText>Offices change and open work moves straight away. This can't be undone from the app.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Not yet</Button>
          <Button variant="contained" disabled={run.busy} onClick={() => void submit()}>
            Make the change
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
