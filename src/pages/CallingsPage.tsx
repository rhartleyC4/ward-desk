import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { ErrorNote, Loading, SectionCard } from '../components/Layout'
import { unsortedSuggestions } from '../lib/agenda'
import type { Enums } from '../lib/database.types'
import * as q from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'
import { nativeSelect } from '../theme'

const STATUSES: { value: Enums<'candidate_status'>; label: string }[] = [
  { value: 'suggested', label: 'Suggested' },
  { value: 'discussing', label: 'Discussing' },
  { value: 'approved', label: 'Approved' },
  { value: 'extended', label: 'Extended' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'sustained', label: 'Sustained' },
  { value: 'set_apart', label: 'Set apart' },
]

const dateLabel = { inputLabel: { shrink: true } } as const

export function CallingsPage() {
  const { data, error, reload } = useAsync(() => q.loadCallings(supabase), [])
  const save = useAction()
  const run = (fn: () => Promise<void>) => save.act(fn).then((ok) => ok && reload())
  const [newNeed, setNewNeed] = useState({ calling_title: '', release_name: '' })
  const [newName, setNewName] = useState<Record<string, string>>({})

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  const suggestions = unsortedSuggestions(data.candidates)
  const openNeeds = data.needs.filter((n) => n.status === 'open')

  const addNeed = (e: FormEvent) => {
    e.preventDefault()
    if (!newNeed.calling_title.trim()) return
    run(() => q.addNeed(supabase, { calling_title: newNeed.calling_title.trim(), release_name: newNeed.release_name.trim() || null }))
    setNewNeed({ calling_title: '', release_name: '' })
  }

  return (
    <>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Callings
      </Typography>
      <ErrorNote error={save.error} />

      {suggestions.length > 0 && (
        <SectionCard title="New suggestions">
          <List disablePadding>
            {suggestions.map((s) => (
              <ListItem key={s.id} disableGutters sx={{ gap: 1, flexWrap: 'wrap' }}>
                <Box sx={{ flex: '1 1 12rem' }}>
                  <strong>{s.person_name}</strong> for {s.calling_title}
                  {s.notes ? (
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      {' '}
                      — {s.notes}
                    </Box>
                  ) : null}
                </Box>
                <TextField
                  select
                  slotProps={{ select: { native: true }, htmlInput: { 'aria-label': `Attach ${s.person_name} to a calling` } }}
                  value=""
                  onChange={(e) => e.target.value && run(() => q.updateCandidate(supabase, s.id, { need_id: e.target.value, status: 'discussing' }))}
                  sx={{ width: 200 }}
                >
                  <option value="">Attach to…</option>
                  {openNeeds.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.calling_title}
                    </option>
                  ))}
                </TextField>
                <Button size="small" onClick={() => run(() => q.updateCandidate(supabase, s.id, { status: 'declined' }))}>
                  Dismiss
                </Button>
              </ListItem>
            ))}
          </List>
        </SectionCard>
      )}

      {openNeeds.map((need) => {
        const all = data.candidates.filter((c) => c.need_id === need.id)
        return (
          <SectionCard
            key={need.id}
            title={need.calling_title}
            action={
              <Button size="small" onClick={() => run(() => q.updateNeed(supabase, need.id, { status: 'filled' }))}>
                Mark filled
              </Button>
            }
          >
            {need.release_name && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, mb: 2 }}>
                <Typography variant="body2">
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    Release:
                  </Box>{' '}
                  {need.release_name}
                </Typography>
                <TextField
                  type="date"
                  label="Announce on"
                  slotProps={dateLabel}
                  value={need.release_on ?? ''}
                  onChange={(e) => run(() => q.updateNeed(supabase, need.id, { release_on: e.target.value || null }))}
                  sx={{ width: 180 }}
                />
              </Stack>
            )}
            {all.length > 0 && (
              <Stack divider={<Divider flexItem />} spacing={1.5}>
                {all.map((c) => (
                  // Name on its own line on phones; name, status and date side by side from sm up.
                  <Grid key={c.id} container spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Grid
                      size={{ xs: 12, sm: 4 }}
                      sx={c.status === 'declined' ? { textDecoration: 'line-through', color: 'text.secondary' } : undefined}
                    >
                      {c.person_name}
                    </Grid>
                    <Grid size={{ xs: 6, sm: 4 }}>
                      <TextField
                        select
                        label="Status"
                        slotProps={{ ...nativeSelect, htmlInput: { 'aria-label': `Status for ${c.person_name}` } }}
                        value={c.status}
                        onChange={(e) => run(() => q.updateCandidate(supabase, c.id, { status: e.target.value as Enums<'candidate_status'> }))}
                      >
                        {STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </TextField>
                    </Grid>
                    <Grid size={{ xs: 6, sm: 4 }}>
                      {['accepted', 'sustained', 'set_apart'].includes(c.status) && (
                        <TextField
                          type="date"
                          label="Sustain on"
                          slotProps={dateLabel}
                          value={c.sustain_on ?? ''}
                          onChange={(e) => run(() => q.updateCandidate(supabase, c.id, { sustain_on: e.target.value || null }))}
                        />
                      )}
                    </Grid>
                  </Grid>
                ))}
              </Stack>
            )}
            <Stack
              component="form"
              direction="row"
              spacing={1}
              sx={{ mt: 1.5 }}
              onSubmit={(e) => {
                e.preventDefault()
                const name = newName[need.id]?.trim()
                if (!name) return
                run(() => q.addCandidate(supabase, { need_id: need.id, person_name: name, status: 'discussing' }))
                setNewName({ ...newName, [need.id]: '' })
              }}
            >
              <TextField
                value={newName[need.id] ?? ''}
                onChange={(e) => setNewName({ ...newName, [need.id]: e.target.value })}
                placeholder="Name to consider"
                slotProps={{ htmlInput: { 'aria-label': `Name to consider for ${need.calling_title}` } }}
              />
              <Button type="submit" variant="outlined">
                Add
              </Button>
            </Stack>
          </SectionCard>
        )
      })}

      <SectionCard title="Add a calling to fill">
        <Grid component="form" container spacing={1.5} onSubmit={addNeed}>
          <Grid size={{ xs: 12, sm: 5 }}>
            <TextField label="Calling" value={newNeed.calling_title} onChange={(e) => setNewNeed({ ...newNeed, calling_title: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 5 }}>
            <TextField label="Releasing (optional)" value={newNeed.release_name} onChange={(e) => setNewNeed({ ...newNeed, release_name: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 2 }}>
            <Button type="submit" variant="contained" fullWidth>
              Add
            </Button>
          </Grid>
        </Grid>
      </SectionCard>
    </>
  )
}
