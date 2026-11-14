import CloseIcon from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import { useEffect, useState } from 'react'
import { trackBusy } from '../lib/busy'
import { isTrainingSite } from '../lib/env'
import { PRACTICE_ACCOUNTS, practicePassword, signInAsPractice } from '../lib/practiceAccounts'
import { supabase } from '../lib/supabase'

// Session storage, so a hidden notice comes back the next time the app is opened.
const HIDDEN_KEY = 'training-banner-hidden'

function wasHidden() {
  try {
    return sessionStorage.getItem(HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

/** Goes straight from one practice person to another, without signing out first. */
function PracticeSwitcher() {
  const [email, setEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // This strip sits outside the app's auth context, so it follows the session itself.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!email) return null

  const switchTo = async (next: string) => {
    setBusy(true)
    setError(null)
    const problem = await trackBusy(signInAsPractice(next))
    setBusy(false)
    if (problem) setError(problem)
    // A fresh load drops the previous person's data and lands on the new person's first page.
    else window.location.assign('/')
  }

  const known = PRACTICE_ACCOUNTS.some((a) => a.email === email)
  return (
    <>
      <TextField
        select
        fullWidth={false}
        variant="standard"
        size="small"
        disabled={busy}
        value={known ? email : ''}
        onChange={(e) => e.target.value && void switchTo(e.target.value)}
        slotProps={{ select: { native: true }, htmlInput: { 'aria-label': 'Switch practice person' }, input: { disableUnderline: true } }}
        sx={{
          // On a phone it takes its own line under the notice, so the close button stays beside the notice.
          order: { xs: 3, sm: 1 },
          flexBasis: { xs: '100%', sm: 'auto' },
          '& .MuiInputBase-root, & select, & svg': { color: 'inherit', typography: 'body2', fontWeight: 600 },
          '& option': { color: 'text.primary', bgcolor: 'background.paper' },
        }}
      >
        {!known && <option value="">Switch person</option>}
        {PRACTICE_ACCOUNTS.map((a) => (
          <option key={a.email} value={a.email}>
            {a.name} · {a.role}
          </option>
        ))}
      </TextField>
      {error && (
        <Box role="alert" sx={{ order: 4, flexBasis: '100%', textAlign: 'center' }}>
          {error}
        </Box>
      )}
    </>
  )
}

/** A strip across the top of every page on the training site, so nobody mistakes it for the real one. */
export function EnvironmentBanner() {
  const [hidden, setHidden] = useState(wasHidden)
  if (!isTrainingSite() || hidden) return null

  const hide = () => {
    setHidden(true)
    try {
      sessionStorage.setItem(HIDDEN_KEY, '1')
    } catch {
      // Storage is blocked (private mode); the notice just stays hidden until the page reloads.
    }
  }

  return (
    <Box
      role="status"
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: 1,
        pl: 2,
        pr: 0.5,
        py: '2px',
        typography: 'body2',
        fontWeight: 600,
        bgcolor: 'secondary.main',
        color: 'secondary.contrastText',
      }}
    >
      <Box sx={{ flex: '1 1 0', textAlign: 'center' }}>Training site: no real names</Box>
      {practicePassword() && <PracticeSwitcher />}
      <IconButton size="small" color="inherit" aria-label="Hide training notice" onClick={hide} sx={{ order: 2 }}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  )
}
