import AccessTimeIcon from '@mui/icons-material/AccessTime'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import ContrastIcon from '@mui/icons-material/Contrast'
import EventRepeatIcon from '@mui/icons-material/EventRepeat'
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined'
import MailOutlinedIcon from '@mui/icons-material/MailOutlined'
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useColorScheme } from '@mui/material/styles'
import type { ChangeEvent, ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { useSettingsSplit } from '../components/Layout'
import { GroupedList, GroupedRow, IconTile, type TileColor } from '../components/Grouped'
import { SetupChecklist, useSetupSteps } from '../components/Setup'
import { canSeeAppointments, settingsFor, type SettingsIcon } from '../lib/access'
import { initials } from '../lib/names'
import { AccountPage } from './AccountPage'

const ICONS: Record<SettingsIcon, { icon: ReactNode; color: TileColor }> = {
  away: { icon: <FlightTakeoffIcon />, color: 'info' },
  hours: { icon: <AccessTimeIcon />, color: 'warning' },
  lengths: { icon: <TimerOutlinedIcon />, color: 'success' },
  messages: { icon: <MailOutlinedIcon />, color: 'info' },
  whoBooks: { icon: <GroupsOutlinedIcon />, color: 'secondary' },
  agendas: { icon: <FormatListBulletedIcon />, color: 'primary' },
  schedule: { icon: <EventRepeatIcon />, color: 'error' },
  callingList: { icon: <AccountTreeOutlinedIcon />, color: 'warning' },
  access: { icon: <KeyOutlinedIcon />, color: 'secondary' },
}

type Mode = 'system' | 'light' | 'dark'

/** Device, light or dark, as a native select so it works the same everywhere. */
function Appearance() {
  const { mode, setMode } = useColorScheme()
  return (
    <GroupedRow
      start={
        <IconTile color="primary">
          <ContrastIcon />
        </IconTile>
      }
      label={<label htmlFor="appearance">Appearance</label>}
      value={
        <Box
          component="select"
          id="appearance"
          value={mode ?? 'system'}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setMode(e.target.value as Mode)}
          sx={{ font: 'inherit', color: 'text.secondary', bgcolor: 'transparent', border: 0, textAlign: 'right', cursor: 'pointer', py: 1 }}
        >
          <option value="system">Match device</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </Box>
      }
    />
  )
}

/** The page a row opens is showing, so the row is highlighted. Settings itself opens on the account. */
function useSelected() {
  const { pathname } = useLocation()
  return (to: string) => pathname === to || (to === '/account' && pathname === '/settings')
}

/** Everything set up once: grouped like the iPhone's Settings app, with the setup checklist on top. */
function SettingsList() {
  const { roles, office, profile, session, signOut } = useAuth()
  const steps = useSetupSteps()
  const groups = settingsFor(roles, office)
  const split = useSettingsSplit()
  const isSelected = useSelected()
  const selected = (to: string) => split && isSelected(to)

  return (
    <>
      <GroupedList label="Your account">
        <GroupedRow
          to="/account"
          selected={selected('/account')}
          start={<Avatar sx={{ width: 44, height: 44, fontWeight: 700, bgcolor: 'secondary.main', color: 'primary.contrastText' }}>{initials(profile?.display_name)}</Avatar>}
          label={<Box component="span" sx={{ fontWeight: 600 }}>{profile?.display_name ?? session?.user.email}</Box>}
          hint={canSeeAppointments(roles) ? 'Sign-in, Face ID and notifications' : 'Sign-in and Face ID'}
        />
      </GroupedList>

      <SetupChecklist steps={steps} />

      {groups.map((g) => (
        <GroupedList key={g.title} title={g.title}>
          {g.links.map((l) => (
            <GroupedRow
              key={l.to}
              to={l.to}
              selected={selected(l.to)}
              label={l.label}
              hint={l.hint}
              start={<IconTile color={ICONS[l.icon].color}>{ICONS[l.icon].icon}</IconTile>}
            />
          ))}
          {g.title === 'You' && <Appearance />}
        </GroupedList>
      ))}
      {!groups.some((g) => g.title === 'You') && (
        <GroupedList title="You">
          <Appearance />
        </GroupedList>
      )}

      <GroupedList label="Sign out">
        <GroupedRow label="Sign out" tone="error" center onClick={() => void signOut()} />
      </GroupedList>
    </>
  )
}

/** On a phone, Settings is the list and each row opens its own page. Wider, the account page shows beside the list. */
export function SettingsPage() {
  if (useSettingsSplit()) return <AccountPage />
  return (
    <>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Settings
      </Typography>
      <SettingsList />
    </>
  )
}

/**
 * Wraps Settings and every page it opens. On a wide screen the list stays on the left and the page opens
 * on the right, like Settings on an iPad or a Mac. On a phone it's just the page.
 */
export function SettingsLayout() {
  if (!useSettingsSplit()) return <Outlet />
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '352px minmax(0, 1fr)', columnGap: 1.5, alignItems: 'start' }}>
      <Box
        component="nav"
        aria-label="Settings"
        sx={{
          position: 'sticky',
          top: 'calc(68px + env(safe-area-inset-top, 0px))',
          maxHeight: 'calc(100vh - 84px)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          // Room on the right so the scroll bar runs in the gap beside the cards, not over them.
          pr: 1.5,
          scrollbarWidth: 'thin',
          // A faint thumb and no track, so it reads like the dividers rather than a grey bar.
          scrollbarColor: (t) => `${t.vars?.palette.divider ?? t.palette.divider} transparent`,
        }}
      >
        <Typography variant="h1" sx={{ mb: 2 }}>
          Settings
        </Typography>
        <SettingsList />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Outlet />
      </Box>
    </Box>
  )
}
