import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ErrorNote, Loading } from '../components/Layout'
import { MeetingEditor } from '../components/MeetingEditor'
import { MeetingSummary } from '../components/MeetingSummary'
import { canPlanMeetings } from '../lib/access'
import { sundaysFrom, todayIso } from '../lib/dates'
import { loadBishopric, loadProfiles, loadSacrament, saveMeeting } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

const WEEKS = 12

export function SacramentPage() {
  const { roles } = useAuth()
  const canEdit = canPlanMeetings(roles)
  const sundays = sundaysFrom(todayIso(), WEEKS)
  const [editing, setEditing] = useState<string | null>(null)
  const save = useAction()

  const { data, error, reload } = useAsync(async () => {
    const [sacrament, profiles, bishopric] = await Promise.all([
      loadSacrament(supabase, sundays[0], sundays[sundays.length - 1]),
      loadProfiles(supabase),
      loadBishopric(supabase),
    ])
    return { ...sacrament, profiles, bishopric }
  }, [sundays[0]])

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  return (
    <>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Sacrament meetings
      </Typography>
      <ErrorNote error={save.error} />
      {sundays.map((date) => {
        const meeting = data.meetings.find((m) => m.meeting_date === date)
        const items = meeting ? data.items.filter((i) => i.meeting_id === meeting.id) : []
        return (
          <Card key={date} component="section" sx={{ mb: 1.5 }}>
            <CardContent sx={{ '&:last-child': { pb: 2 } }}>
              {editing === date ? (
                <MeetingEditor
                  date={date}
                  meeting={meeting}
                  items={items}
                  bishopric={data.bishopric}
                  busy={save.busy}
                  onCancel={() => setEditing(null)}
                  onSave={async (form) => {
                    const ok = await save.act(() => saveMeeting(supabase, form.meeting, form.items).then(() => undefined))
                    if (ok) {
                      setEditing(null)
                      reload()
                    }
                  }}
                />
              ) : (
                <>
                  <MeetingSummary date={date} meeting={meeting} items={items} profiles={data.profiles} absences={data.absences} />
                  {canEdit && (
                    <Button variant={meeting ? 'outlined' : 'contained'} size="small" onClick={() => setEditing(date)} sx={{ mt: 1.5 }}>
                      {meeting ? 'Edit' : 'Plan this Sunday'}
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )
      })}
    </>
  )
}
