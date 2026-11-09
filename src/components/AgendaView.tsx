import AssignmentIndOutlinedIcon from '@mui/icons-material/AssignmentIndOutlined'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import EditIcon from '@mui/icons-material/Edit'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import CardContent from '@mui/material/CardContent'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import {
  callingsNeeded,
  openItems,
  personLabel,
  releasesOn,
  sacramentLine,
  sustainingsOn,
  unsortedSuggestions,
  upcomingMeetings,
} from '../lib/agenda'
import { ANSWER_COLORS, ANSWER_LABELS, assignmentChanges, byPart, MEETING_PARTS, PART_LABELS, type AssignmentChange, type MeetingPart } from '../lib/assignments'
import { longDate, type IsoDate } from '../lib/dates'
import type { AgendaData, AgendaSection, AgendaTemplate } from '../lib/queries'
import { FORMER_MEMBER, followUps, isOpen, requestStatusLine, type Request } from '../lib/requests'
import { awayOn, eventsOn, formatTime, rotationDayLabel, rotationsDue } from '../lib/schedule'
import { ConfirmAssignments, type RecordAnswer } from './ConfirmAssignments'
import { RecipientSelect } from './Requests'
import { CallingsManager, type CallingsActions } from './CallingsManager'
import { Muted, SectionCard, Side, Split } from './Layout'

export type AgendaActions = CallingsActions & {
  /** Gives the prayers and spiritual thought to people, who are asked to accept or decline. */
  saveAssignments: (changes: AssignmentChange[]) => Promise<boolean>
  /** Records someone's answer for them, after asking by text or email. */
  recordAnswer: RecordAnswer
  addItem: (section: AgendaSection, body: string, eventDate: IsoDate | null) => void
  resolveItem: (id: string) => void
  addPrayerName: (name: string) => void
  removePrayerName: (id: string) => void
  /** Turns an item into a request for someone, linked back to the item. */
  assignItem: (item: { id: string; body: string }, toId: string, dueOn: IsoDate | null) => Promise<boolean>
}

/** A person's full name, for sentences like "Bishop Avery asked Brother Lane". */
const fullName = (id: string | null, data: AgendaData) =>
  id === null ? FORMER_MEMBER : data.profiles.find((p) => p.id === id)?.display_name || personLabel(id, data.profiles) || 'someone'

/** Who an item was handed to, and where that stands. */
function assignmentLine(itemId: string, data: AgendaData, today: IsoDate): string | null {
  const r = data.requests.filter((x) => x.agenda_item_id === itemId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  if (!r) return null
  return `Asked ${fullName(r.to_id, data)} · ${requestStatusLine(r, today)}${r.reply ? ` · “${r.reply}”` : ''}`
}

function AssignForm({ item, data, actions, onClose }: { item: { id: string; body: string }; data: AgendaData; actions: AgendaActions; onClose: () => void }) {
  const [to, setTo] = useState('')
  const [due, setDue] = useState('')
  return (
    <Stack
      component="form"
      spacing={1}
      aria-label={`Ask someone to do ${item.body}`}
      sx={{ mt: 1, mb: 1.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}
      onSubmit={(e) => {
        e.preventDefault()
        if (to) void actions.assignItem(item, to, due || null).then((ok) => ok && onClose())
      }}
    >
      <Typography variant="body2">Ask someone to take care of “{item.body}”. They'll see it on their Requests page and can say when it's done.</Typography>
      <RecipientSelect recipients={data.recipients} value={to} onChange={setTo} label="Who?" />
      <TextField type="date" label="By when (optional)" slotProps={{ inputLabel: { shrink: true } }} value={due} onChange={(e) => setDue(e.target.value)} sx={{ maxWidth: 220 }} />
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" disabled={!to}>
          Send request
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </Stack>
    </Stack>
  )
}

function AddLine({ label, name = label, onAdd, withDate }: { label: string; name?: string; onAdd: (text: string, date: IsoDate | null) => void; withDate?: boolean }) {
  const [text, setText] = useState('')
  const [date, setDate] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    onAdd(text.trim(), date || null)
    setText('')
    setDate('')
  }
  return (
    <Stack component="form" onSubmit={submit} direction="row" spacing={1} sx={{ mt: 1.5 }}>
      {withDate && (
        <TextField type="date" value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ htmlInput: { 'aria-label': 'Date' } }} sx={{ width: 170, flexShrink: 0 }} />
      )}
      <TextField value={text} onChange={(e) => setText(e.target.value)} placeholder={label} slotProps={{ htmlInput: { 'aria-label': name } }} />
      <Button type="submit" variant="outlined">
        Add
      </Button>
    </Stack>
  )
}

