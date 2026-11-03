import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import EditIcon from '@mui/icons-material/Edit'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
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
import { longDate, type IsoDate } from '../lib/dates'
import type { AgendaData, AgendaSection, AgendaTemplate } from '../lib/queries'
import { awayOn, eventsOn, formatTime, rotationsDue } from '../lib/schedule'
import { CallingsManager, type CallingsActions } from './CallingsManager'
import { Muted, SectionCard } from './Layout'

export type AgendaActions = CallingsActions & {
  saveHeader: (fields: { opening_prayer: string | null; spiritual_thought: string | null; closing_prayer: string | null }) => void
  addItem: (section: AgendaSection, body: string, eventDate: IsoDate | null) => void
  resolveItem: (id: string) => void
  addPrayerName: (name: string) => void
  removePrayerName: (id: string) => void
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

function ItemList({ date, data, section, actions }: { date: IsoDate; data: AgendaData; section: AgendaSection; actions: AgendaActions }) {
  const items = openItems(date, data.agendaItems, section)
  const dated = section.kind === 'calendar'
  return (
    <>
      {items.length ? (
        <List dense disablePadding>
          {items.map((i) => (
            <ListItem
              key={i.id}
              disableGutters
              secondaryAction={
                !i.resolved_on && (
                  <Button size="small" startIcon={<CheckIcon />} onClick={() => actions.resolveItem(i.id)}>
                    Done
                  </Button>
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
                sx={i.resolved_on ? { textDecoration: 'line-through', color: 'text.secondary' } : { pr: 9 }}
              />
            </ListItem>
          ))}
        </List>
      ) : (
        <Muted>Nothing open.</Muted>
      )}
      <AddLine label={dated ? 'New calendar item' : 'New item'} name={`New item for ${section.title}`} withDate={dated} onAdd={(text, d) => actions.addItem(section, text, d)} />
    </>
  )
}

function Header({ template, date, data, actions }: { template: AgendaTemplate; date: IsoDate; data: AgendaData; actions: AgendaActions }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    opening_prayer: data.agenda?.opening_prayer ?? '',
    spiritual_thought: data.agenda?.spiritual_thought ?? '',
    closing_prayer: data.agenda?.closing_prayer ?? '',
  })
  const n = (s: string) => (s.trim() ? s.trim() : null)
  const events = eventsOn(date, data.events)

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
            spacing={1.5}
            sx={{ mt: 2 }}
            onSubmit={(e) => {
              e.preventDefault()
              actions.saveHeader({ opening_prayer: n(form.opening_prayer), spiritual_thought: n(form.spiritual_thought), closing_prayer: n(form.closing_prayer) })
              setEditing(false)
            }}
          >
            <TextField label="Opening prayer" value={form.opening_prayer} onChange={(e) => setForm({ ...form, opening_prayer: e.target.value })} />
            <TextField label="Spiritual thought / handbook review" value={form.spiritual_thought} onChange={(e) => setForm({ ...form, spiritual_thought: e.target.value })} />
            <TextField label="Closing prayer" value={form.closing_prayer} onChange={(e) => setForm({ ...form, closing_prayer: e.target.value })} />
            <Stack direction="row" spacing={1}>
              <Button type="submit" variant="contained">
                Save
              </Button>
              <Button onClick={() => setEditing(false)}>Cancel</Button>
            </Stack>
          </Stack>
        ) : (
          <>
            <Typography variant="body2" sx={{ mt: 1.5 }}>
              <Box component="span" sx={{ color: 'text.secondary' }}>
                Opening prayer:
              </Box>{' '}
              {data.agenda?.opening_prayer || '—'}
              <br />
              <Box component="span" sx={{ color: 'text.secondary' }}>
                Spiritual thought:
              </Box>{' '}
              {data.agenda?.spiritual_thought || '—'}
            </Typography>
            <Button size="small" startIcon={<EditIcon />} onClick={() => setEditing(true)} sx={{ mt: 1 }}>
              Edit assignments
            </Button>
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
}: {
  section: AgendaSection
  date: IsoDate
  data: AgendaData
  actions: AgendaActions
  timeZone: string
  canEditCallings: boolean
}) {
  const who = (id: string | null) => personLabel(id, data.profiles) || 'Unassigned'
  const rotations = rotationsDue(date, data.rotations)
  const rotationLine = (r: (typeof rotations)[number]) => (r.assignee_id ? `${r.title} — ${who(r.assignee_id)}` : r.assignee_label ? `${r.title} — ${r.assignee_label}` : r.title)

  switch (section.kind) {
    case 'items':
    case 'calendar':
      return (
        <SectionCard title={section.title}>
          <ItemList date={date} data={data} section={section} actions={actions} />
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
            <Typography variant="body2">
              <Box component="span" sx={{ color: 'text.secondary' }}>
                {section.title}:
              </Box>{' '}
              {data.agenda?.closing_prayer || '—'}
            </Typography>
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
export function AgendaView({
  template,
  date,
  data,
  actions,
  timeZone,
  canEditCallings = false,
}: {
  template: AgendaTemplate
  date: IsoDate
  data: AgendaData
  actions: AgendaActions
  timeZone: string
  /** Bishopric members work callings right on the agenda; anyone else sees the table. */
  canEditCallings?: boolean
}) {
  const away = awayOn(date, data.absences)

  return (
    <>
      <Header key={`${template.id}-${data.agenda?.id ?? date}`} template={template} date={date} data={data} actions={actions} />

      {away.length > 0 && (
        <Alert severity="warning" role="status" sx={{ mb: 1.5 }}>
          Away today: {away.map((a) => `${personLabel(a.user_id, data.profiles) || 'Unassigned'}${a.location ? ` (${a.location})` : ''}`).join(', ')}
        </Alert>
      )}

      {template.sections.map((section) => (
        <Section key={section.id} section={section} date={date} data={data} actions={actions} timeZone={timeZone} canEditCallings={canEditCallings} />
      ))}
    </>
  )
}
