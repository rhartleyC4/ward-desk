import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import FingerprintIcon from '@mui/icons-material/Fingerprint'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useAuth } from '../auth/AuthProvider'
import { ErrorNote, Loading, Muted, SectionCard } from '../components/Layout'
import { NotificationsCard, type NotificationActions } from '../components/NotificationsCard'
import { canSeeAppointments } from '../lib/access'
import { longDate, todayIso } from '../lib/dates'
import { deviceLabel, passkeysSupported, rememberPasskeyChoice } from '../lib/passkeys'
import { currentSubscription, showTestNotification, subscribeDevice, subscriptionParts } from '../lib/push'
import { deletePasskey, deletePushSubscription, hasPushSubscription, listPasskeys, registerPasskey, savePushSubscription } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

/** A timestamp as a date in this device's time zone. */
const localDate = (timestamp: string) => longDate(todayIso(new Date(timestamp)))

export function AccountPage() {
  const { session, roles } = useAuth()
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
      {canSeeAppointments(roles) && (
        <>
          <Typography variant="h1" sx={{ mt: 3, mb: 2 }}>
            Notifications
          </Typography>
          <NotificationsCard actions={notificationActions} />
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
