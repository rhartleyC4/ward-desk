import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import { Link, Navigate, useParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { AgendaView, type AgendaActions } from '../components/AgendaView'
import { ErrorNote, Loading } from '../components/Layout'
import { canSeeCallings } from '../lib/access'
import { shortDate, sustainingSunday, todayIso } from '../lib/dates'
import * as q from '../lib/queries'
import { followingMeeting, nextMeeting, previousMeeting } from '../lib/schedule'
import { supabase, WARD_TIME_ZONE } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

const isIsoDate = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

export function AgendaPage() {
  const { roles, templates } = useAuth()
  const params = useParams()
  // Links from before templates were /agenda/:date and meant the bishopric meeting.
  const legacyDate = isIsoDate(params.slug) ? params.slug : undefined
  const template = (!legacyDate && templates.find((t) => t.slug === params.slug)) || templates[0]
  const date = params.date ?? legacyDate ?? nextMeeting(template, todayIso())
  const { data, error, reload } = useAsync(() => q.loadAgenda(supabase, template, date), [template, date])
  const save = useAction()

  if (legacyDate) return <Navigate to={`/agenda/${template.slug}/${legacyDate}`} replace />

  const run = (fn: () => Promise<void>) => save.act(fn).then((ok) => ok && reload())

  const actions: AgendaActions = {
    saveHeader: (fields) => run(() => q.saveAgendaHeader(supabase, template.id, date, fields)),
    addItem: (section, body, eventDate) => run(() => q.addAgendaItem(supabase, section, body, eventDate)),
    resolveItem: (id) => run(() => q.resolveAgendaItem(supabase, id, date)),
    addPrayerName: (name) => run(() => q.addPrayerName(supabase, name)),
    removePrayerName: (id) => run(() => q.removePrayerName(supabase, id, date)),
    addNeed: (need) => run(() => q.addNeed(supabase, need)),
    updateNeed: (id, changes) => run(() => q.updateNeed(supabase, id, changes)),
    deleteNeed: (id) => run(() => q.deleteNeed(supabase, id)),
    addCandidate: (needId, name) => run(() => q.addCandidate(supabase, { need_id: needId, person_name: name, status: 'discussing' })),
    updateCandidate: (id, changes) => run(() => q.updateCandidate(supabase, id, changes)),
    acceptCandidate: (candidate) => run(() => q.acceptCandidate(supabase, candidate, sustainingSunday(todayIso()))),
    assignAppointment: (candidate, leaderId) => run(() => q.assignCallingAppointment(supabase, candidate, leaderId)),
  }

  const prev = previousMeeting(template, date)
  const next = followingMeeting(template, date)

  return (
    <>
      {templates.length > 1 && (
        <Tabs value={template.slug} variant="scrollable" scrollButtons={false} aria-label="Meetings" sx={{ mb: 1 }}>
          {templates.map((t) => (
            <Tab key={t.id} value={t.slug} label={t.name} component={Link} to={`/agenda/${t.slug}`} />
          ))}
        </Tabs>
      )}
      <Stack component="nav" aria-label="Agenda dates" direction="row" sx={{ justifyContent: 'space-between', mb: 1.5 }}>
        <Button component={Link} to={`/agenda/${template.slug}/${prev}`} startIcon={<ChevronLeftIcon />}>
          {shortDate(prev)}
        </Button>
        <Button component={Link} to={`/agenda/${template.slug}`}>
          Upcoming
        </Button>
        <Button component={Link} to={`/agenda/${template.slug}/${next}`} endIcon={<ChevronRightIcon />}>
          {shortDate(next)}
        </Button>
      </Stack>
      <ErrorNote error={error ?? save.error} />
      {data ? <AgendaView template={template} date={date} data={data} actions={actions} timeZone={WARD_TIME_ZONE} canEditCallings={canSeeCallings(roles)} /> : !error && <Loading />}
    </>
  )
}