function ItemList({ date, data, section, actions, timeZone }: { date: IsoDate; data: AgendaData; section: AgendaSection; actions: AgendaActions; timeZone: string }) {
  const [assigning, setAssigning] = useState<string | null>(null)
  const items = openItems(date, data.agendaItems, section, timeZone)
  const dated = section.kind === 'calendar'
  // Only the bishopric gets a list of people to ask.
  const canAssign = data.recipients.length > 0
  return (
    <>
      {items.length ? (
        <List dense disablePadding>
          {items.map((i) => (
            <Box component="li" key={i.id} sx={{ listStyle: 'none' }}>
              <ListItem
                component="div"
                disableGutters
                secondaryAction={
                  !i.resolved_on && (
                    <Stack direction="row" spacing={0.5}>
                      {canAssign && (
                        <IconButton size="small" aria-label={`Ask someone to do ${i.body}`} onClick={() => setAssigning(assigning === i.id ? null : i.id)}>
                          <AssignmentIndOutlinedIcon fontSize="small" />
                        </IconButton>
                      )}
                      <Button size="small" startIcon={<CheckIcon />} onClick={() => actions.resolveItem(i.id)}>
                        Done
                      </Button>
                    </Stack>
                  )
                }
              >
                <ListItemText
                  primary={
                    <>
                      {i.event_date && <strong>{longDate(i.event_date)}: </strong>}
                      {i.body}
                    </>
                  }
                  secondary={assignmentLine(i.id, data, date)}
                  sx={i.resolved_on ? { textDecoration: 'line-through', color: 'text.secondary' } : { pr: canAssign ? 14 : 9 }}
                />
              </ListItem>
              {assigning === i.id && <AssignForm item={i} data={data} actions={actions} onClose={() => setAssigning(null)} />}
            </Box>
          ))}
        </List>
      ) : (
        <Muted>Nothing open.</Muted>
      )}
      <AddLine label={dated ? 'New calendar item' : 'New item'} name={`New item for ${section.title}`} withDate={dated} onAdd={(text, d) => actions.addItem(section, text, d)} />
    </>
  )
}

/** "Opening prayer: Sister Young [Accepted]", or the name typed in before people were picked from a list. */
function AssignmentLine({ part, data }: { part: MeetingPart; data: AgendaData }) {
  const a = byPart(data.assignments)[part]
  const typed = data.agenda?.[part]
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1, rowGap: 0.5 }}>
      <Typography variant="body2" component="span">
        <Box component="span" sx={{ color: 'text.secondary' }}>
          {PART_LABELS[part]}:
        </Box>{' '}
        <Box component="span" sx={a?.status === 'declined' ? { textDecoration: 'line-through', color: 'text.secondary' } : undefined}>
          {a ? fullName(a.assignee_id, data) : typed || '—'}
        </Box>
      </Typography>
      {a && <Chip size="small" variant="outlined" color={ANSWER_COLORS[a.status]} label={ANSWER_LABELS[a.status]} />}
      {a?.reply && (
        <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>
          “{a.reply}”
        </Typography>
      )}
      {a?.answered_by && a.answered_by !== a.assignee_id && a.status !== 'asked' && (
        <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>
          recorded by {fullName(a.answered_by, data)}
        </Typography>
      )}
    </Box>
  )
}

