import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import { NavLink, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { canEditHours } from '../lib/access'
import { keepsHours } from '../lib/availability'

/**
 * Asks a bishop or counselor who hasn't set appointment hours to set them, on every page until
 * they do. Signing in lands them on the Hours page from the home address, but sign-in can happen
 * on any page, so the landing alone isn't enough.
 */
export function HoursPrompt() {
  const { roles, office, hasHours } = useAuth()
  const { pathname } = useLocation()
  if (!keepsHours(office) || hasHours || !canEditHours(roles) || pathname === '/hours') return null
  return (
    <Alert
      severity="info"
      sx={{ mb: 1.5 }}
      action={
        <Button color="inherit" size="small" component={NavLink} to="/hours">
          Set hours
        </Button>
      }
    >
      Set the times you're usually free for appointments, so the executive secretaries can offer them.
    </Alert>
  )
}
