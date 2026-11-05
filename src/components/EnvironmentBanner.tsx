import CloseIcon from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { useState } from 'react'
import { isTrainingSite } from '../lib/env'

// Session storage, so a hidden notice comes back the next time the app is opened.
const HIDDEN_KEY = 'training-banner-hidden'

function wasHidden() {
  try {
    return sessionStorage.getItem(HIDDEN_KEY) === '1'
  } catch {
    return false
  }
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
        gap: 1,
        pl: 2,
        pr: 0.5,
        py: '2px',
        typography: 'body2',
        fontWeight: 600,
        bgcolor: 'secondary.main',
        color: 'secondary.contrastText',
      }}
    >
      <Box sx={{ flexGrow: 1, textAlign: 'center' }}>Training site: practice data only. Don't enter real names.</Box>
      <IconButton size="small" color="inherit" aria-label="Hide training notice" onClick={hide}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  )
}
