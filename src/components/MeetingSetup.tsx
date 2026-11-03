import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/Edit'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import FormLabel from '@mui/material/FormLabel'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { SECTION_KINDS } from '../lib/agenda'
import type { Enums } from '../lib/database.types'
import type { AgendaSection, AgendaTemplate, MeetingSetup, TemplateFields } from '../lib/queries'
import { describePattern, formatTime } from '../lib/schedule'
import { nativeSelect } from '../theme'
import { Muted, SectionCard } from './Layout'

export type MeetingSetupActions = {
  createMeeting: (fields: TemplateFields) => void
  saveMeeting: (id: string, fields: TemplateFields) => void
  deleteMeeting: (template: AgendaTemplate) => void
  addSection: (template: AgendaTemplate, kind: Enums<'agenda_section_kind'>, title: string) => void
  renameSection: (id: string, title: string) => void
  moveSection: (template: AgendaTemplate, id: string, by: -1 | 1) => void
  deleteSection: (section: AgendaSection) => void
  addAttendee: (templateId: string, userId: string) => void
  removeAttendee: (templateId: string, userId: string) => void
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKS = ['1st', '2nd', '3rd', '4th', '5th']

/** Name and schedule of a meeting, for creating one or editing it. */
export function MeetingForm({ initial, submitLabel, onSubmit, onCancel }: { initial?: AgendaTemplate; submitLabel: string; onSubmit: (fields: TemplateFields) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    weekday: initial?.weekday ?? 0,
    weeks: initial?.weeks_of_month ?? [],
    time: initial?.start_time?.slice(0, 5) ?? '',
  })
  const toggleWeek = (w: number) => setForm({ ...form, weeks: form.weeks.includes(w) ? form.weeks.filter((x) => x !== w) : [...form.weeks, w].sort() })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    onSubmit({ name: form.name.trim(), weekday: form.weekday, weeks_of_month: form.weeks.length ? form.weeks : null, start_time: form.time || null })
  }

  return (
    <Box component="form" onSubmit={submit} aria-label={submitLabel}>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField label="Meeting name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Grid>
        <Grid size={{ xs: 7, sm: 3 }}>
          <TextField select label="Day" slotProps={nativeSelect} value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 5, sm: 3 }}>
          <TextField label="Time" type="time" slotProps={{ inputLabel: { shrink: true } }} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
        </Grid>
        <Grid size={12}>
          <FormLabel component="legend" sx={{ typography: 'body2' }}>
            Which weeks of the month? Leave all unchecked for every week.
          </FormLabel>
          <FormGroup row>
            {WEEKS.map((label, i) => (
              <FormControlLabel key={label} label={label} control={<Checkbox checked={form.weeks.includes(i + 1)} onChange={() => toggleWeek(i + 1)} />} />
            ))}
          </FormGroup>
        </Grid>
      </Grid>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button type="submit" variant="contained">
          {submitLabel}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </Stack>
    </Box>
  )
}

function SectionRow({ section, first, last, template, actions }: { section: AgendaSection; first: boolean; last: boolean; template: AgendaTemplate; actions: MeetingSetupActions }) {
  const [title, setTitle] = useState<string | null>(null)

  if (title !== null) {
    return (
      <ListItem disableGutters>
        <Stack
          component="form"
          direction="row"
          spacing={1}
          sx={{ width: '100%' }}
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim()) actions.renameSection(section.id, title.trim())
            setTitle(null)
          }}
        >
          <TextField size="small" value={title} onChange={(e) => setTitle(e.target.value)} slotProps={{ htmlInput: { 'aria-label': `Rename ${section.title}` } }} />
          <Button type="submit" variant="outlined">
            Save
          </Button>
          <Button onClick={() => setTitle(null)}>Cancel</Button>
        </Stack>
      </ListItem>
    )
  }

  return (
    <ListItem disableGutters sx={{ gap: 1 }}>
      <ListItemText primary={section.title} secondary={SECTION_KINDS[section.kind]} />
      <Stack direction="row" sx={{ flexShrink: 0 }}>
        <IconButton size="small" aria-label={`Move ${section.title} up`} disabled={first} onClick={() => actions.moveSection(template, section.id, -1)}>
          <ArrowUpwardIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label={`Move ${section.title} down`} disabled={last} onClick={() => actions.moveSection(template, section.id, 1)}>
          <ArrowDownwardIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label={`Rename ${section.title}`} onClick={() => setTitle(section.title)}>
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label={`Remove ${section.title}`} onClick={() => actions.deleteSection(section)}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Stack>
    </ListItem>
  )
}

