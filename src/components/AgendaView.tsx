import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import EditIcon from '@mui/icons-material/Edit'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
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
  interviewsOn,
  openItems,
  personLabel,
  releasesOn,
  sacramentLine,
  sustainingsOn,
  unsortedSuggestions,
  upcomingMeetings,
} from '../lib/agenda'
import { longDate, type IsoDate } from '../lib/dates'
import type { Enums } from '../lib/database.types'
import type { AgendaData } from '../lib/queries'
import { awayOn, eventsOn, formatTime, rotationsDue } from '../lib/schedule'
import { nativeSelect } from '../theme'
import { Muted, SectionCard } from './Layout'

export type AgendaActions = {
  saveHeader: (fields: { opening_prayer: string | null; spiritual_thought: string | null; closing_prayer: string | null }) => void
  addItem: (kind: Enums<'agenda_item_kind'>, body: string, eventDate: IsoDate | null) => void
  resolveItem: (id: string) => void
  addPrayerName: (name: string) => void
  removePrayerName: (id: string) => void
  addInterview: (interview: { interviewer_id: string; scheduled_at: string; person_name: string; purpose: Enums<'interview_purpose'> }) => void
}

function AddInterview({ date, data, onAdd }: { date: IsoDate; data: AgendaData; onAdd: AgendaActions['addInterview'] }) {
  const [form, setForm] = useState({ interviewer_id: '', time: '', person_name: '', purpose: 'calling' as Enums<'interview_purpose'> })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.interviewer_id || !form.time || !form.person_name.trim()) return
    // Entered in the browser's local time, which is the ward's time for anyone using this.
    onAdd({
      interviewer_id: form.interviewer_id,
      scheduled_at: new Date(`${date}T${form.time}`).toISOString(),
      person_name: form.person_name.trim(),
      purpose: form.purpose,
    })
    setForm({ ...form, time: '', person_name: '' })
  }
  return (
    <Box component="form" onSubmit={submit} aria-label="Add interview" sx={{ mt: 2 }}>
      <Grid container spacing={1.5} sx={{ alignItems: 'center' }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField select label="Interviewer" slotProps={nativeSelect} value={form.interviewer_id} onChange={(e) => setForm({ ...form, interviewer_id: e.target.value })}>
            <option value="">—</option>
            {data.bishopric.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 5, sm: 6, md: 2 }}>
          <TextField label="Time" type="time" slotProps={{ inputLabel: { shrink: true } }} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
        </Grid>
        <Grid size={{ xs: 7, sm: 6, md: 3 }}>
          <TextField label="Name" value={form.person_name} onChange={(e) => setForm({ ...form, person_name: e.target.value })} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <TextField select label="Purpose" slotProps={nativeSelect} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value as Enums<'interview_purpose'> })}>
            <option value="calling">Calling</option>
            <option value="temple_recommend">Temple recommend</option>
            <option value="ppi">PPI</option>
            <option value="youth">Youth</option>
            <option value="tithing_declaration">Tithing declaration</option>
            <option value="advancement">Advancement</option>
            <option value="other">Other</option>
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 2 }}>
          <Button type="submit" variant="outlined" fullWidth>
            Add interview
          </Button>
        </Grid>
      </Grid>
    </Box>
  )
}

function AddLine({ label, onAdd, withDate }: { label: string; onAdd: (text: string, date: IsoDate | null) => void; withDate?: boolean }) {
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
      <TextField value={text} onChange={(e) => setText(e.target.value)} placeholder={label} slotProps={{ htmlInput: { 'aria-label': label } }} />
      <Button type="submit" variant="outlined">
        Add
      </Button>
    </Stack>
  )
}

function ItemList({ date, data, kind, actions, addLabel }: { date: IsoDate; data: AgendaData; kind: Enums<'agenda_item_kind'>; actions: AgendaActions; addLabel: string }) {
  const items = openItems(date, data.agendaItems, kind)
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
      <AddLine label={addLabel} withDate={kind === 'calendar'} onAdd={(text, d) => actions.addItem(kind, text, d)} />
    </>
  )
}

