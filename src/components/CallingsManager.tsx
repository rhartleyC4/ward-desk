import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip, { type ChipProps } from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent, type ReactNode } from 'react'
import { awaitingSettingApart, needsToDiscuss, unsortedSuggestions } from '../lib/agenda'
import { coveringLeader, organizationFor, type ListedCalling } from '../lib/callings'
import { appointmentFor, NEEDS_APPOINTMENT, whenLabel } from '../lib/appointments'
import { longDate, type IsoDate } from '../lib/dates'
import { FORMER_MEMBER, unreceived, type CallingRequest } from '../lib/requests'
import type { Enums, TablesUpdate } from '../lib/database.types'
import type { Appointment, CallingNeed, Candidate, Profile } from '../lib/queries'
import { nativeSelect } from '../theme'
import { CallingField } from './CallingField'
import { Muted } from './Layout'
import { CallingRequestRow } from './Requests'

type Status = Enums<'candidate_status'>

// A name goes Considering -> Approved -> Accepted, is sustained on its sustain date, then set apart,
// which completes the calling (the database enforces the order). Each name shows one button for its
// next step; the rarer moves (declined, or a step back for a mis-tap) sit in its ⋯ menu. A declined
// name is final. Sustained names wait under "Waiting to be set apart".
const LABELS: Partial<Record<Status, string>> = { suggested: 'Considering', discussing: 'Considering', approved: 'Approved', accepted: 'Accepted', declined: 'Declined' }

const ACCEPTED: Status[] = ['accepted', 'set_apart']
const UNAPPROVED: Status[] = ['suggested', 'discussing']
/** Only one name per calling can be at one of these steps at a time. */
const IN_FLIGHT: Status[] = ['approved', 'accepted', 'set_apart']

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
  /** Marks a sustained name set apart today, which completes the calling. */
  setApart: (candidate: Candidate) => void
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

/** A group inside the callings card, set apart from the calling titles under it. */
function GroupHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
      <Typography component="h3" variant="subtitle2" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.75rem' }}>
        {children}
      </Typography>
      {action}
    </Stack>
  )
}

/** A small text button for adding something to a calling, the same everywhere. */
function AddLink({ children, onClick, label }: { children: ReactNode; onClick: () => void; label?: string }) {
  return (
    <Button size="small" startIcon={<AddIcon />} onClick={onClick} aria-label={label} sx={{ alignSelf: 'flex-start' }}>
      {children}
    </Button>
  )
}