function AddSection({ template, actions }: { template: AgendaTemplate; actions: MeetingSetupActions }) {
  const [kind, setKind] = useState<Enums<'agenda_section_kind'>>('items')
  const [title, setTitle] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    actions.addSection(template, kind, title.trim())
    setTitle('')
  }
  return (
    <Box component="form" onSubmit={submit} aria-label={`Add a section to ${template.name}`} sx={{ mt: 1.5 }}>
      <Grid container spacing={1.5} sx={{ alignItems: 'center' }}>
        <Grid size={{ xs: 12, sm: 5 }}>
          <TextField select label="Shows" slotProps={nativeSelect} value={kind} onChange={(e) => setKind(e.target.value as Enums<'agenda_section_kind'>)}>
            {Object.entries(SECTION_KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 8, sm: 5 }}>
          <TextField label="Section title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 4, sm: 2 }}>
          <Button type="submit" variant="outlined" fullWidth>
            Add
          </Button>
        </Grid>
      </Grid>
    </Box>
  )
}

function Attendees({ template, setup, actions }: { template: AgendaTemplate; setup: MeetingSetup; actions: MeetingSetupActions }) {
  const [userId, setUserId] = useState('')
  const attending = setup.attendees.filter((a) => a.template_id === template.id).map((a) => a.user_id)
  const people = setup.profiles.filter((p) => attending.includes(p.id))
  const others = setup.profiles.filter((p) => !attending.includes(p.id) && !setup.bishopricIds.includes(p.id))

  return (
    <>
      <Muted>The bishopric always sees every agenda. Add anyone else who attends.</Muted>
      {people.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
          {people.map((p) => (
            <Chip key={p.id} label={p.display_name ?? p.email} onDelete={() => actions.removeAttendee(template.id, p.id)} />
          ))}
        </Box>
      )}
      {others.length > 0 && (
        <Stack
          component="form"
          direction="row"
          spacing={1}
          sx={{ mt: 1.5 }}
          onSubmit={(e) => {
            e.preventDefault()
            if (!userId) return
            actions.addAttendee(template.id, userId)
            setUserId('')
          }}
        >
          <TextField select label="Attendee" slotProps={nativeSelect} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">—</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name ?? p.email}
              </option>
            ))}
          </TextField>
          <Button type="submit" variant="outlined">
            Add
          </Button>
        </Stack>
      )}
    </>
  )
}

/** One meeting's schedule, agenda sections and attendees. */
export function MeetingCard({ template, setup, actions }: { template: AgendaTemplate; setup: MeetingSetup; actions: MeetingSetupActions }) {
  const [editing, setEditing] = useState(false)
  const when = [describePattern(template), formatTime(template.start_time)].filter(Boolean).join(', ')

  return (
    <SectionCard
      title={template.name}
      action={
        !editing && (
          <Button size="small" startIcon={<EditIcon />} onClick={() => setEditing(true)}>
            Edit
          </Button>
        )
      }
    >
      {editing ? (
        <MeetingForm
          initial={template}
          submitLabel="Save meeting"
          onSubmit={(fields) => {
            actions.saveMeeting(template.id, fields)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <Typography variant="body2" color="text.secondary">
          {when}
        </Typography>
      )}

      <Typography variant="h3" sx={{ mt: 2 }}>
        Agenda sections
      </Typography>
      {template.sections.length ? (
        <List dense disablePadding>
          {template.sections.map((s, i) => (
            <SectionRow key={s.id} section={s} first={i === 0} last={i === template.sections.length - 1} template={template} actions={actions} />
          ))}
        </List>
      ) : (
        <Muted>No sections yet.</Muted>
      )}
      <AddSection template={template} actions={actions} />

      <Typography variant="h3" sx={{ mt: 2.5, mb: 0.5 }}>
        Attendees
      </Typography>
      <Attendees template={template} setup={setup} actions={actions} />

      {template.slug !== 'bishopric' && (
        <Button color="error" startIcon={<DeleteIcon />} onClick={() => actions.deleteMeeting(template)} sx={{ mt: 2 }}>
          Delete meeting
        </Button>
      )}
    </SectionCard>
  )
}
