import { createTheme } from '@mui/material/styles'

// Light and dark palettes. The mode follows the device by default; ThemeToggle overrides it
// (MUI stores the choice in localStorage).
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#1f5fa8' },
        secondary: { main: '#6b4b9a' },
        background: { default: '#f4f6f9', paper: '#ffffff' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#7fb2f0' },
        secondary: { main: '#c3a6ef' },
        background: { default: '#0f141a', paper: '#18202a' },
      },
    },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    h1: { fontSize: '1.5rem', fontWeight: 700 },
    h2: { fontSize: '1.125rem', fontWeight: 600 },
    h3: { fontSize: '1rem', fontWeight: 600 },
  },
  components: {
    MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none' } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', minWidth: 0 } } },
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiTableCell: { styleOverrides: { root: { paddingLeft: 6, paddingRight: 6 } } },
  },
})

/** Native <select> inside a TextField: better on phones, and simpler to drive in tests. */
export const nativeSelect = { select: { native: true }, inputLabel: { shrink: true } } as const
