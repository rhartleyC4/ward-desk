import '@fontsource-variable/lexend'
import { createTheme } from '@mui/material/styles'

// Deep ink and notebook gold, matching the app icon (public/favicon.svg).
const ink = '#1b2233'
const gold = '#f2b23a'

// Light and dark palettes. The mode follows the device by default; ThemeToggle overrides it
// (MUI stores the choice in localStorage).
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: ink, contrastText: '#ffffff' },
        // Darkened gold so it passes contrast as text on a light background.
        secondary: { main: '#8a5a00', contrastText: '#ffffff' },
        background: { default: '#f5f2ea', paper: '#ffffff' },
        text: { primary: ink, secondary: '#4c5263' },
      },
    },
    dark: {
      palette: {
        primary: { main: gold, contrastText: ink },
        secondary: { main: '#f6cd7a', contrastText: ink },
        background: { default: '#12161f', paper: ink },
        text: { primary: '#f3f1ec', secondary: '#b9bdc8' },
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
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiTableCell: { styleOverrides: { root: { paddingLeft: 6, paddingRight: 6 } } },
  },
})

/** Native <select> inside a TextField: better on phones, and simpler to drive in tests. */
export const nativeSelect = { select: { native: true }, inputLabel: { shrink: true } } as const
