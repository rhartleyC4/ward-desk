import AddIcon from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ErrorNote, Loading, SaveError, SectionCard } from '../components/Layout'
import { MeetingCard, MeetingForm, type MeetingSetupActions } from '../components/MeetingSetup'
import { moveId, slugFor } from '../lib/agenda'
import * as q from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

/** Set up which meetings have agendas, what each agenda shows, and who attends. */
export function MeetingsPage() {
  const { reloadTemplates } = useAuth()
  const { data, error, reload } = useAsync(() => q.loadMeetingSetup(supabase), [])
  const save = useAction()
  const [creating, setCreating] = useState(false)

  if (!data) return error ? <ErrorNote error={error} /> : <Loading />

  const run = (fn: () => Promise<void>) =>
    save.act(fn).then(async (ok) => {
      reload()
      if (ok) await reloadTemplates()
      // The error shows above the meetings, which may be scrolled out of view.
      else window.scrollTo({ top: 0, behavior: 'smooth' })
    })

  const nextPosition = <T extends { position: number }>(rows: T[]) => Math.max(0, ...rows.map((r) => r.position)) + 1

  const actions: MeetingSetupActions = {
    createMeeting: (fields) =>
      run(() =>
        q.createAgendaTemplate(supabase, {
          ...fields,
          slug: slugFor(fields.name, data.templates.map((t) => t.slug)),
          position: nextPosition(data.templates),
        }),
      ),
    saveMeeting: (id, fields) => run(() => q.updateAgendaTemplate(supabase, id, fields)),
    deleteMeeting: (template) => {
      if (window.confirm(`Delete ${template.name}? This can't be undone.`)) run(() => q.deleteAgendaTemplate(supabase, template.id))
    },
    addSection: (template, kind, title) => run(() => q.addAgendaSection(supabase, { template_id: template.id, position: nextPosition(template.sections), kind, title })),
    renameSection: (id, title) => run(() => q.renameAgendaSection(supabase, id, title)),
    moveSection: (template, id, by) =>
      run(() =>
        q.reorderAgendaSections(
          supabase,
          template.id,
          moveId(template.sections.map((s) => s.id), id, by),
        ),
      ),
    deleteSection: (section) => {
      if (window.confirm(`Remove the ${section.title} section? Items already marked done in it are removed too.`)) run(() => q.deleteAgendaSection(supabase, section.id))
    },
    addAttendee: (templateId, userId) => run(() => q.addAttendee(supabase, templateId, userId)),
    removeAttendee: (templateId, userId) => run(() => q.removeAttendee(supabase, templateId, userId)),
  }

  return (
    <>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h1">Meetings</Typography>
        {!creating && (
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
            New meeting
          </Button>
        )}
      </Stack>
      <ErrorNote error={error} />
      <SaveError action={save} />
      {creating && (
        <SectionCard title="New meeting">
          <MeetingForm
            submitLabel="Create meeting"
            onSubmit={(fields) => {
              actions.createMeeting(fields)
              setCreating(false)
            }}
            onCancel={() => setCreating(false)}
          />
        </SectionCard>
      )}
      {data.templates.map((t) => (
        <MeetingCard key={t.id} template={t} setup={data} actions={actions} />
      ))}
    </>
  )
}
