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
  const { roles, templates, profile, callingsHidden } = useAuth()
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
    saveAssignments: (changes) =>
      save
        .act(async () => {
          const asked = await q.saveAssignments(supabase, template.id, date, changes)
          for (const id of asked) void q.pushAbout(supabase, 'assignment_sent', id)
        })
        .then((ok) => {
          if (ok) reload()
          return ok
        }),
    recordAnswer: (id, status, reply) =>
      save
        .act(async () => {
          await q.answerAssignment(supabase, id, status, reply)
          void q.pushAbout(supabase, 'assignment_answered', id)
        })
        .then((ok) => {
          if (ok) reload()
          return ok
        }),
    addItem: (section, body, eventDate) => run(() => q.addAgendaItem(supabase, section, body, eventDate)),
    resolveItem: (id) => run(() => q.resolveAgendaItem(supabase, id, date)),
    addPrayerName: (name) => run(() => q.addPrayerName(supabase, name)),
    removePrayerName: (id) => run(() => q.removePrayerName(supabase, id, date)),
    addNeed: (need) => run(() => q.addNeed(supabase, need)),
    updateNeed: (id, changes) => run(() => q.updateNeed(supabase, id, changes)),
    deleteNeed: (id) => run(() => q.deleteNeed(supabase, id)),
    addCandidate: (needId, name) => run(() => q.addCandidate(supabase, { need_id: needId, person_name: name, status: 'discussing' })),
    updateCandidate: (id, changes) => run(() => q.updateCandidate(supabase, id, changes)),
    setApart: (candidate) => run(() => q.setApart(supabase, candidate.id, todayIso())),
    acceptCandidate: (candidate) => run(() => q.acceptCandidate(supabase, candidate, sustainingSunday(todayIso()))),
    approveCandidate: (candidate, leaderId) =>
      run(async () => {
        await q.updateCandidate(supabase, candidate.id, { status: 'approved' })
        if (leaderId) await q.assignCallingAppointment(supabase, candidate, leaderId)
      }),
    assignAppointment: (candidate, leaderId) => run(() => q.assignCallingAppointment(supabase, candidate, leaderId)),
    receiveCallingRequest: (id) =>
      run(async () => {
        await q.receiveCallingRequest(supabase, id, profile?.id ?? '')
        void q.pushAbout(supabase, 'calling_request_received', id)
      }),
    assignItem: (item, toId, dueOn) =>
      save.act(async () => {
        const id = await q.sendRequest(supabase, { to_id: toId, title: item.body, details: null, due_on: dueOn, agenda_item_id: item.id })
        void q.pushAbout(supabase, 'request_sent', id)
      }).then((ok) => {
        if (ok) reload()
        return ok
      }),
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
      {data ? <AgendaView template={template} date={date} data={data} actions={actions} timeZone={WARD_TIME_ZONE} canEditCallings={canSeeCallings(roles, callingsHidden)} callingsHidden={callingsHidden} me={{ id: profile?.id ?? '', name: profile?.display_name ?? '' }} /> : !error && <Loading />}
    </>
  )
}