/** A ⋯ button holding the actions that are rarely needed, so they don't crowd the row. */
function MoreMenu({ label, items }: { label: string; items: { label: string; onClick: () => void }[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <IconButton size="small" aria-label={label} aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget)} sx={{ color: 'text.secondary' }}>
        <MoreHorizIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {items.map((item) => (
          <MenuItem
            key={item.label}
            onClick={() => {
              setAnchor(null)
              item.onClick()
            }}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

/** Where a calling stands, for the chip beside its title. */
function stageOf(need: CallingNeed, names: Candidate[]): { label: string; color: ChipProps['color'] } {
  if (need.release_only) return { label: 'Release only', color: 'default' }
  if (names.some((c) => ACCEPTED.includes(c.status))) return { label: 'To sustain', color: 'success' }
  if (names.some((c) => c.status === 'approved')) return { label: 'Interview', color: 'info' }
  if (names.some((c) => UNAPPROVED.includes(c.status))) return { label: 'To approve', color: 'warning' }
  return { label: 'Needs a name', color: 'default' }
}

/** "Asked for by Sister Reyes (Primary) · needed by December 1st · Sunbeams need one" */
function RequestedBy({ need, data }: { need: CallingNeed; data: CallingsData }) {
  const r = data.callingRequests.find((x) => x.need_id === need.id)
  if (!r) return null
  const parts = [
    `Asked for by ${r.requested_by === null ? FORMER_MEMBER : nameIn(r.requested_by, data)}${r.organization ? ` (${r.organization})` : ''}`,
    r.kind === 'release' && 'release only, no one new',
    r.needed_by && `needed by ${longDate(r.needed_by)}`,
    r.received_at ? `received by ${nameIn(r.received_by, data)}` : 'not marked received yet',
  ].filter(Boolean)
  return (
    <Box>
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
  const taken = data.candidates.some((o) => o.id !== c.id && o.need_id === c.need_id && IN_FLIGHT.includes(o.status))
  const declined = c.status === 'declined'
  // The leader assigned to the calling's organization meets with them, unless someone already does.
  const approve = () => {
    const leader = open ? null : coveringLeader(organizationFor(c, data.needs, data.callingList), data.stewardships, data.bishopric.map((p) => p.id))
    actions.approveCandidate(c, leader)
  }

  const status = [LABELS[c.status] ?? c.status, c.request_id && `suggested by ${nameIn(c.suggested_by, data)}`].filter(Boolean).join(' · ')
  // Rare moves: a declined answer, or one step back for a mis-tap. Taking back an accept lets the
  // database clear the dates it set, without handing out a new appointment.
  const more =
    c.status === 'approved'
      ? [
          { label: 'Declined', onClick: () => actions.updateCandidate(c.id, { status: 'declined' }) },
          { label: 'Back to considering', onClick: () => actions.updateCandidate(c.id, { status: 'discussing' }) },
        ]
      : c.status === 'accepted'
        ? [{ label: 'Undo accepted', onClick: () => actions.updateCandidate(c.id, { status: 'approved' }) }]
        : []

  return (
    <Box component="li" aria-label={c.person_name} sx={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 1.5, rowGap: 1, py: 1.25 }}>
      <Box sx={{ flex: '1 1 10rem', minWidth: 0, minHeight: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Typography sx={declined ? { textDecoration: 'line-through', color: 'text.secondary' } : { fontWeight: 500 }}>{c.person_name}</Typography>
        <Muted>{status}</Muted>
      </Box>
      {/* On phones the controls take their own line under the name, and Meets with its own line above the button. */}
      <Stack direction="row" useFlexGap spacing={1} sx={{ alignItems: 'flex-start', flexWrap: 'wrap', width: { xs: '100%', sm: 'auto' }, ml: { sm: 'auto' } }}>
        {showMeets && (
          <TextField
            select
            label="Meets with"
            slotProps={{ ...nativeSelect, htmlInput: { 'aria-label': `Who meets with ${c.person_name}` } }}
            value={open?.interviewer_id ?? ''}
            onChange={(e) => actions.assignAppointment(c, e.target.value || null)}
            helperText={appointmentNote(appointment, timeZone) || undefined}
            sx={{ width: { xs: '100%', sm: 170 } }}
          >
            <option value="">—</option>
            {data.bishopric.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </TextField>
        )}
        {/* A name can't be accepted or declined until the bishopric approves it. */}
        {UNAPPROVED.includes(c.status) && (
          <Box>
            <Button variant="outlined" startIcon={<CheckIcon />} onClick={approve} disabled={taken} aria-label={`Approve ${c.person_name}`} sx={{ minHeight: 40 }}>
              Approve
            </Button>
            {taken && <Muted>Another name is approved</Muted>}
          </Box>
        )}
        {c.status === 'approved' && (
          <Button variant="outlined" startIcon={<CheckIcon />} onClick={() => actions.acceptCandidate(c)} aria-label={`Mark ${c.person_name} accepted`} sx={{ minHeight: 40 }}>
            Mark accepted
          </Button>
        )}
        {more.length > 0 && (
          <Box sx={{ minHeight: 40, display: 'flex', alignItems: 'center' }}>
            <MoreMenu label={`More for ${c.person_name}`} items={more} />
          </Box>
        )}
      </Stack>
    </Box>
  )
}

/** A one-line form behind an add link, used for names and for who's being released. */
function InlineAdd({ link, placeholder, label, submitLabel, onSave }: { link: string; placeholder: string; label: string; submitLabel: string; onSave: (text: string) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const close = () => {
    setOpen(false)
    setText('')
  }

  if (!open) return <AddLink onClick={() => setOpen(true)}>{link}</AddLink>
  return (
    <Stack
      component="form"
      direction="row"
      spacing={1}
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim()) return
        onSave(text.trim())
        close()
      }}
    >
      <TextField
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        placeholder={placeholder}
        slotProps={{ htmlInput: { 'aria-label': label } }}
      />
      <Button type="submit" variant="outlined">
        {submitLabel}
      </Button>
      <Button onClick={close}>Cancel</Button>
    </Stack>
  )
}

/** The dates that put the calling in sacrament meeting, together at the foot of the card. */
function Dates({ need, accepted, actions }: { need: CallingNeed; accepted: Candidate | undefined; actions: CallingsActions }) {
  if (!accepted && !(need.release_only && need.release_name)) return null
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ pt: 1.5 }}>
      {accepted && (
        <TextField
          type="date"
          label={`Sustain ${accepted.person_name} on`}
          slotProps={dateLabel}
          value={accepted.sustain_on ?? ''}
          onChange={(e) => actions.updateCandidate(accepted.id, { sustain_on: e.target.value || null })}
          helperText="Moves to Sustainings that day"
          sx={{ width: { sm: 240 } }}
        />
      )}
      {need.release_name && (
        <TextField
          type="date"
          label={`Release ${need.release_name} on`}
          slotProps={dateLabel}
          value={need.release_on ?? ''}
          onChange={(e) => actions.updateNeed(need.id, { release_on: e.target.value || null })}
          helperText="Moves to Releases that day"
          sx={{ width: { sm: 240 } }}
        />
      )}
    </Stack>
  )
}

function NeedCard({ need, data, actions, timeZone }: { need: CallingNeed; data: CallingsData; actions: CallingsActions; timeZone: string }) {
  const names = data.candidates.filter((c) => c.need_id === need.id)
  const accepted = names.find((c) => ACCEPTED.includes(c.status))
  const stage = stageOf(need, names)

  return (
    <Box component="article" aria-label={need.calling_title} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, px: 2, py: 1.5 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography component="h4" variant="h3" sx={{ flex: 1, minWidth: 0 }}>
          {need.calling_title}
        </Typography>
        <Chip size="small" label={stage.label} color={stage.color} variant="outlined" />
        <MoreMenu
          label={`More for ${need.calling_title}`}
          items={[
            // A calling is done once its name is set apart; this is for when it isn't needed after all.
            {
              label: 'No longer needed',
              onClick: () => {
                if (window.confirm(`${need.calling_title} is no longer needed? It leaves the list.`)) actions.updateNeed(need.id, { status: 'cancelled' })
              },
            },
            // Removing is for a calling added by mistake.
            {
              label: 'Remove calling',
              onClick: () => {
                if (window.confirm(`Remove ${need.calling_title}? Its names to consider and any open appointments for them are removed too.`)) actions.deleteNeed(need.id)
              },
            },
          ]}
        />
      </Stack>
      <Stack spacing={0.5} sx={{ mt: 0.25 }}>
        {need.release_name ? (
          <Muted>Releasing {need.release_name}</Muted>
        ) : (
          <InlineAdd
            link="Add who's being released"
            placeholder="Who's being released"
            label={`Releasing from ${need.calling_title}`}
            submitLabel="Save"
            onSave={(release_name) => actions.updateNeed(need.id, { release_name })}
          />
        )}
        <RequestedBy need={need} data={data} />
      </Stack>
      {names.length > 0 && (
        <Box component="ul" aria-label={`Names for ${need.calling_title}`} sx={{ m: 0, mt: 1, p: 0, borderTop: 1, borderColor: 'divider', '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
          {names.map((c) => (
            <CandidateRow key={c.id} candidate={c} data={data} actions={actions} timeZone={timeZone} />
          ))}
        </Box>
      )}
      <Dates need={need} accepted={accepted} actions={actions} />
      {!need.release_only && (
        <Box sx={{ mt: 1 }}>
          <InlineAdd
            link="Add a name"
            placeholder="Name to consider"
            label={`Name to consider for ${need.calling_title}`}
            submitLabel="Add"
            onSave={(name) => actions.addCandidate(need.id, name)}
          />
        </Box>
      )}
    </Box>
  )
}

function AddNeed({ onAdd, onClose, callings }: { onAdd: CallingsActions['addNeed']; onClose: () => void; callings: ListedCalling[] }) {
  const [form, setForm] = useState({ calling_title: '', release_name: '' })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.calling_title.trim()) return
    onAdd({ calling_title: form.calling_title.trim(), release_name: form.release_name.trim() || null })
    onClose()
  }
  return (
    <Stack component="form" onSubmit={submit} aria-label="Add a calling to fill" spacing={1.5} sx={{ border: 1, borderColor: 'primary.main', borderRadius: 2, p: 2 }}>
      <CallingField callings={callings} value={form.calling_title} onChange={(calling_title) => setForm({ ...form, calling_title })} />
      <TextField label="Releasing (optional)" value={form.release_name} onChange={(e) => setForm({ ...form, release_name: e.target.value })} />
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained">
          Add calling
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </Stack>
    </Stack>
  )
}

/**
 * Everything the bishopric does with callings, worked through during the bishopric meeting. A
 * calling moves to "Waiting to be set apart" on the Sunday its accepted name is sustained, and is
 * done once they're set apart.
 */
export function CallingsManager({ date, data, actions, timeZone }: { date: IsoDate; data: CallingsData; actions: CallingsActions; timeZone: string }) {
  const [adding, setAdding] = useState(false)
  const suggestions = unsortedSuggestions(data.candidates)
  const openNeeds = needsToDiscuss(date, data.needs, data.candidates)
  const newRequests = unreceived(data.callingRequests)
  const waiting = awaitingSettingApart(date, data.needs, data.candidates)

  return (
    <Stack spacing={3}>
      {newRequests.length > 0 && (
        <Box component="section" aria-label="New requests from leaders">
          <GroupHeading>New requests from leaders</GroupHeading>
          <Muted>Mark each one received so the leader knows the bishopric has it. The callings are already on the list below.</Muted>
          <Stack divider={<Divider flexItem />}>
            {newRequests.map((r) => (
              <CallingRequestRow key={r.id} request={r} people={data.profiles} timeZone={timeZone} candidates={data.candidates} onReceive={actions.receiveCallingRequest} busy={false} showAgendaLink={false} />
            ))}
          </Stack>
        </Box>
      )}
      {suggestions.length > 0 && (
        <Box component="section" aria-label="New suggestions">
          <GroupHeading>New suggestions</GroupHeading>
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

      {waiting.length > 0 && (
        <Box component="section" aria-label="Waiting to be set apart">
          <GroupHeading>Waiting to be set apart</GroupHeading>
          <List disablePadding>
            {waiting.map(({ candidate: c, calling }) => (
              <ListItem key={c.id} disableGutters sx={{ gap: 1, flexWrap: 'wrap' }}>
                <Box sx={{ flex: '1 1 12rem' }}>
                  <strong>{c.person_name}</strong>, {calling}
                  <Muted>Sustained {longDate(c.sustain_on!)}</Muted>
                </Box>
                <Button variant="outlined" startIcon={<CheckIcon />} onClick={() => actions.setApart(c)} aria-label={`${c.person_name} was set apart`}>
                  Set apart
                </Button>
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      <Box component="section" aria-label="Callings to fill">
        <GroupHeading
          action={
            !adding && (
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
                Add a calling
              </Button>
            )
          }
        >
          Callings to fill
        </GroupHeading>
        <Stack spacing={1.5}>
          {adding && <AddNeed onAdd={actions.addNeed} onClose={() => setAdding(false)} callings={data.callingList} />}
          {openNeeds.length === 0 && !adding && <Muted>No callings to fill.</Muted>}
          {openNeeds.map((need) => (
            <NeedCard key={need.id} need={need} data={data} actions={actions} timeZone={timeZone} />
          ))}
        </Stack>
      </Box>
    </Stack>
  )
}
