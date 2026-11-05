import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { needsToDiscuss, unsortedSuggestions } from '../lib/agenda'
import { coveringLeader, organizationFor, type ListedCalling } from '../lib/callings'
import { appointmentFor, NEEDS_APPOINTMENT, whenLabel } from '../lib/appointments'
import { longDate, type IsoDate } from '../lib/dates'
import { unreceived, type CallingRequest } from '../lib/requests'
import type { Enums, TablesUpdate } from '../lib/database.types'
import type { Appointment, CallingNeed, Candidate, Profile } from '../lib/queries'
import { nativeSelect } from '../theme'
import { CallingField } from './CallingField'
import { Muted } from './Layout'
import { CallingRequestRow } from './Requests'

type Status = Enums<'candidate_status'>

// The steps the bishopric picks from. The database keeps a few more: 'suggested' marks a leader's
// suggestion not yet attached to a calling, and older rows may say extended, sustained or set apart.
const STATUSES: { value: Status; label: string }[] = [
  { value: 'discussing', label: 'Considering' },
  { value: 'approved', label: 'Approved' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
]

/** The step a status shows as in the picker. */
const SHOWN_AS: Record<Status, Status> = {
  suggested: 'discussing',
  discussing: 'discussing',
  approved: 'approved',
  extended: 'approved',
  accepted: 'accepted',
  sustained: 'accepted',
  set_apart: 'accepted',
  declined: 'declined',
}

const ACCEPTED: Status[] = ['accepted', 'sustained', 'set_apart']

const dateLabel = { inputLabel: { shrink: true } } as const

export type CallingsData = {
  needs: CallingNeed[]
  candidates: Candidate[]
  callingList: ListedCalling[]
  appointments: Appointment[]
  bishopric: Profile[]
  profiles: Profile[]
  /** Bishopric assignments, which pick who meets with a newly approved name. */
  stewardships: { user_id: string; area: string }[]
  /** Ward leaders' requests; each one that asked for a change points at its calling. */
  callingRequests: CallingRequest[]
}

export type CallingsActions = {
  addNeed: (need: { calling_title: string; release_name: string | null }) => void
  updateNeed: (id: string, changes: TablesUpdate<'calling_needs'>) => void
  /** Removes the calling, its names and their open appointments. */
  deleteNeed: (id: string) => void
  addCandidate: (needId: string, name: string) => void
  updateCandidate: (id: string, changes: TablesUpdate<'calling_candidates'>) => void
  /** Sets the sustain and release dates and marks the appointment met. */
  acceptCandidate: (candidate: Candidate) => void
  /** Marks a name approved and, when given a leader, hands them the appointment. */
  approveCandidate: (candidate: Candidate, leaderId: string | null) => void
  /** Who in the bishopric meets with the person; null takes the appointment back. */
  assignAppointment: (candidate: Candidate, leaderId: string | null) => void
  /** Tells the leader who asked that the bishopric has their request. */
  receiveCallingRequest: (id: string) => void
}

const nameIn = (id: string | null, data: CallingsData) => data.profiles.find((p) => p.id === id)?.display_name ?? 'a leader'

/** "Asked for by Sister Reyes (Primary) · needed by December 1st · Sunbeams need one" */
function RequestedBy({ need, data }: { need: CallingNeed; data: CallingsData }) {
  const r = data.callingRequests.find((x) => x.need_id === need.id)
  if (!r) return null
  const parts = [
    `Asked for by ${nameIn(r.requested_by, data)}${r.organization ? ` (${r.organization})` : ''}`,
    r.kind === 'release' && 'release only, no one new',
    r.needed_by && `needed by ${longDate(r.needed_by)}`,
    r.received_at ? `received by ${nameIn(r.received_by, data)}` : 'not marked received yet',
  ].filter(Boolean)
  return (
    <Box sx={{ mb: 1 }}>
      <Muted>{parts.join(' · ')}</Muted>
      {r.notes && <Typography variant="body2">“{r.notes}”</Typography>}
    </Box>
  )
}

/** Where the appointment stands, for the line under the "Meets with" picker. */
function appointmentNote(appointment: Appointment | undefined, timeZone: string): string {
  if (!appointment) return ''
  if (appointment.status === 'completed') return 'Met'
  return appointment.scheduled_at ? whenLabel(appointment.scheduled_at, timeZone) : 'Waiting to be scheduled'
}

function CandidateRow({ candidate: c, data, actions, timeZone }: { candidate: Candidate; data: CallingsData; actions: CallingsActions; timeZone: string }) {
  const appointment = appointmentFor(c.id, data.appointments)
  const open = appointment?.status === 'scheduled' ? appointment : undefined
  const showMeets = NEEDS_APPOINTMENT.includes(c.status) || !!open
  const showSustain = ACCEPTED.includes(c.status)

  return (
    // Name on its own line on phones, then status and the rest two to a row; one row from sm up.
    // Top-aligned so a helper line under one field doesn't push the others down.
    <Grid container spacing={1.5} sx={{ alignItems: 'flex-start' }}>
      <Grid
        size={{ xs: 12, sm: 3 }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          minHeight: { sm: 40 },
          ...(c.status === 'declined' && { textDecoration: 'line-through', color: 'text.secondary' }),
        }}
      >
        <Box>
          {c.person_name}
          {c.request_id && <Muted>Suggested by {nameIn(c.suggested_by, data)}</Muted>}
        </Box>
      </Grid>
      <Grid size={{ xs: 6, sm: 3 }}>
        <TextField
          select
          label="Status"
          slotProps={{ ...nativeSelect, htmlInput: { 'aria-label': `Status for ${c.person_name}` } }}
          value={SHOWN_AS[c.status]}
          onChange={(e) => {
            const status = e.target.value as Status
            if (status === 'accepted') actions.acceptCandidate(c)
            else if (status === 'approved') {
              // The leader assigned to the calling's organization meets with them, unless someone already does.
              const leader = open ? null : coveringLeader(organizationFor(c, data.needs, data.callingList), data.stewardships, data.bishopric.map((p) => p.id))
              actions.approveCandidate(c, leader)
            } else actions.updateCandidate(c.id, { status })
          }}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </TextField>
      </Grid>
      {showMeets && (
        <Grid size={{ xs: 6, sm: 3 }}>
          <TextField
            select
            label="Meets with"
            slotProps={{ ...nativeSelect, htmlInput: { 'aria-label': `Who meets with ${c.person_name}` } }}
            value={open?.interviewer_id ?? ''}
            onChange={(e) => actions.assignAppointment(c, e.target.value || null)}
            helperText={appointmentNote(appointment, timeZone) || undefined}
          >
            <option value="">—</option>
            {data.bishopric.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </TextField>
        </Grid>
      )}
      {showSustain && (
        <Grid size={{ xs: 6, sm: 3 }}>
          <TextField
            type="date"
            label="Sustain on"
            slotProps={dateLabel}
            value={c.sustain_on ?? ''}
            onChange={(e) => actions.updateCandidate(c.id, { sustain_on: e.target.value || null })}
            helperText="Moves to Sustainings that day"
          />
        </Grid>
      )}
    </Grid>
  )
}

/** A name to consider. Once a calling has a name, the box hides behind a small + button. */
function AddCandidate({ need, onAdd, collapsed }: { need: CallingNeed; onAdd: CallingsActions['addCandidate']; collapsed: boolean }) {
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)
  const label = `Name to consider for ${need.calling_title}`

  if (collapsed && !open) {
    return (
      <Button size="small" startIcon={<AddIcon />} onClick={() => setOpen(true)} sx={{ mt: 1 }}>
        Add name
      </Button>
    )
  }
  return (
    <Stack
      component="form"
      direction="row"
      spacing={1}
      sx={{ mt: 1.5 }}
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        onAdd(need.id, name.trim())
        setName('')
        setOpen(false)
      }}
    >
      <TextField
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        placeholder="Name to consider"
        autoFocus={open}
        slotProps={{ htmlInput: { 'aria-label': label } }}
      />
      <Button type="submit" variant="outlined">
        Add
      </Button>
    </Stack>
  )
}

