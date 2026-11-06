import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { EnvironmentBanner } from './components/EnvironmentBanner'
import { reportClientError } from './lib/queries'
import { startReporting } from './lib/errorReport'
import { supabase } from './lib/supabase'
import { theme } from './theme'

// Errors the app hits go to client_errors; the hourly health check emails a count of them.
startReporting((report) => reportClientError(supabase, report))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline enableColorScheme />
      <EnvironmentBanner />
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
)
