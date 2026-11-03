import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { Layout, Loading } from './components/Layout'
import { canSeeAgenda, canSeeCallings, canSuggest, homeFor, isMember, type AppRole } from './lib/access'
import { AccountPage } from './pages/AccountPage'
import { AgendaPage } from './pages/AgendaPage'
import { AwayPage } from './pages/AwayPage'
import { CallingsPage } from './pages/CallingsPage'
import { LoginPage } from './pages/LoginPage'
import { SacramentPage } from './pages/SacramentPage'
import { SchedulePage } from './pages/SchedulePage'
import { SuggestPage } from './pages/SuggestPage'

function Guard({ allow, children }: { allow: (roles: AppRole[]) => boolean; children: ReactNode }) {
  const { roles } = useAuth()
  return allow(roles) ? children : <Navigate to={homeFor(roles)} replace />
}

function AppRoutes() {
  const { loading, session, roles } = useAuth()
  if (loading) return <Loading />
  if (!session) return <LoginPage />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={homeFor(roles)} replace />} />
        <Route path="agenda" element={<Guard allow={canSeeAgenda}><AgendaPage /></Guard>} />
        <Route path="agenda/:date" element={<Guard allow={canSeeAgenda}><AgendaPage /></Guard>} />
        <Route path="sacrament" element={<Guard allow={isMember}><SacramentPage /></Guard>} />
        <Route path="callings" element={<Guard allow={canSeeCallings}><CallingsPage /></Guard>} />
        <Route path="suggest" element={<Guard allow={canSuggest}><SuggestPage /></Guard>} />
        <Route path="away" element={<Guard allow={isMember}><AwayPage /></Guard>} />
        <Route path="schedule" element={<Guard allow={isMember}><SchedulePage /></Guard>} />
        <Route path="account" element={<AccountPage />} />
        <Route
          path="no-access"
          element={
            <Card>
              <CardContent>You're signed in, but no role has been assigned to you yet. Ask a ward admin to add one.</CardContent>
            </Card>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
