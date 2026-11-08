import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'

const until = (iso: string) => new Date(new Date(iso).getTime() - 1).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

/**
 * While a mentor uses Ward Desk as the new bishop, a strip on every page says so, with the way
 * back to being themself (on the Account page, when they have a role of their own).
 */
export function MentorBanner() {
  const { actingFor, hasOwnRoles, switchActing } = useAuth()
  if (!actingFor) return null
  return (
    <Box
      role="status"
      sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 2, px: 2, py: 1, borderRadius: 2, bgcolor: 'action.selected' }}
    >
      <Typography variant="body2" sx={{ flexGrow: 1, fontWeight: 600 }}>
        Helping {actingFor.name ?? 'the bishop'} · until {until(actingFor.ends_at)}
        <Typography component="span" variant="body2" sx={{ display: 'block', fontWeight: 400, color: 'text.secondary' }}>
          What you do here is recorded as his.
        </Typography>
      </Typography>
      {hasOwnRoles ? (
        <Button size="small" variant="outlined" onClick={() => switchActing(null)}>
          Be yourself
        </Button>
      ) : (
        <Button size="small" component={Link} to="/account">
          More
        </Button>
      )}
    </Box>
  )
}
