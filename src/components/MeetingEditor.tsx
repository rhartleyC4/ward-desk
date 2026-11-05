import AddIcon from '@mui/icons-material/Add'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { longDate } from '../lib/dates'
import type { Meeting, ProgramItem, ProgramItemDraft, Profile } from '../lib/queries'
import { nativeSelect } from '../theme'

export type MeetingForm = {
  meeting: Omit<Meeting, 'id' | 'created_at' | 'updated_at'>
  items: ProgramItemDraft[]
}

const emptyItem = (): ProgramItemDraft => ({ kind: 'talk', person_name: '', topic: '', note: '', status: 'planned', hymn_number: null })

const toNumber = (v: string) => (v === '' ? null : Number(v))

const half = { xs: 12, sm: 6, md: 4 }

export function MeetingEditor({
  date,
  meeting,
  items,
  bishopric,
  onSave,
  onCancel,
  busy,
  heading = true,
}: {
  date: string
  meeting: Meeting | undefined
  items: ProgramItem[]
  bishopric: Profile[]
  onSave: (form: MeetingForm) => void
  onCancel: () => void
  busy?: boolean
  /** Off when the card's title bar already shows the date. */
  heading?: boolean
}) {
  const [m, setM] = useState<MeetingForm['meeting']>({
    meeting_date: date,
    meeting_type: meeting?.meeting_type ?? 'regular',
    title: meeting?.title ?? null,
    presiding: meeting?.presiding ?? null,
    conducting_id: meeting?.conducting_id ?? null,
    opening_hymn: meeting?.opening_hymn ?? null,
    sacrament_hymn: meeting?.sacrament_hymn ?? null,
    closing_hymn: meeting?.closing_hymn ?? null,
    invocation: meeting?.invocation ?? null,
    benediction: meeting?.benediction ?? null,
    notes: meeting?.notes ?? null,
  })
  const [program, setProgram] = useState<ProgramItemDraft[]>(
    items.length ? items.map(({ id: _id, meeting_id: _m, position: _p, created_at: _c, ...rest }) => rest) : [],
  )

  const set = <K extends keyof MeetingForm['meeting']>(key: K, value: MeetingForm['meeting'][K]) => setM((prev) => ({ ...prev, [key]: value }))
  const text = (v: string) => (v.trim() === '' ? null : v)
  const setItem = (i: number, patch: Partial<ProgramItemDraft>) => setProgram((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const move = (i: number, by: number) =>
    setProgram((prev) => {
      const next = [...prev]
      const [it] = next.splice(i, 1)
      next.splice(i + by, 0, it)
      return next
    })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSave({ meeting: m, items: program.filter((p) => p.person_name || p.hymn_number || p.kind !== 'talk') })
  }

  return (
    <Box component="form" onSubmit={submit} aria-label={`Edit ${longDate(date)}`}>
      {heading && (
        <Typography variant="h2" sx={{ mb: 2 }}>
          {longDate(date)}
        </Typography>
      )}
      <Grid container spacing={1.5}>
        <Grid size={half}>
          <TextField select label="Type" slotProps={nativeSelect} value={m.meeting_type} onChange={(e) => set('meeting_type', e.target.value as Meeting['meeting_type'])}>
            <option value="regular">Regular</option>
            <option value="fast_sunday">Fast Sunday</option>
            <option value="special_program">Special program</option>
            <option value="ward_conference">Ward conference</option>
            <option value="stake_conference">Stake conference</option>
            <option value="general_conference">General conference</option>
          </TextField>
        </Grid>
        {m.meeting_type === 'special_program' && (
          <Grid size={half}>
            <TextField label="Program title" value={m.title ?? ''} onChange={(e) => set('title', text(e.target.value))} />
          </Grid>
        )}
        <Grid size={half}>
          <TextField label="Presiding" value={m.presiding ?? ''} onChange={(e) => set('presiding', text(e.target.value))} />
        </Grid>
        <Grid size={half}>
          <TextField select label="Conducting" slotProps={nativeSelect} value={m.conducting_id ?? ''} onChange={(e) => set('conducting_id', e.target.value || null)}>
            <option value="">—</option>
            {bishopric.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </TextField>
        </Grid>
        <Grid size={12}>
          <Typography variant="caption" color="text.secondary">
            Hymns
          </Typography>
        </Grid>
        {(
          [
            ['opening_hymn', 'Opening'],
            ['sacrament_hymn', 'Sacrament'],
            ['closing_hymn', 'Closing'],
          ] as const
        ).map(([key, label]) => (
          <Grid key={key} size={4} sx={{ mt: -1 }}>
            <TextField
              label={label}
              inputMode="numeric"
              slotProps={{ htmlInput: { 'aria-label': `${label} hymn` } }}
              value={m[key] ?? ''}
              onChange={(e) => set(key, toNumber(e.target.value))}
            />
          </Grid>
        ))}
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField label="Invocation" value={m.invocation ?? ''} onChange={(e) => set('invocation', text(e.target.value))} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField label="Benediction" value={m.benediction ?? ''} onChange={(e) => set('benediction', text(e.target.value))} />
        </Grid>
      </Grid>

      <Typography variant="h3" sx={{ mt: 3, mb: 1 }}>
        Program
      </Typography>
      <Stack spacing={1}>
        {program.map((p, i) => (
          <Paper key={i} variant="outlined" data-program-item sx={{ p: 1.5 }}>
            <Grid container spacing={1.5}>
              <Grid size={half}>
                <TextField select label="Item" slotProps={nativeSelect} value={p.kind} onChange={(e) => setItem(i, { kind: e.target.value as ProgramItem['kind'] })}>
                  <option value="talk">Talk</option>
                  <option value="musical_number">Musical number</option>
                  <option value="intermediate_hymn">Intermediate hymn</option>
                  <option value="testimonies">Testimonies</option>
                  <option value="other">Other</option>
                </TextField>
              </Grid>
              {p.kind === 'intermediate_hymn' ? (
                <Grid size={half}>
                  <TextField label="Hymn" inputMode="numeric" value={p.hymn_number ?? ''} onChange={(e) => setItem(i, { hymn_number: toNumber(e.target.value) })} />
                </Grid>
              ) : (
                <Grid size={half}>
                  <TextField label={p.kind === 'talk' ? 'Speaker' : 'Who'} value={p.person_name ?? ''} onChange={(e) => setItem(i, { person_name: e.target.value })} />
                </Grid>
              )}
              {p.kind === 'talk' && (
                <>
                  <Grid size={half}>
                    <TextField label="Topic" value={p.topic ?? ''} onChange={(e) => setItem(i, { topic: e.target.value })} />
                  </Grid>
                  <Grid size={half}>
                    <TextField select label="Status" slotProps={nativeSelect} value={p.status} onChange={(e) => setItem(i, { status: e.target.value as ProgramItem['status'] })}>
                      <option value="planned">Idea</option>
                      <option value="invited">Invited</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="declined">Declined</option>
                    </TextField>
                  </Grid>
                </>
              )}
              <Grid size={half}>
                <TextField label="Note" value={p.note ?? ''} onChange={(e) => setItem(i, { note: e.target.value })} placeholder="e.g. Stake" />
              </Grid>
              <Grid size={half} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <IconButton size="small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => move(i, 1)} disabled={i === program.length - 1} aria-label="Move down">
                  <ArrowDownwardIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => setProgram((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove">
                  <DeleteOutlinedIcon fontSize="small" />
                </IconButton>
              </Grid>
            </Grid>
          </Paper>
        ))}
      </Stack>
      <Button startIcon={<AddIcon />} onClick={() => setProgram((prev) => [...prev, emptyItem()])} sx={{ mt: 1 }}>
        Add program item
      </Button>

      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button type="submit" variant="contained" disabled={busy}>
          Save
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </Stack>
    </Box>
  )
}