function Header({ date, data, actions }: { date: IsoDate; data: AgendaData; actions: AgendaActions }) {
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
        <Typography variant="h1">Bishopric Meeting Agenda</Typography>
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

/** The weekly agenda, assembled from live data instead of a copied sheet tab. */
export function AgendaView({ date, data, actions, timeZone }: { date: IsoDate; data: AgendaData; actions: AgendaActions; timeZone: string }) {
  const who = (id: string | null) => personLabel(id, data.profiles) || 'Unassigned'
  const interviews = interviewsOn(date, data.interviews, timeZone)
  const needs = callingsNeeded(data.needs, data.candidates)
  const suggestions = unsortedSuggestions(data.candidates)
  const releases = releasesOn(date, data.needs)
  const sustainings = sustainingsOn(date, data.needs, data.candidates)
  const rotations = rotationsDue(date, data.rotations)
  const away = awayOn(date, data.absences)
  const [newPrayer, setNewPrayer] = useState('')

  return (
    <>
      <Header key={data.agenda?.id ?? date} date={date} data={data} actions={actions} />

      {away.length > 0 && (
        <Alert severity="warning" role="status" sx={{ mb: 1.5 }}>
          Away today: {away.map((a) => `${who(a.user_id)}${a.location ? ` (${a.location})` : ''}`).join(', ')}
        </Alert>
      )}

      <SectionCard title="Interviews & appointments">
        {interviews.length ? (
          interviews.map((g) => (
            <Box key={g.interviewerId ?? 'none'} sx={{ mb: 1 }}>
              <Typography variant="h3">{who(g.interviewerId)}</Typography>
              <Table size="small">
                <TableBody>
                  {g.slots.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ width: '6rem', whiteSpace: 'nowrap' }}>{s.time}</TableCell>
                      <TableCell>{s.label}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          ))
        ) : (
          <Muted>No interviews scheduled today.</Muted>
        )}
        {rotations.length > 0 && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            <Box component="span" sx={{ color: 'text.secondary' }}>
              Due this month:
            </Box>{' '}
            {rotations.map((r) => (r.assignee_id ? `${r.title} — ${who(r.assignee_id)}` : r.title)).join('; ')}
          </Typography>
        )}
        <AddInterview date={date} data={data} onAdd={actions.addInterview} />
      </SectionCard>

      <SectionCard title="Action / discussion items">
        <ItemList date={date} data={data} kind="discussion" actions={actions} addLabel="New discussion item" />
      </SectionCard>

      <SectionCard title="Upcoming sacrament meetings">
        <NameList items={upcomingMeetings(date, data.meetings).map((m) => sacramentLine(m, data.items, data.profiles))} />
      </SectionCard>

      <SectionCard title="Calendar">
        <ItemList date={date} data={data} kind="calendar" actions={actions} addLabel="New calendar item" />
      </SectionCard>

      <SectionCard title="Ward ordinations & advancements">
        <ItemList date={date} data={data} kind="ordination" actions={actions} addLabel="New ordination item" />
      </SectionCard>

      <SectionCard title="Ward missionary opportunities">
        <ItemList date={date} data={data} kind="missionary" actions={actions} addLabel="New missionary item" />
      </SectionCard>

      <SectionCard title="Callings needed (to discuss)">
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

      <SectionCard title={`Releases today (${longDate(date)})`}>
        <NameList items={releases.map((r) => `${r.release_name}, ${r.calling_title}`)} />
      </SectionCard>

      <SectionCard title={`Sustainings today (${longDate(date)})`}>
        <NameList items={sustainings.map((s) => `${s.name}, ${s.calling}`)} />
      </SectionCard>

      <Card sx={{ mb: 1.5 }}>
        <CardContent sx={{ '&:last-child': { pb: 2 } }}>
          <Typography variant="body2">
            <Box component="span" sx={{ color: 'text.secondary' }}>
              Closing prayer:
            </Box>{' '}
            {data.agenda?.closing_prayer || '—'}
          </Typography>
        </CardContent>
      </Card>

      <SectionCard title="Prayer roll">
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
      </SectionCard>
    </>
  )
}
