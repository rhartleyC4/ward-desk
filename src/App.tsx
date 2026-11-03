import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { Layout, Loading } from './components/Layout'
import { canManageAccess, canManageMeetings, canSeeAgenda, canSeeAppointments, canSuggest, homeFor, isMember, type AppRole } from './lib/access'
import type { AgendaTemplate } from './lib/queries'
import { AccessPage } from './pages/AccessPage'
import { AccountPage } from './pages/AccountPage'
import { AgendaPage } from './pages/AgendaPage'
import { AppointmentsPage } from './pages/AppointmentsPage'
import { AwayPage } from './pages/AwayPage'
import { LoginPage } from './pages/LoginPage'
import { MeetingsPage } from './pages/MeetingsPage'
import { SacramentPage } from './pages/SacramentPage'
import { SchedulePage } from './pages/SchedulePage'
import { SuggestPage } from './pages/SuggestPage'

function Guard({ allow, children }: { allow: (roles: AppRole[], templates: AgendaTemplate[]) => boolean; children: ReactNode }) {
  const { roles, templates } = useAuth()
  return allow(roles, templates) ? children : <Navigate to={homeFor(roles, templates)} replace />
}

const attendsAMeeting = (_: AppRole[], templates: AgendaTemplate[]) => canSeeAgenda(templates)

function AppRoutes() {
  const { loading, session, roles, templates } = useAuth()
  if (loading) return <Loading />
  if (!session) return <LoginPage />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={homeFor(roles, templates)} replace />} />
        <Route path="agenda" element={<Guard allow={attendsAMeeting}><AgendaPage /></Guard>} />
        <Route path="agenda/:slug" element={<Guard allow={attendsAMeeting}><AgendaPage /></Guard>} />
        <Route path="agenda/:slug/:date" element={<Guard allow={attendsAMeeting}><AgendaPage /></Guard>} />
        <Route path="sacrament" element={<Guard allow={isMember}><SacramentPage /></Guard>} />
        <Route path="appointments" element={<Guard allow={canSeeAppointments}><AppointmentsPage /></Guard>} />
        {/* Callings moved onto the bishopric agenda. */}
        <Route path="callings" element={<Navigate to="/agenda/bishopric" replace />} />
        <Route path="suggest" element={<Guard allow={canSuggest}><SuggestPage /></Guard>} />
        <Route path="away" element={<Guard allow={isMember}><AwayPage /></Guard>} />
        <Route path="schedule" element={<Guard allow={isMember}><SchedulePage /></Guard>} />
        <Route path="meetings" element={<Guard allow={canManageMeetings}><MeetingsPage /></Guard>} />
        <Route path="access" element={<Guard allow={canManageAccess}><AccessPage /></Guard>} />
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
