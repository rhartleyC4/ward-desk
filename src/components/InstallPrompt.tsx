import AddBoxOutlinedIcon from '@mui/icons-material/AddBoxOutlined'
import IosShareIcon from '@mui/icons-material/IosShare'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { useEffect, useState } from 'react'
import { currentDevice, installPlatform } from '../lib/install'

const DISMISSED_KEY = 'ward-desk:install-dismissed'

/** Chromium's install event. Not in TypeScript's DOM types yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function rememberDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Private browsing can block storage; the card just comes back next visit.
  }
}

const inline = { fontSize: '1.1em', verticalAlign: 'text-bottom', mx: 0.25 }

/** Suggests adding the app to the home screen, until it's installed or dismissed. */
export function InstallPrompt() {
  const [platform, setPlatform] = useState(() => installPlatform(currentDevice()))
  const [dismissed, setDismissed] = useState(wasDismissed)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Hold the browser's own prompt so it opens from our button instead.
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstallEvent(null)
      setPlatform('installed')
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (dismissed || platform === 'installed') return null
  if (platform === 'other' && !installEvent) return null

  const dismiss = () => {
    rememberDismissed()
    setDismissed(true)
  }

  const install = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    // The event can only be used once.
    setInstallEvent(null)
    if (outcome === 'accepted') setPlatform('installed')
  }

  return (
    <Alert
      severity="info"
      icon={false}
      onClose={dismiss}
      slotProps={{ closeButton: { 'aria-label': 'Not now' } }}
      sx={{ mb: 1.5 }}
    >
      <AlertTitle>Add this app to your home screen</AlertTitle>
      {installEvent ? (
        <>
          It opens like any other app and keeps you signed in.
          <Box sx={{ mt: 1 }}>
            <Button variant="contained" size="small" onClick={install}>
              Install
            </Button>
          </Box>
        </>
      ) : platform === 'ios' ? (
        <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
          <li>
            Tap Share
            <IosShareIcon aria-hidden sx={inline} />
            in the browser (if it's not there, tap ••• first).
          </li>
          <li>
            Tap View More, then scroll down to Add to Home Screen
            <AddBoxOutlinedIcon aria-hidden sx={inline} />
            and tap it.
          </li>
          <li>Tap Add, then open it from its icon from now on.</li>
        </Box>
      ) : (
        <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
          <li>
            Open the browser menu
            <MoreVertIcon aria-hidden sx={inline} />
            (on Samsung Internet, it's ≡ at the bottom).
          </li>
          <li>Choose Install app or Add to Home screen, then confirm.</li>
          <li>Open it from its icon from now on.</li>
        </Box>
      )}
    </Alert>
  )
}
