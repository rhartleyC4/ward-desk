import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { ErrorNote, Loading, Muted } from '../components/Layout'
import { Reminders, type RemindersActions } from '../components/Reminders'
import { WEEKDAYS } from '../lib/availability'
import { addDays, longDate, todayIso, weekday } from '../lib/dates'
import { myLeaderIds } from '../lib/appointments'
import { appointmentsOn, meetingsToRemind } from '../lib/followUp'
import * as q from '../lib/queries'
import { supabase, WARD_TIME_ZONE } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

/**
 * The reminders to send for a day, tomorrow unless the link says otherwise. The day-before
 * notification opens this page.
 */
export function RemindersPage() {
  const { profile, templates: agendaTemplates } = useAuth()
  const userId = profile?.id ?? ''
  const [params] = useSearchParams()
  const asked = params.get('date')
  const date = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : addDays(todayIso(), 1)
  const { data, error, reload } = useAsync(async () => {
    const [appointments, templates, reminders] = await Promise.all([q.loadAppointments(supabase), q.loadTemplates(supabase), q.loadMeetingReminders(supabase, date)])
    return { ...appointments, templates, ...reminders }
  }, [date])
  const save = useAction()

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  const run = (fn: () => Promise<void>) =>
    void save.act(fn).then((ok) => {
      if (ok) reload()
    })
  const actions: RemindersActions = {
    remind: (id, sent) => run(() => q.markReminded(supabase, id, sent)),
    remindMeeting: (eventId, sent) => run(() => q.markMeetingReminded(supabase, eventId, date, sent)),
  }
  const { leaderIds } = myLeaderIds(userId, data)
  const leaderName = (id: string | null) => data.bishopric.find((l) => l.id === id)?.display_name ?? 'Unassigned'
  const day = date === addDays(todayIso(), 1) ? 'tomorrow' : date === todayIso() ? 'today' : `${WEEKDAYS[weekday(date)]}, ${longDate(date)}`

  return (
    <>
      <ErrorNote error={save.error} />
      <Typography variant="h1">Reminders for {day}</Typography>
      <Muted>
        {WEEKDAYS[weekday(date)]}, {longDate(date)}. Copy each message, or open it in Messages or email, then pick who it goes to.
      </Muted>
      <Button component={Link} to="/home" size="small" sx={{ my: 1 }}>
        Back to Home
      </Button>
      <Reminders
        date={date}
        appointments={appointmentsOn(data.appointments, leaderIds, date, WARD_TIME_ZONE)}
        meetings={meetingsToRemind(userId, date, data.events)}
        sent={data.sent}
        agendas={data.agendas}
        agendaTemplates={agendaTemplates}
        templates={data.templates}
        leaderName={leaderName}
        myName={profile?.display_name ?? ''}
        timeZone={WARD_TIME_ZONE}
        actions={actions}
        busy={save.busy}
      />
    </>
  )
}
