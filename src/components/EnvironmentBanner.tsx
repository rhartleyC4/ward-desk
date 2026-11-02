import Box from '@mui/material/Box'
import { isTrainingSite } from '../lib/env'

/** A strip across the top of every page on the training site, so nobody mistakes it for the real one. */
export function EnvironmentBanner() {
  if (!isTrainingSite()) return null
  return (
    <Box
      role="status"
      sx={{ px: 2, py: 0.5, textAlign: 'center', typography: 'body2', fontWeight: 600, bgcolor: 'warning.main', color: 'warning.contrastText' }}
    >
      Training site: practice data only. Don't enter real names.
    </Box>
  )
}
