import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { useColorScheme } from '@mui/material/styles'

type Mode = 'system' | 'light' | 'dark'

const NEXT: Record<Mode, Mode> = { system: 'light', light: 'dark', dark: 'system' }
const LABEL: Record<Mode, string> = { system: 'Theme: match device', light: 'Theme: light', dark: 'Theme: dark' }
const ICON: Record<Mode, typeof DarkModeIcon> = { system: SettingsBrightnessIcon, light: LightModeIcon, dark: DarkModeIcon }

/** Cycles device → light → dark. */
export function ThemeToggle() {
  const { mode, setMode } = useColorScheme()
  // mode is undefined until MUI has read the stored preference.
  if (!mode) return null
  const Icon = ICON[mode]
  return (
    <Tooltip title={`${LABEL[mode]} (click to change)`}>
      <IconButton color="inherit" aria-label={LABEL[mode]} onClick={() => setMode(NEXT[mode])}>
        <Icon />
      </IconButton>
    </Tooltip>
  )
}
