import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import EventOutlinedIcon from '@mui/icons-material/EventOutlined'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined'
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined'
import Alert from '@mui/material/Alert'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Badge from '@mui/material/Badge'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { Children, isValidElement, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { isSettingsPage, navFor } from '../lib/access'
import { initials } from '../lib/names'
import { nextStep } from '../lib/setup'
import { InstallPrompt } from './InstallPrompt'
import { PasskeyOffer } from './PasskeyOffer'
import { SetupProvider, useSetupSteps } from './Setup'
import { glass } from '../theme'
import { useWaitingCount, WaitingProvider } from './WaitingCount'

const TAB_ICONS: Record<string, ReactNode> = {
  '/home': <HomeOutlinedIcon />,
  '/agenda': <FormatListBulletedIcon />,
  '/sacrament': <MenuBookOutlinedIcon />,
  '/appointments': <EventOutlinedIcon />,
  '/requests': <AssignmentOutlinedIcon />,
}

type Back = { to: string; label: string }

/** Where the top-left back button goes: wherever sent us here, else Settings for a page opened from it. */
function backFor(pathname: string, state: unknown): Back | null {
  const sent = (state as { back?: Back } | null)?.back
  if (sent) return sent
  if (pathname !== '/settings' && isSettingsPage(pathname)) return { to: '/settings', label: 'Settings' }
  return null
}

export function Layout() {
  return (
    <SetupProvider>
      <WaitingProvider>
        <Shell />
      </WaitingProvider>
    </SetupProvider>
  )
}

function Shell() {
  const { roles, templates, office, profile } = useAuth()
  const { pathname, state } = useLocation()
  const steps = useSetupSteps()
  const links = navFor(roles, templates, office)
  const current = links.find((l) => pathname === l.to || pathname.startsWith(`${l.to}/`))?.to ?? false
  const split = useSettingsSplit()
  const sentBack = backFor(pathname, state)
  // With the Settings list showing beside the page, a button back to it would go nowhere new.
  const back = split && sentBack?.to === '/settings' ? null : sentBack
  const showTabs = links.length > 1
  const settings = isSettingsPage(pathname)
  // Dashboards spread into columns on a wide screen. Settings shows its list beside the page, and forms
  // elsewhere stay at a readable width.
  const width = current ? false : split && settings ? 'lg' : 'md'
  // The tab pages: a phone-width column until there's room for a side column, then wider but not endless.
  const wideMax = { xs: 900, lg: 1800 }
  // Offers to install and to turn on Face ID show on the landing page only, not on every page.
  const landing = pathname === links[0]?.to
  const pending = !!nextStep(steps)
  const settingsLabel = pending ? 'Settings (setup not finished)' : 'Settings'
  const waiting = useWaitingCount()
  /** The tab's label, with how many requests are waiting for this person. */
  const tabLabel = (l: { to: string; label: string }) => (l.to === '/requests' && waiting ? `${l.label} (${waiting} new)` : l.label)
  const tabIcon = (to: string) =>
    to === '/requests' ? (
      <Badge color="error" badgeContent={waiting} invisible={!waiting}>
        {TAB_ICONS[to]}
      </Badge>
    ) : (
      TAB_ICONS[to]
    )

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={[glass, { borderBottom: 1, borderColor: 'divider', pt: 'env(safe-area-inset-top, 0px)' }]}>
        <Toolbar sx={{ gap: 1, minHeight: { xs: 52 } }}>
          {back ? (
            <Button component={NavLink} to={back.to} startIcon={<ChevronLeftIcon />} sx={{ ml: -1.5, fontSize: '1rem', '& .MuiButton-startIcon': { mr: 0 } }}>
              {back.label}
            </Button>
          ) : (
            <Typography sx={{ fontWeight: 700, display: { md: showTabs ? 'none' : 'block' } }}>Ward Desk</Typography>
          )}
          {showTabs && (
            <Tabs value={current} variant="scrollable" scrollButtons={false} aria-label="Main" sx={{ display: { xs: 'none', md: 'flex' }, flexGrow: 1, minHeight: 52 }}>
              {links.map((l) => (
                <Tab
                  key={l.to}
                  value={l.to}
                  label={
                    l.to === '/requests' && waiting ? (
                      <Badge color="error" badgeContent={waiting} sx={{ '& .MuiBadge-badge': { right: -10 } }}>
                        {l.label}
                      </Badge>
                    ) : (
                      l.label
                    )
                  }
                  aria-label={tabLabel(l)}
                  component={NavLink}
                  to={l.to}
                  sx={{ minHeight: 52 }}
                />
              ))}
            </Tabs>
          )}
          <Box sx={{ flexGrow: { xs: 1, md: showTabs ? 0 : 1 } }} />
          <Tooltip title={settingsLabel}>
            <IconButton component={NavLink} to="/settings" aria-label={settingsLabel} sx={{ mr: -1 }}>
              <Badge color="error" variant="dot" overlap="circular" invisible={!pending}>
                <Avatar sx={{ width: 34, height: 34, fontSize: '0.875rem', fontWeight: 700, bgcolor: pathname === '/settings' ? 'primary.main' : 'secondary.main', color: 'primary.contrastText' }}>
                  {initials(profile?.display_name)}
                </Avatar>
              </Badge>
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Container maxWidth={width} sx={{ maxWidth: width === false ? wideMax : undefined, pt: 2, pb: showTabs ? { xs: 'calc(96px + env(safe-area-inset-bottom, 0px))', md: 4 } : 4 }}>
        {landing && (
          <>
            <InstallPrompt />
            <PasskeyOffer />
          </>
        )}
        <Outlet />
      </Container>
      {showTabs && (
        // A floating glass pill, like the iOS tab bar, so the page shows through as it scrolls.
        <Paper
          component="nav"
          aria-label="Main"
          elevation={0}
          sx={[
            glass,
            {
              display: { md: 'none' },
              position: 'fixed',
              left: 8,
              right: 8,
              bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
              mx: 'auto',
              maxWidth: 560,
              zIndex: 'appBar',
              borderRadius: 999,
              border: 1,
              borderColor: 'divider',
              overflow: 'hidden',
            },
          ]}
        >
          <BottomNavigation showLabels value={current} sx={{ height: 64, px: 0.5, alignItems: 'center', bgcolor: 'transparent' }}>
            {links.map((l) => (
              <BottomNavigationAction
                key={l.to}
                value={l.to}
                label={l.label}
                aria-label={tabLabel(l)}
                icon={tabIcon(l.to)}
                component={NavLink}
                to={l.to}
                sx={{
                  minWidth: 0,
                  px: 0.25,
                  height: 52,
                  borderRadius: 999,
                  '&.Mui-selected': { bgcolor: 'action.selected' },
                  // iOS-sized labels, so five tabs fit in the pill at phone width.
                  '& .MuiBottomNavigationAction-label, & .MuiBottomNavigationAction-label.Mui-selected': { fontSize: '0.6875rem', whiteSpace: 'nowrap' },
                }}
              />
            ))}
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  )
}

/** Wide enough to show the Settings list beside the page it opens, like Settings on an iPad. */
export const useSettingsSplit = () => useMediaQuery(useTheme().breakpoints.up('md'), { noSsr: true })

/** The narrowest a tile gets before the row drops to fewer tiles. Cards are laid out for phones up to here. */
const COLUMN = '34rem'

/** Marks a card for the side column of a Split. On a phone it stays where it is in the order. */
export function Side({ children }: { children: ReactNode }) {
  return children
}

const isSide = (node: ReactNode) => isValidElement(node) && node.type === Side

/**
 * A page of cards. On a phone they stack in the order given. On a desktop the cards marked `Side`
 * (things to glance at) move to a narrower column on the right, and the rest (things to work through)
 * stay on the left, each in a fixed place, so opening a form never pushes cards across.
 */
export function Split({ children }: { children: ReactNode }) {
  const wide = useMediaQuery(useTheme().breakpoints.up('lg'), { noSsr: true })
  const cards = Children.toArray(children)
  const side = cards.filter(isSide)
  if (!wide) return <>{cards}</>
  // Nothing to put beside it: one column at the width a single column reads best.
  if (!side.length) return <Box sx={{ maxWidth: 900, mx: 'auto' }}>{cards}</Box>
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(22rem, 1fr)', columnGap: 1.5, alignItems: 'start' }}>
      <Box sx={{ minWidth: 0 }}>{cards.filter((c) => !isSide(c))}</Box>
      <Box sx={{ minWidth: 0 }}>{side}</Box>
    </Box>
  )
}

/** Cards in rows across as many columns as fit, for a dated series read left to right (like Sundays). Cards in a row match heights. */
export function Tiles({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${COLUMN}), 1fr))`, columnGap: 1.5 }}>
      {children}
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
