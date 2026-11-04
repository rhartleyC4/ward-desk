import FingerprintIcon from '@mui/icons-material/Fingerprint'
import LogoutIcon from '@mui/icons-material/Logout'
import Alert from '@mui/material/Alert'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import IconButton from '@mui/material/IconButton'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { navFor } from '../lib/access'
import { HoursPrompt } from './HoursPrompt'
import { InstallPrompt } from './InstallPrompt'
import { PasskeyOffer } from './PasskeyOffer'
import { ThemeToggle } from './ThemeToggle'

export function Layout() {
  const { roles, templates, profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const links = navFor(roles, templates)
  const current = links.find((l) => pathname === l.to || pathname.startsWith(`${l.to}/`))?.to ?? false

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1, flexWrap: 'wrap', minHeight: { xs: 52 } }}>
          <Tabs
            value={current}
            variant="scrollable"
            scrollButtons={false}
            aria-label="Main"
            sx={{ order: { xs: 3, md: 0 }, width: { xs: '100%', md: 'auto' }, flexGrow: { md: 1 }, minHeight: 44 }}
          >
            {links.map((l) => (
              <Tab key={l.to} value={l.to} label={l.label} component={NavLink} to={l.to} sx={{ minHeight: 44 }} />
            ))}
          </Tabs>
          <Typography variant="body2" color="text.secondary" noWrap sx={{ flexGrow: { xs: 1, md: 0 } }}>
            {profile?.display_name}
          </Typography>
          <ThemeToggle />
          <Tooltip title="Face ID and fingerprint sign-in">
            <IconButton color="inherit" aria-label="Face ID and fingerprint sign-in" component={NavLink} to="/account">
              <FingerprintIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Sign out">
            <IconButton color="inherit" aria-label="Sign out" onClick={signOut}>
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 2 }}>
        <HoursPrompt />
        <InstallPrompt />
        <PasskeyOffer />
        <Outlet />
      </Container>
    </Box>
  )
}

/** A card with an optional highlighted title bar, like the colored section rows in the sheet. */
export function SectionCard({ title, action, children }: { title?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <Card component="section" sx={{ mb: 1.5 }}>
      {title && (
        <Box
          sx={{
            px: 2,
            py: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            bgcolor: 'action.hover',
            borderBottom: 1,
            borderColor: 'divider',
            borderLeft: 4,
            borderLeftColor: 'primary.main',
          }}
        >
          <Typography variant="h2">{title}</Typography>
          {action}
        </Box>
      )}
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>{children}</CardContent>
    </Card>
  )
}

export function ErrorNote({ error }: { error: string | null }) {
  return error ? (
    <Alert severity="error" sx={{ mb: 1.5 }}>
      {error}
    </Alert>
  ) : null
}

export function Loading() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, color: 'text.secondary' }}>
      <CircularProgress size={20} />
      <Typography>Loading…</Typography>
    </Box>
  )
}

export function Muted({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" color="text.secondary">
      {children}
    </Typography>
  )
}
