import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { Link, useParams } from 'react-router'
import { AgendaView, type AgendaActions } from '../components/AgendaView'
import { ErrorNote, Loading } from '../components/Layout'
import { addDays, shortDate, todayIso, upcomingSunday } from '../lib/dates'
import * as q from '../lib/queries'
import { supabase, WARD_TIME_ZONE } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

export function AgendaPage() {
  const params = useParams()
  const date = params.date ?? upcomingSunday(todayIso())
  const { data, error, reload } = useAsync(() => q.loadAgenda(supabase, date), [date])
  const save = useAction()

  const run = (fn: () => Promise<void>) => save.act(fn).then((ok) => ok && reload())

  const actions: AgendaActions = {
    saveHeader: (fields) => run(() => q.saveAgendaHeader(supabase, date, fields)),
    addItem: (kind, body, eventDate) => run(() => q.addAgendaItem(supabase, { kind, body, event_date: eventDate })),
    resolveItem: (id) => run(() => q.resolveAgendaItem(supabase, id, date)),
    addPrayerName: (name) => run(() => q.addPrayerName(supabase, name)),
    removePrayerName: (id) => run(() => q.removePrayerName(supabase, id, date)),
    addInterview: (interview) => run(() => q.addInterview(supabase, interview)),
  }

  return (
    <>
      <Stack component="nav" aria-label="Agenda weeks" direction="row" sx={{ justifyContent: 'space-between', mb: 1.5 }}>
        <Button component={Link} to={`/agenda/${addDays(date, -7)}`} startIcon={<ChevronLeftIcon />}>
          {shortDate(addDays(date, -7))}
        </Button>
        <Button component={Link} to="/agenda">
          This Sunday
        </Button>
        <Button component={Link} to={`/agenda/${addDays(date, 7)}`} endIcon={<ChevronRightIcon />}>
          {shortDate(addDays(date, 7))}
        </Button>
      </Stack>
      <ErrorNote error={error ?? save.error} />
      {data ? <AgendaView date={date} data={data} actions={actions} timeZone={WARD_TIME_ZONE} /> : !error && <Loading />}
    </>
  )
}
