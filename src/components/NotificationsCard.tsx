import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined'
import NotificationsOffOutlinedIcon from '@mui/icons-material/NotificationsOffOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { currentDevice, installPlatform } from '../lib/install'
import { pushAvailability, pushSupported, vapidPublicKey, type PushState } from '../lib/push'
import { ErrorNote, Muted, SectionCard } from './Layout'

export type NotificationActions = {
  /** Whether this device is subscribed and saved for the signed-in person. */
  status: () => Promise<boolean>
  turnOn: () => Promise<void>
  turnOff: () => Promise<void>
  test: () => Promise<void>
}

const NOTES: Partial<Record<PushState, string>> = {
  unconfigured: 'Notifications aren’t set up on this site yet.',
  unsupported: 'This browser can’t show notifications from Ward Desk.',
  'needs-install': 'On iPhone and iPad, notifications only work from the Home Screen. Add Ward Desk to your Home Screen, open it from there, and turn this on.',
  blocked: 'Notifications are blocked for Ward Desk in this browser. Allow them in the browser’s site settings, then come back here.',
}

function initialState(): PushState | 'loading' {
  const availability = pushAvailability({
    platform: installPlatform(currentDevice()),
    supported: pushSupported(),
    permission: pushSupported() ? Notification.permission : undefined,
    configured: !!vapidPublicKey(),
  })
  return availability === 'ready' ? 'loading' : availability
}

/** Turns notifications on or off for this device. */
export function NotificationsCard({ actions }: { actions: NotificationActions }) {
  const [state, setState] = useState<PushState | 'loading'>(initialState)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tested, setTested] = useState(false)

  useEffect(() => {
    if (state !== 'loading') return
    let cancelled = false
    actions
      .status()
      .then((on) => !cancelled && setState(on ? 'on' : 'off'))
      .catch((e: Error) => {
        if (cancelled) return
        setState('off')
        setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [state, actions])

  const run = async (fn: () => Promise<void>, next?: PushState) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      if (next) setState(next)
      return true
    } catch (e) {
      setError((e as Error).message)
      if (pushSupported() && Notification.permission === 'denied') setState('blocked')
      return false
    } finally {
      setBusy(false)
    }
  }

  const note = state !== 'loading' ? NOTES[state] : undefined

  return (
    <SectionCard title="This device">
      <Muted>
        Notifications say what kind of thing happened and when, never who or what an appointment is for, so they’re safe on a lock
        screen. Choose which ones you get below.
      </Muted>
      <ErrorNote error={error} />
      {note ? (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          {note}
        </Alert>
      ) : (
        <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          {state === 'on' ? (
            <>
              <Typography sx={{ flexBasis: '100%' }}>On for this device.</Typography>
              <Button variant="outlined" disabled={busy} onClick={() => void run(actions.test).then(setTested)}>
                Show a test
              </Button>
              <Button startIcon={<NotificationsOffOutlinedIcon />} disabled={busy} onClick={() => void run(actions.turnOff, 'off')}>
                Turn off
              </Button>
            </>
          ) : (
            <Button variant="contained" startIcon={<NotificationsActiveOutlinedIcon />} disabled={busy || state === 'loading'} onClick={() => void run(actions.turnOn, 'on')}>
              Turn on for this device
            </Button>
          )}
        </Stack>
      )}
      {tested && state === 'on' && (
        <Muted>
          <br />
          If no test appeared, check that notifications are allowed for this app in the device’s settings, and that Focus or Do Not Disturb is off.
        </Muted>
      )}
    </SectionCard>
  )
}
