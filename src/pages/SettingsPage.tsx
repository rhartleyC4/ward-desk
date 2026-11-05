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
import { useAuth } from '../auth/AuthProvider'
import { GroupedList, GroupedRow, IconTile, type TileColor } from '../components/Grouped'
import { SetupChecklist, useSetupSteps } from '../components/Setup'
import { canSeeAppointments, settingsFor, type SettingsIcon } from '../lib/access'
import { initials } from '../lib/names'

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

/** Everything set up once: grouped like the iPhone's Settings app, with the setup checklist on top. */
export function SettingsPage() {
  const { roles, office, profile, session, signOut } = useAuth()
  const steps = useSetupSteps()
  const groups = settingsFor(roles, office)

  return (
    <>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Settings
      </Typography>

      <GroupedList label="Your account">
        <GroupedRow
          to="/account"
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
