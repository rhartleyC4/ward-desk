import FingerprintIcon from '@mui/icons-material/Fingerprint'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { deviceLabel, rememberPasskeyChoice, shouldOfferPasskey } from '../lib/passkeys'
import { registerPasskey } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction } from '../lib/useAsync'

/** After an email-link or Google sign-in, offers to save a passkey so next time is just Face ID or a fingerprint. */
export function PasskeyOffer() {
  const { session } = useAuth()
  const user = session?.user
  const [open, setOpen] = useState(() => !!user && shouldOfferPasskey(user))
  const [done, setDone] = useState(false)
  const save = useAction()

  if (!user || (!open && !done)) return null

  if (done) {
    return (
      <Alert severity="success" onClose={() => setDone(false)} sx={{ mb: 1.5 }}>
        All set. Next time, tap "Face ID or fingerprint" on the sign-in screen.
      </Alert>
    )
  }

  const setUp = async () => {
    const ok = await save.act(() => registerPasskey(supabase, deviceLabel(navigator.userAgent)))
    if (ok) {
      rememberPasskeyChoice(user.id, 'ready')
      setOpen(false)
      setDone(true)
    }
  }

  const notNow = () => {
    rememberPasskeyChoice(user.id, 'dismissed')
    setOpen(false)
  }

  return (
    <Alert
      severity="info"
      icon={<FingerprintIcon />}
      sx={{ mb: 1.5 }}
      action={
        <Stack direction="row" spacing={0.5}>
          <Button color="inherit" size="small" onClick={notNow} disabled={save.busy}>
            Not now
          </Button>
          <Button color="inherit" size="small" variant="outlined" onClick={() => void setUp()} disabled={save.busy}>
            Turn on
          </Button>
        </Stack>
      }
    >
      Sign in with Face ID or a fingerprint next time, instead of waiting for an email.
      {save.error && <div>{save.error}</div>}
    </Alert>
  )
}
