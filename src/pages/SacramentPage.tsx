import Button from '@mui/material/Button'
import EditIcon from '@mui/icons-material/Edit'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ErrorNote, Loading, SectionCard, Tiles } from '../components/Layout'
import { MeetingEditor } from '../components/MeetingEditor'
import { meetingLabel, MeetingSummary } from '../components/MeetingSummary'
import { canPlanMeetings } from '../lib/access'
import { longDate, sundaysFrom, todayIso } from '../lib/dates'
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
      <Tiles>
        {sundays.map((date) => {
          const meeting = data.meetings.find((m) => m.meeting_date === date)
          const items = meeting ? data.items.filter((i) => i.meeting_id === meeting.id) : []
          const label = meetingLabel(meeting)
          return (
            <SectionCard
              key={date}
              title={longDate(date)}
              action={
                editing !== date && (label || canEdit) ? (
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                    {label && <Chip size="small" color="secondary" label={label} />}
                    {canEdit && (
                      <Button variant={meeting ? 'text' : 'contained'} size="small" startIcon={meeting ? <EditIcon /> : undefined} onClick={() => setEditing(date)} aria-label={`${meeting ? 'Edit' : 'Plan'} ${longDate(date)}`}>
                        {meeting ? 'Edit' : 'Plan'}
                      </Button>
                    )}
                  </Stack>
                ) : undefined
              }
            >
              {editing === date ? (
                <MeetingEditor
                  heading={false}
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
                <MeetingSummary heading={false} date={date} meeting={meeting} items={items} profiles={data.profiles} absences={data.absences} />
              )}
            </SectionCard>
          )
        })}
      </Tiles>
    </>
  )
}
