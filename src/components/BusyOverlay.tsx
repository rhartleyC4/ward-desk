import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import { useSyncExternalStore } from 'react'
import { busyPhase, onBusyChange } from '../lib/busy'

/**
 * Covers the app while a save or sign-in is with the server (see lib/busy). It blocks taps from
 * the start and fades the spinner in only if the wait is long enough to notice.
 */
export function BusyOverlay() {
  const phase = useSyncExternalStore(onBusyChange, busyPhase)
  if (phase === 'idle') return null
  const shown = phase === 'shown'
  return (
    <Box
      aria-busy="true"
      sx={(theme) => ({
        position: 'fixed',
        inset: 0,
        // Above dialogs, since many saves start from one.
        zIndex: theme.zIndex.modal + 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'progress',
        backgroundColor: shown ? `rgba(${theme.vars!.palette.background.defaultChannel} / 0.55)` : 'transparent',
        backdropFilter: shown ? 'blur(2px)' : 'none',
        transition: 'background-color 150ms ease-out',
      })}
    >
      {shown && (
        <Box
          sx={{
            p: 2.5,
            borderRadius: 4,
            bgcolor: 'background.paper',
            boxShadow: 6,
            display: 'flex',
            '@keyframes busyIn': { from: { opacity: 0, transform: 'scale(0.9)' }, to: { opacity: 1, transform: 'none' } },
            animation: 'busyIn 150ms ease-out',
          }}
        >
          <CircularProgress size={36} aria-label="Working" />
        </Box>
      )}
    </Box>
  )
}
