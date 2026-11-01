import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ErrorNote, Loading, SectionCard } from '../components/Layout'
import { personLabel } from '../lib/agenda'
import { loadProfiles, loadSchedule } from '../lib/queries'
import { formatTime } from '../lib/schedule'
import { supabase } from '../lib/supabase'
import { useAsync } from '../lib/useAsync'

const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
const NTH = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The standing schedule (the "Bishopric Schedule" tab). Read-only for now. */
export function SchedulePage() {
  const { data, error } = useAsync(async () => {
    const [schedule, profiles] = await Promise.all([loadSchedule(supabase), loadProfiles(supabase)])
    return { ...schedule, profiles }
  }, [])

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  const byPerson = new Map<string, string[]>()
  for (const s of data.stewardships) byPerson.set(s.user_id, [...(byPerson.get(s.user_id) ?? []), s.area])

  return (
    <>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Standing schedule
      </Typography>
      <SectionCard title="Regular meetings">
        <List dense disablePadding>
          {data.events.map((e) => (
            <ListItem key={e.id} disableGutters>
              <ListItemText
                primary={e.title}
                secondary={`${e.week_of_month ? `${NTH[e.week_of_month]} ${DAYS[e.weekday].slice(0, -1)}` : DAYS[e.weekday]}${e.start_time ? `, ${formatTime(e.start_time)}` : ''}`}
              />
            </ListItem>
          ))}
        </List>
      </SectionCard>
      <SectionCard title="Rotations">
        <List dense disablePadding>
          {data.rotations.map((r) => (
            <ListItem key={r.id} disableGutters>
              <ListItemText
                primary={r.assignee_id ? `${r.title} — ${personLabel(r.assignee_id, data.profiles)}` : r.title}
                secondary={r.months.map((m) => MONTHS[m - 1]).join(', ')}
              />
            </ListItem>
          ))}
        </List>
      </SectionCard>
      <SectionCard title="Bishopric assignments">
        <Grid container spacing={2}>
          {[...byPerson.entries()].map(([id, areas]) => (
            <Grid key={id} size={{ xs: 12, sm: 4 }}>
              <Typography variant="h3" sx={{ mb: 1 }}>
                {data.profiles.find((p) => p.id === id)?.display_name}
              </Typography>
              <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                {areas.map((a) => (
                  <Chip key={a} size="small" label={a} />
                ))}
              </Stack>
            </Grid>
          ))}
        </Grid>
        {byPerson.size === 0 && <Box sx={{ color: 'text.secondary' }}>No assignments yet.</Box>}
      </SectionCard>
    </>
  )
}
