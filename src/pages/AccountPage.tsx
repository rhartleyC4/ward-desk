import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import FingerprintIcon from '@mui/icons-material/Fingerprint'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ErrorNote, Loading, Muted, SectionCard } from '../components/Layout'
import { MentorChoice, YourMentors } from '../components/Mentoring'
import { NotificationChoices, type ChoiceActions } from '../components/NotificationChoices'
import { NotificationsCard, type NotificationActions } from '../components/NotificationsCard'
import { longDate, todayIso } from '../lib/dates'
import { cleanName, NAME_MAX, nameProblem } from '../lib/names'
import { deviceLabel, passkeysSupported, rememberPasskeyChoice } from '../lib/passkeys'
import { currentSubscription, showTestNotification, subscribeDevice, subscriptionParts } from '../lib/push'
import {
  deletePasskey,
  deletePushSubscription,
  hasPushSubscription,
  listPasskeys,
  loadMutedNotifications,
  registerPasskey,
  savePushSubscription,
  setNotificationOn,
  updateMyName,
} from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

/** The name others see on agendas, requests and pickers, which the person can change themselves. */
function YourName() {
  const { session, profile, setDisplayName } = useAuth()
  const saved = profile?.display_name ?? ''
  const [name, setName] = useState(saved)
  const [done, setDone] = useState(false)
  const save = useAction()
  const problem = nameProblem(name)
  const changed = cleanName(name) !== saved

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!session || problem || !changed) return
    let next = ''
    const ok = await save.act(async () => {
      next = await updateMyName(supabase, session.user.id, name)
    })
    if (ok) {
      setDisplayName(next)
      setName(next)
      setDone(true)
    }
  }

  return (
    <SectionCard title="Your name">
      <Box component="form" onSubmit={submit} noValidate>
        <Muted>How you appear to others in Ward Desk, on agendas, requests and appointments.</Muted>
        <ErrorNote error={save.error} />
        <TextField
          label="Your name"
          fullWidth
          autoComplete="name"
          sx={{ mt: 1.5 }}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setDone(false)
          }}
          error={changed && !!problem}
          helperText={changed && problem ? problem : done ? 'Saved.' : ' '}
          slotProps={{ htmlInput: { maxLength: NAME_MAX + 10 } }}
        />
        <Button type="submit" variant="contained" sx={{ mt: 0.5 }} disabled={save.busy || !changed || !!problem}>
          Save
        </Button>
      </Box>
    </SectionCard>
  )
}

/** A timestamp as a date in this device's time zone. */
const localDate = (timestamp: string) => longDate(todayIso(new Date(timestamp)))

export function AccountPage() {
  const { session, roles, office, actingFor } = useAuth()
  const { data, error, reload } = useAsync(() => listPasskeys(supabase), [])
  const save = useAction()

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  const add = async () => {
    if (await save.act(() => registerPasskey(supabase, deviceLabel(navigator.userAgent)))) {
      if (session) rememberPasskeyChoice(session.user.id, 'ready')
      reload()
    }
  }

  const remove = async (id: string) => {
    if (await save.act(() => deletePasskey(supabase, id))) reload()
  }

  return (
    <>
      <Typography variant="h1" sx={{ mb: 2 }}>
        You
      </Typography>
      <MentorChoice />
      {actingFor ? <Muted>Choose Yourself to change your name and notifications.</Muted> : <YourName />}
      <YourMentors />
      <Typography variant="h1" sx={{ mt: 3, mb: 2 }}>
        Sign-in
      </Typography>
      <SectionCard title="Face ID and fingerprint">
        <Muted>
          Devices that can sign you in without an email. Remove one if it's lost or no longer yours. You can still sign in with an
          email link{import.meta.env.VITE_ENABLE_GOOGLE === 'true' ? ' or Google' : ''}.
        </Muted>
        <ErrorNote error={save.error} />
        {data.length === 0 ? (
          <Typography sx={{ my: 1.5 }}>None yet.</Typography>
        ) : (
          <Table size="small" sx={{ my: 1 }}>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Typography>{p.friendly_name || 'Passkey'}</Typography>
                    <Muted>
                      Added {localDate(p.created_at)}
                      {p.last_used_at && ` · last used ${localDate(p.last_used_at)}`}
                    </Muted>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton aria-label={`Remove ${p.friendly_name || 'passkey'}`} disabled={save.busy} onClick={() => void remove(p.id)}>
                      <DeleteOutlinedIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {passkeysSupported() ? (
          <Button variant="contained" startIcon={<FingerprintIcon />} disabled={save.busy} onClick={() => void add()}>
            Set up this device
          </Button>
        ) : (
          <Muted>This browser can't use Face ID or fingerprint sign-in.</Muted>
        )}
      </SectionCard>
      {roles.length > 0 && !actingFor && (
        <>
          <Typography variant="h1" sx={{ mt: 3, mb: 2 }}>
            Notifications
          </Typography>
          <NotificationsCard actions={notificationActions} />
          <NotificationChoices roles={roles} office={office} actions={choiceActions} />
        </>
      )}
    </>
  )
}

/** This device's push subscription, saved for whoever is signed in. */
const notificationActions: NotificationActions = {
  status: async () => {
    const sub = await currentSubscription()
    return !!sub && (await hasPushSubscription(supabase, sub.endpoint))
  },
  turnOn: async () => savePushSubscription(supabase, subscriptionParts(await subscribeDevice())),
  turnOff: async () => {
    const sub = await currentSubscription()
    if (!sub) return
    await deletePushSubscription(supabase, sub.endpoint)
    await sub.unsubscribe()
  },
  test: showTestNotification,
}

const choiceActions: ChoiceActions = {
  load: () => loadMutedNotifications(supabase),
  set: (kind, on) => setNotificationOn(supabase, kind, on),
}