/** Who the new person replaces. A small link until there's a name, so it can be added later. */
function ReleaseLine({ need, actions, showDate }: { need: CallingNeed; actions: CallingsActions; showDate: boolean }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')

  if (!need.release_name && !editing) {
    return (
      <Button size="small" startIcon={<AddIcon />} onClick={() => setEditing(true)} sx={{ mb: 1, color: 'text.secondary' }}>
        Releasing
      </Button>
    )
  }
  if (editing) {
    const done = () => {
      if (name.trim()) actions.updateNeed(need.id, { release_name: name.trim() })
      setEditing(false)
      setName('')
    }
    return (
      <Stack
        component="form"
        direction="row"
        spacing={1}
        sx={{ mb: 1.5 }}
        onSubmit={(e) => {
          e.preventDefault()
          done()
        }}
      >
        <TextField
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          placeholder="Releasing"
          slotProps={{ htmlInput: { 'aria-label': `Releasing from ${need.calling_title}` } }}
        />
        <Button type="submit" variant="outlined">
          Save
        </Button>
      </Stack>
    )
  }
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, mb: 1.5 }}>
      <Typography variant="body2">
        <Box component="span" sx={{ color: 'text.secondary' }}>
          Release:
        </Box>{' '}
        {need.release_name}
      </Typography>
      {showDate && (
        <TextField
          type="date"
          label="Announce on"
          slotProps={dateLabel}
          value={need.release_on ?? ''}
          onChange={(e) => actions.updateNeed(need.id, { release_on: e.target.value || null })}
          sx={{ width: 180 }}
        />
      )}
    </Stack>
  )
}