function Header({ template, date, data, actions, me }: { template: AgendaTemplate; date: IsoDate; data: AgendaData; actions: AgendaActions; me: { id: string; name: string } }) {
  const [editing, setEditing] = useState(false)
  const current = byPart(data.assignments)
  const startForm = () => Object.fromEntries(MEETING_PARTS.map((p) => [p, current[p]?.assignee_id ?? ''])) as Record<MeetingPart, string>
  const [form, setForm] = useState(startForm)
  const events = eventsOn(date, data.events)
  // The closing prayer shows in its own section when the meeting has one.
  const shown = MEETING_PARTS.filter((p) => p !== 'closing_prayer' || !template.sections.some((s) => s.kind === 'closing_prayer'))
  const changes = assignmentChanges(data.assignments, form)

  return (
    <Card component="section" sx={{ mb: 1.5 }}>
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Typography variant="h1">{template.name} Agenda</Typography>
        <Typography sx={{ mt: 0.5 }}>
          <strong>{longDate(date)}</strong>
          {events.length > 0 && (
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {' '}
              · {events.map((e) => `${formatTime(e.start_time)} ${e.title}`.trim()).join(', ')}
            </Box>
          )}
        </Typography>
        {editing ? (
          <Stack
            component="form"
            aria-label="Assignments"
            spacing={1.5}
            sx={{ mt: 2 }}
            onSubmit={(e) => {
              e.preventDefault()
              void actions.saveAssignments(changes).then((ok) => ok && setEditing(false))
            }}
          >
            {MEETING_PARTS.map((part) => {
              const typed = !current[part] && data.agenda?.[part]
              return (
                <RecipientSelect
                  key={part}
                  label={PART_LABELS[part]}
                  noneLabel="No one yet"
                  recipients={data.assignees}
                  value={form[part]}
                  onChange={(id) => setForm({ ...form, [part]: id })}
                  helperText={typed ? `Typed in before: ${typed}` : undefined}
                />
              )
            })}
            <Muted>Each person gets a notification asking them to accept or decline.</Muted>
            <Stack direction="row" spacing={1}>
              <Button type="submit" variant="contained" disabled={!changes.length}>
                Save
              </Button>
              <Button onClick={() => setEditing(false)}>Cancel</Button>
            </Stack>
          </Stack>
        ) : (
          <>
            <Stack spacing={0.75} sx={{ mt: 1.5 }}>
              {shown.map((part) => (
                <AssignmentLine key={part} part={part} data={data} />
              ))}
            </Stack>
            <Button
              size="small"
              startIcon={<EditIcon />}
              onClick={() => {
                setForm(startForm())
                setEditing(true)
              }}
              sx={{ mt: 1 }}
            >
              Edit assignments
            </Button>
            <ConfirmAssignments assignments={data.assignments} people={data.profiles} meeting={template.name} date={date} startTime={template.start_time} me={me} onRecord={actions.recordAnswer} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function NameList({ items }: { items: string[] }) {
  return items.length ? (
    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </Box>
  ) : (
    <Muted>None.</Muted>
  )
}

/** Releases or sustainings for the bishopric, each with its date so it can move to another Sunday. */
function MovableNames({ date, items, onMove }: { date: IsoDate; items: { id: string; label: string }[]; onMove: (id: string, on: IsoDate) => void }) {
  if (!items.length) return <Muted>None.</Muted>
  return (
    <Stack spacing={1.5}>
      {items.map((item) => (
        <Stack key={item.id} direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography>{item.label}</Typography>
          <TextField
            type="date"
            value={date}
            // Ignore a cleared field; a half-typed date would otherwise drop the name from the list.
            onChange={(e) => e.target.value && onMove(item.id, e.target.value)}
            slotProps={{ htmlInput: { 'aria-label': `Date for ${item.label}` } }}
            sx={{ width: 170, flexShrink: 0 }}
          />
        </Stack>
      ))}
    </Stack>
  )
}

/** One section of an agenda, filled from live data according to its kind. */
function Section({
  section,
  date,
  data,
  actions,
  timeZone,
  canEditCallings,
  callingsHidden,
}: {
  section: AgendaSection
  date: IsoDate
  data: AgendaData
  actions: AgendaActions
  timeZone: string
  canEditCallings: boolean
  callingsHidden: boolean
}) {
  const who = (id: string | null) => personLabel(id, data.profiles) || 'Unassigned'
  const rotations = rotationsDue(date, data.rotations)
  const rotationLine = (r: (typeof rotations)[number]) => {
    const title = rotationDayLabel(r) ? `${r.title} (${rotationDayLabel(r)})` : r.title
    const person = r.assignee_id ? who(r.assignee_id) : r.assignee_label
    return person ? `${title} — ${person}` : title
  }

  switch (section.kind) {
    case 'items':
    case 'calendar':
      return (
        <SectionCard title={section.title}>
          <ItemList date={date} data={data} section={section} actions={actions} timeZone={timeZone} />
        </SectionCard>
      )

    case 'follow_ups':
      return (
        <SectionCard title={section.title}>
          <FollowUps date={date} data={data} timeZone={timeZone} />
        </SectionCard>
      )

    case 'interviews':
      // Retired: interviews live on the Appointments page, and the database refuses new ones.
      return null

    case 'assignments':
      return (
        <SectionCard title={section.title}>
          {rotations.length ? <NameList items={rotations.map(rotationLine)} /> : <Muted>Nothing due this month.</Muted>}
        </SectionCard>
      )

    case 'sacrament':
      return (
        <SectionCard title={section.title}>
          <NameList items={upcomingMeetings(date, data.meetings).map((m) => sacramentLine(m, data.items, data.profiles))} />
        </SectionCard>
      )

    case 'callings': {
      if (callingsHidden) {
        return (
          <SectionCard title={section.title}>
            <Muted>Callings are private while you help as a mentor. The bishop can let you see them from his Account page.</Muted>
          </SectionCard>
        )
      }
      if (canEditCallings) {
        return (
          <SectionCard title={section.title}>
            <CallingsManager date={date} data={data} actions={actions} timeZone={timeZone} />
          </SectionCard>
        )
      }
      // Attendees outside the bishopric get nothing back from RLS; this read-only table is for them.
      const needs = callingsNeeded(date, data.needs, data.candidates)
      const suggestions = unsortedSuggestions(data.candidates)
      return (
        <SectionCard title={section.title}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Calling</TableCell>
                  <TableCell>Release</TableCell>
                  <TableCell>Names to consider</TableCell>
                  <TableCell>Appr?</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {needs.map(({ need, candidates, approved }) => (
                  <TableRow key={need.id}>
                    <TableCell>{need.calling_title}</TableCell>
                    <TableCell>{need.release_name ?? ''}</TableCell>
                    <TableCell>{candidates.map((c) => c.person_name).join(', ')}</TableCell>
                    <TableCell>{approved ? 'Y' : ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {suggestions.length > 0 && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              <Box component="span" sx={{ color: 'text.secondary' }}>
                New suggestions:
              </Box>{' '}
              {suggestions.map((s) => `${s.person_name} for ${s.calling_title}`).join('; ')}
            </Typography>
          )}
        </SectionCard>
      )
    }

    case 'releases': {
      const releases = releasesOn(date, data.needs).map((r) => ({ id: r.id, label: `${r.release_name}, ${r.calling_title}` }))
      return (
        <SectionCard title={`${section.title} (${longDate(date)})`}>
          {canEditCallings ? (
            <MovableNames date={date} items={releases} onMove={(id, on) => actions.updateNeed(id, { release_on: on })} />
          ) : (
            <NameList items={releases.map((r) => r.label)} />
          )}
        </SectionCard>
      )
    }

    case 'sustainings': {
      const sustainings = sustainingsOn(date, data.needs, data.candidates).map((s) => ({ id: s.id, label: `${s.name}, ${s.calling}` }))
      return (
        <SectionCard title={`${section.title} (${longDate(date)})`}>
          {canEditCallings ? (
            <MovableNames date={date} items={sustainings} onMove={(id, on) => actions.updateCandidate(id, { sustain_on: on })} />
          ) : (
            <NameList items={sustainings.map((s) => s.label)} />
          )}
        </SectionCard>
      )
    }

    case 'closing_prayer':
      return (
        <Card sx={{ mb: 1.5 }}>
          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <AssignmentLine part="closing_prayer" data={data} />
          </CardContent>
        </Card>
      )

    case 'prayer_roll':
      return (
        <SectionCard title={section.title}>
          <PrayerRoll data={data} actions={actions} />
        </SectionCard>
      )
  }
}

/** Open requests, and ones finished in the week before, so the meeting can follow up on each. */
function FollowUps({ date, data, timeZone }: { date: IsoDate; data: AgendaData; timeZone: string }) {
  const rows = followUps(date, data.requests, timeZone)
  if (!rows.length) return <Muted>Nothing to follow up on.</Muted>
  const line = (r: Request) => [`${fullName(r.from_id, data)} asked ${fullName(r.to_id, data)}`, requestStatusLine(r, date), r.reply && `“${r.reply}”`].filter(Boolean).join(' · ')
  return (
    <List dense disablePadding>
      {rows.map((r) => (
        <ListItem key={r.id} disableGutters>
          <ListItemText primary={r.title} secondary={line(r)} sx={isOpen(r) ? undefined : { '& .MuiListItemText-primary': { textDecoration: 'line-through', color: 'text.secondary' } }} />
        </ListItem>
      ))}
    </List>
  )
}

function PrayerRoll({ data, actions }: { data: AgendaData; actions: AgendaActions }) {
  const [newPrayer, setNewPrayer] = useState('')
  return (
    <>
      <List dense disablePadding>
        {data.prayerRoll.map((p) => (
          <ListItem
            key={p.id}
            disableGutters
            secondaryAction={
              <IconButton edge="end" size="small" aria-label="Remove" onClick={() => actions.removePrayerName(p.id)}>
                <CloseIcon fontSize="small" />
              </IconButton>
            }
          >
            <ListItemText primary={p.name} />
          </ListItem>
        ))}
      </List>
      <Stack
        component="form"
        direction="row"
        spacing={1}
        sx={{ mt: 1.5 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (!newPrayer.trim()) return
          actions.addPrayerName(newPrayer.trim())
          setNewPrayer('')
        }}
      >
        <TextField value={newPrayer} onChange={(e) => setNewPrayer(e.target.value)} placeholder="Name" slotProps={{ htmlInput: { 'aria-label': 'Prayer roll name' } }} />
        <Button type="submit" variant="outlined">
          Add
        </Button>
      </Stack>
    </>
  )
}

/** A meeting's agenda, laid out by its template and assembled from live data instead of a copied sheet tab. */
/** Lists the meeting glances at rather than works through; on a desktop they sit in the side column. */
const SIDE_SECTIONS: AgendaSection['kind'][] = ['releases', 'sustainings', 'prayer_roll', 'sacrament', 'calendar', 'assignments']

export function AgendaView({
  template,
  date,
  data,
  actions,
  timeZone,
  canEditCallings = false,
  callingsHidden = false,
  me = { id: '', name: '' },
}: {
  template: AgendaTemplate
  date: IsoDate
  data: AgendaData
  actions: AgendaActions
  timeZone: string
  /** Bishopric members work callings right on the agenda; anyone else sees the table. */
  canEditCallings?: boolean
  /** A mentor the new bishop hasn't let see callings. */
  callingsHidden?: boolean
  /** Who is looking, to sign messages and skip their own assignments. */
  me?: { id: string; name: string }
}) {
  const away = awayOn(date, data.absences)

  return (
    <>
      <Header key={`${template.id}-${data.agenda?.id ?? date}`} template={template} date={date} data={data} actions={actions} me={me} />

      {away.length > 0 && (
        <Alert severity="warning" role="status" sx={{ mb: 1.5 }}>
          Away today: {away.map((a) => `${personLabel(a.user_id, data.profiles) || 'Unassigned'}${a.location ? ` (${a.location})` : ''}`).join(', ')}
        </Alert>
      )}

      <Split>
        {template.sections.map((section) => {
          const card = <Section key={section.id} section={section} date={date} data={data} actions={actions} timeZone={timeZone} canEditCallings={canEditCallings} callingsHidden={callingsHidden} />
          return SIDE_SECTIONS.includes(section.kind) ? <Side key={section.id}>{card}</Side> : card
        })}
      </Split>
    </>
  )
}
