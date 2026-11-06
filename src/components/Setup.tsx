import CheckIcon from '@mui/icons-material/Check'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import Typography from '@mui/material/Typography'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { currentDevice, installPlatform } from '../lib/install'
import { passkeysSupported } from '../lib/passkeys'
import { currentSubscription, pushAvailability, pushSupported, vapidPublicKey } from '../lib/push'
import { hasPushSubscription, listPasskeys } from '../lib/queries'
import { nextStep, setupSteps, type SetupFacts, type SetupStep } from '../lib/setup'
import { supabase } from '../lib/supabase'
import { GroupedList, GroupedRow } from './Grouped'

type Device = Pick<SetupFacts, 'passkeys' | 'notifications'>

const SetupContext = createContext<SetupStep[]>([])

/** What this device has set up: saved passkeys, and whether notifications are on. */
async function loadDevice(wantsNotifications: boolean): Promise<Device> {
  const passkeys = passkeysSupported() ? await listPasskeys(supabase).then((p) => p.length, () => null) : null
  let notifications: Device['notifications'] = null
  if (wantsNotifications) {
    const availability = pushAvailability({
      platform: installPlatform(currentDevice()),
      supported: pushSupported(),
      permission: pushSupported() ? Notification.permission : undefined,
      configured: !!vapidPublicKey(),
    })
    if (availability === 'needs-install') notifications = 'install'
    else if (availability === 'ready') {
      const sub = await currentSubscription().catch(() => null)
      notifications = sub && (await hasPushSubscription(supabase, sub.endpoint).catch(() => false)) ? 'on' : 'off'
    }
  }
  return { passkeys, notifications }
}

/** Works out the setup checklist once for every page, re-checking the device on each page change. */
export function SetupProvider({ children }: { children: ReactNode }) {
  const { roles, office, hasHours, session } = useAuth()
  const { pathname } = useLocation()
  const [device, setDevice] = useState<Device>({ passkeys: null, notifications: null })
  const wantsNotifications = roles.length > 0
  const userId = session?.user.id

  useEffect(() => {
    let cancelled = false
    loadDevice(wantsNotifications).then((d) => !cancelled && setDevice(d))
    return () => {
      cancelled = true
    }
  }, [pathname, userId, wantsNotifications])

  return <SetupContext.Provider value={setupSteps({ roles, office, hasHours, ...device })}>{children}</SetupContext.Provider>
}

export const useSetupSteps = () => useContext(SetupContext)

function Check({ done }: { done: boolean }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 26,
        height: 26,
        borderRadius: '50%',
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        border: 2,
        borderColor: done ? 'success.main' : 'divider',
        bgcolor: done ? 'success.main' : 'transparent',
        color: 'success.contrastText',
      }}
    >
      {done && <CheckIcon sx={{ fontSize: 18 }} />}
    </Box>
  )
}

/** The checklist itself, for the top of Settings. Hidden once everything is done. */
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  if (!nextStep(steps)) return null
  const done = steps.filter((s) => s.done).length
  const next = nextStep(steps)
  return (
    <GroupedList title={`Finish setting up · ${done} of ${steps.length}`} label="Finish setting up">
      {steps.map((s) =>
        s.done ? (
          <GroupedRow key={s.id} start={<Check done />} label={<Box component="span" sx={{ color: 'text.secondary', textDecoration: 'line-through' }}>{s.label}</Box>} />
        ) : (
          <GroupedRow key={s.id} start={<Check done={false} />} label={s.label} hint={s.hint} to={s.to} value={s === next ? 'Next' : undefined} />
        ),
      )}
    </GroupedList>
  )
}

/** A ring showing how much of setup is done. */
function Progress({ done, total }: { done: number; total: number }) {
  const r = 19
  const length = 2 * Math.PI * r
  return (
    <Box component="svg" viewBox="0 0 48 48" aria-hidden sx={{ width: 48, height: 48, flex: 'none' }}>
      <Box component="circle" cx={24} cy={24} r={r} fill="none" strokeWidth={5} sx={{ stroke: 'var(--mui-palette-divider)' }} />
      <Box
        component="circle"
        cx={24}
        cy={24}
        r={r}
        fill="none"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${(done / total) * length} ${length}`}
        transform="rotate(-90 24 24)"
        sx={{ stroke: 'var(--mui-palette-primary-main)' }}
      />
      <Box component="text" x={24} y={28.5} textAnchor="middle" fontSize={12.5} fontWeight={700} sx={{ fill: 'var(--mui-palette-text-primary)' }}>
        {done}/{total}
      </Box>
    </Box>
  )
}

/** On Home until setup is done: how far along, and the next thing to do. Opens Settings. */
export function SetupCard() {
  const steps = useSetupSteps()
  const next = nextStep(steps)
  if (!next) return null
  const done = steps.filter((s) => s.done).length
  return (
    <ButtonBase
      component={Link}
      to="/settings"
      sx={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        mb: 1.5,
        textAlign: 'left',
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 3,
        '&:hover, &.Mui-focusVisible': { bgcolor: 'action.hover' },
      }}
    >
      <Progress done={done} total={steps.length} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }}>Finish setting up</Typography>
        <Typography variant="body2" color="text.secondary">
          Next: {next.label.charAt(0).toLowerCase() + next.label.slice(1)}
        </Typography>
      </Box>
      <ChevronRightIcon aria-hidden sx={{ color: 'text.secondary' }} />
    </ButtonBase>
  )
}
