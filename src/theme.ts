import '@fontsource-variable/lexend'
import { createTheme, type Theme } from '@mui/material/styles'

// Harbor blue on cool greys, matching the app icon (public/favicon.svg).
const ink = '#14213d'
const harbor = '#2b5c9e'
const sky = '#8ab4f8'

// Light and dark palettes. The mode follows the device by default; ThemeToggle overrides it
// (MUI stores the choice in localStorage).
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: harbor, contrastText: '#ffffff' },
        secondary: { main: '#1d4479', contrastText: '#ffffff' },
        background: { default: '#f2f4f7', paper: '#ffffff' },
        text: { primary: ink, secondary: '#55607a' },
      },
    },
    dark: {
      palette: {
        primary: { main: sky, contrastText: '#0b1526' },
        secondary: { main: '#bcd3fb', contrastText: '#0b1526' },
        background: { default: '#0d1117', paper: '#161d29' },
        text: { primary: '#eef2f8', secondary: '#a3adc2' },
      },
    },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: '"Lexend Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    // Larger base size for easier reading; MUI scales every variant from this.
    fontSize: 16,
    h1: { fontSize: '1.75rem', fontWeight: 700 },
    h2: { fontSize: '1.25rem', fontWeight: 600 },
    h3: { fontSize: '1.0625rem', fontWeight: 600 },
    button: { fontWeight: 600 },
  },
  components: {
    MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { textTransform: 'none', minHeight: 44 }, sizeSmall: { minHeight: 40 } },
    },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', minWidth: 0, fontSize: '1rem' } } },
    // Safari (iPad, iPhone) doesn't open the gap in an outlined field's border for a raised label
    // in some flex layouts, so the line runs through the label: it mishandles the legend's
    // percentage max-width. Use none once the label is raised. See mui/material-ui#48566.
    MuiOutlinedInput: {
      styleOverrides: { root: { 'label[data-shrink="true"] ~ & > .MuiOutlinedInput-notchedOutline > legend': { maxWidth: 'none' } } },
    },
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiTableCell: { styleOverrides: { root: { paddingLeft: 6, paddingRight: 6 } } },
  },
})

/**
 * Frosted glass for bars that content scrolls behind (the top bar and the bottom tabs).
 * Falls back to a solid surface where blur isn't supported or the person asked for less transparency.
 */
export const glass = (t: Theme) => ({
  backgroundColor: `rgba(${t.vars!.palette.background.paperChannel} / 0.72)`,
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  boxShadow: 'inset 0 1px 0 rgba(255 255 255 / 0.6), 0 8px 24px rgba(20 33 61 / 0.10)',
  ...t.applyStyles('dark', { boxShadow: 'inset 0 1px 0 rgba(255 255 255 / 0.08), 0 8px 24px rgba(0 0 0 / 0.45)' }),
  '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))': { backgroundColor: t.vars!.palette.background.paper },
  '@media (prefers-reduced-transparency: reduce)': { backgroundColor: t.vars!.palette.background.paper, backdropFilter: 'none', WebkitBackdropFilter: 'none' },
})

/** Native <select> inside a TextField: better on phones, and simpler to drive in tests. */
export const nativeSelect = { select: { native: true }, inputLabel: { shrink: true } } as const