function NeedBlock({ need, data, actions, timeZone }: { need: CallingNeed; data: CallingsData; actions: CallingsActions; timeZone: string }) {
  const all = data.candidates.filter((c) => c.need_id === need.id)
  const accepted = all.some((c) => ACCEPTED.includes(c.status))

  return (
    <Box component="article" aria-label={need.calling_title}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="h3" sx={{ flex: 1 }}>
          {need.calling_title}
        </Typography>
        <Button size="small" startIcon={<CheckIcon />} onClick={() => actions.updateNeed(need.id, { status: 'filled' })}>
          Mark filled
        </Button>
        {/* Kept apart from Mark filled and behind a confirm, so it isn't hit by mistake. */}
        <IconButton
          size="small"
          aria-label={`Remove ${need.calling_title}`}
          sx={{ ml: 2, color: 'text.secondary' }}
          onClick={() => {
            if (window.confirm(`Remove ${need.calling_title}? Its names to consider and any open appointments for them are removed too.`)) actions.deleteNeed(need.id)
          }}
        >
          <DeleteOutlinedIcon fontSize="small" />
        </IconButton>
      </Stack>
      <RequestedBy need={need} data={data} />
      <ReleaseLine need={need} actions={actions} showDate={accepted} />
      {all.length > 0 && (
        <Stack divider={<Divider flexItem />} spacing={1.5}>
          {all.map((c) => (
            <CandidateRow key={c.id} candidate={c} data={data} actions={actions} timeZone={timeZone} />
          ))}
        </Stack>
      )}
      <AddCandidate need={need} onAdd={actions.addCandidate} collapsed={all.length > 0} />
    </Box>
  )
}

function AddNeed({ onAdd, callings }: { onAdd: CallingsActions['addNeed']; callings: ListedCalling[] }) {
  const [form, setForm] = useState({ calling_title: '', release_name: '' })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.calling_title.trim()) return
    onAdd({ calling_title: form.calling_title.trim(), release_name: form.release_name.trim() || null })
    setForm({ calling_title: '', release_name: '' })
  }
  return (
    <Box component="form" onSubmit={submit} aria-label="Add a calling to fill">
      <Typography variant="h3" sx={{ mb: 1 }}>
        Add a calling to fill
      </Typography>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 5 }}>
          <CallingField callings={callings} value={form.calling_title} onChange={(calling_title) => setForm({ ...form, calling_title })} />
        </Grid>
        <Grid size={{ xs: 12, sm: 5 }}>
          <TextField label="Releasing (optional)" value={form.release_name} onChange={(e) => setForm({ ...form, release_name: e.target.value })} />
        </Grid>
        <Grid size={{ xs: 12, sm: 2 }}>
          <Button type="submit" variant="contained" fullWidth>
            Add
          </Button>
        </Grid>
      </Grid>
    </Box>
  )
}

/**
 * Everything the bishopric does with callings, worked through during the bishopric meeting. A
 * calling leaves this list on the Sunday its accepted name is sustained.
 */
export function CallingsManager({ date, data, actions, timeZone }: { date: IsoDate; data: CallingsData; actions: CallingsActions; timeZone: string }) {
  const suggestions = unsortedSuggestions(data.candidates)
  const openNeeds = needsToDiscuss(date, data.needs, data.candidates)
  const newRequests = unreceived(data.callingRequests)

  return (
    <Stack divider={<Divider flexItem />} spacing={2}>
      {newRequests.length > 0 && (
        <Box>
          <Typography variant="h3" sx={{ mb: 0.5 }}>
            New requests from leaders
          </Typography>
          <Muted>Mark each one received so the leader knows the bishopric has it. The callings are already on the list below.</Muted>
          <Stack divider={<Divider flexItem />}>
            {newRequests.map((r) => (
              <CallingRequestRow key={r.id} request={r} people={data.profiles} candidates={data.candidates} onReceive={actions.receiveCallingRequest} busy={false} showAgendaLink={false} />
            ))}
          </Stack>
        </Box>
      )}
      {suggestions.length > 0 && (
        <Box>
          <Typography variant="h3" sx={{ mb: 0.5 }}>
            New suggestions
          </Typography>
          <List disablePadding>
            {suggestions.map((s) => (
              <ListItem key={s.id} disableGutters sx={{ gap: 1, flexWrap: 'wrap' }}>
                <Box sx={{ flex: '1 1 12rem' }}>
                  <strong>{s.person_name}</strong> for {s.calling_title}
                  {s.suggested_by && (
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      {' '}
                      (from {nameIn(s.suggested_by, data)})
                    </Box>
                  )}
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
                  onChange={(e) => e.target.value && actions.updateCandidate(s.id, { need_id: e.target.value, status: 'discussing' })}
                  sx={{ width: 200 }}
                >
                  <option value="">Attach to…</option>
                  {openNeeds.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.calling_title}
                    </option>
                  ))}
                </TextField>
                <Button size="small" onClick={() => actions.updateCandidate(s.id, { status: 'declined' })}>
                  Dismiss
                </Button>
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {openNeeds.length === 0 && <Muted>No callings to fill.</Muted>}
      {openNeeds.map((need) => (
        <NeedBlock key={need.id} need={need} data={data} actions={actions} timeZone={timeZone} />
      ))}

      <AddNeed onAdd={actions.addNeed} callings={data.callingList} />
    </Stack>
  )
}
