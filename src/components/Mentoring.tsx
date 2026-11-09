// Mentoring after a change of bishopric, on the Account page:
//   * the mentor picks whether to use Ward Desk as himself or for the new bishop;
//   * the new bishop decides how long it lasts and whether his mentor sees callings.

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { addDays, longDate, type IsoDate } from '../lib/dates'
import { MENTOR_MAX_DAYS, mentorDayAllowed, mentorEndsAt } from '../lib/leadership'
import { updateMentoring, type MentoredBy } from '../lib/queries'
import { WARD_TIME_ZONE, supabase } from '../lib/supabase'
import { wardParts } from '../lib/slots'
import { useAction } from '../lib/useAsync'
import { wardToday } from '../lib/wardToday'
import { ErrorNote, Muted, SectionCard } from './Layout'
import { Choices } from './Steps'

/** The last day mentoring covers (it ends at midnight after it). */
const lastDay = (endsAt: string): IsoDate => wardParts(new Date(new Date(endsAt).getTime() - 1).toISOString(), WARD_TIME_ZONE).date

export function MentorChoice() {
  const { mentoring, actingFor, hasOwnRoles, switchActing } = useAuth()
  const act = useAction()
  if (!mentoring.length) return null
  const value = actingFor?.for_id ?? 'me'
  const pick = (v: string) => void act.act(() => switchActing(v === 'me' ? null : v))
  return (
    <SectionCard title="Use Ward Desk as">
      <Muted>While you help the new bishop, you can see and do what he does. Everything you do is recorded as his, and he's told.</Muted>
      <ErrorNote error={act.error} />
      <Choices
        label="Use Ward Desk as"
        value={value}
        onChange={pick}
        options={[
          ...mentoring.map((m) => ({ value: m.for_id, label: `For ${m.name ?? 'the bishop'}`, hint: `Until ${longDate(lastDay(m.ends_at))}${m.sees_callings ? ', callings included' : ', without callings'}` })),
          { value: 'me', label: 'Yourself', hint: hasOwnRoles ? 'Your own calling' : 'You have no calling of your own in Ward Desk' },
        ]}
      />
    </SectionCard>
  )
}

function MentorCard({ m }: { m: MentoredBy }) {
  const { reloadMentoring } = useAuth()
  const save = useAction()
  const today = wardToday()
  const startedOn = wardParts(m.starts_at, WARD_TIME_ZONE).date
  const [day, setDay] = useState<IsoDate>(lastDay(m.ends_at))
  const allowed = mentorDayAllowed(day, today, startedOn)
  const change = async (changes: Parameters<typeof updateMentoring>[2]) => {
    if (await save.act(() => updateMentoring(supabase, m.id, changes))) await reloadMentoring()
  }
  return (
    <Box sx={{ mb: 2 }}>
      <Typography sx={{ fontWeight: 600 }}>{m.name ?? 'Your mentor'}</Typography>
      <Muted>Can use Ward Desk as you. What they do is recorded as yours, and you're told.</Muted>
      <ErrorNote error={save.error} />
      <FormControlLabel
        sx={{ mt: 1, display: 'flex' }}
        control={<Switch checked={m.sees_callings} disabled={save.busy} onChange={(e) => void change({ sees_callings: e.target.checked })} />}
        label="Can see callings"
      />
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap', mt: 1 }}>
        <TextField
          type="date"
          label="Last day"
          value={day}
          onChange={(e) => setDay(e.target.value as IsoDate)}
          error={!allowed}
          helperText={allowed ? ' ' : `Pick a day from today to ${longDate(addDays(startedOn, MENTOR_MAX_DAYS))}`}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today, max: addDays(startedOn, MENTOR_MAX_DAYS) } }}
        />
        <Button variant="outlined" sx={{ mt: 1 }} disabled={save.busy || !allowed || day === lastDay(m.ends_at)} onClick={() => void change({ ends_at: mentorEndsAt(day, WARD_TIME_ZONE) })}>
          Change
        </Button>
      </Box>
      <Button color="error" disabled={save.busy} onClick={() => void change({ ended: true })}>
        End mentoring now
      </Button>
    </Box>
  )
}

export function YourMentors() {
  const { mentoredBy } = useAuth()
  if (!mentoredBy.length) return null
  return (
    <SectionCard title="Mentoring">
      {mentoredBy.map((m) => (
        <MentorCard key={m.id} m={m} />
      ))}
    </SectionCard>
  )
}
