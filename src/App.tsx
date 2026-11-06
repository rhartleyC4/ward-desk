import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { Layout, Loading } from './components/Layout'
import { canEditHours, hasHome, canManageAccess, canManageCallingList, canManageMeetings, canSeeAgenda, canSeeAppointments, homeFor, isMember, type AppRole } from './lib/access'
import { keepsHours } from './lib/availability'
import type { AgendaTemplate } from './lib/queries'
import { AccessPage } from './pages/AccessPage'
import { AccountPage } from './pages/AccountPage'
import { AgendaPage } from './pages/AgendaPage'
import { AppointmentsPage } from './pages/AppointmentsPage'
import { CallingListPage } from './pages/CallingListPage'
import { AwayPage } from './pages/AwayPage'
import { HomePage } from './pages/HomePage'
import { HoursPage } from './pages/HoursPage'
import { LoginPage } from './pages/LoginPage'
import { MeetingsPage } from './pages/MeetingsPage'
import { SacramentPage } from './pages/SacramentPage'
import { LengthsPage } from './pages/LengthsPage'
import { MessagesPage } from './pages/MessagesPage'
import { SchedulePage } from './pages/SchedulePage'
import { SettingsLayout, SettingsPage } from './pages/SettingsPage'
import { WhoBooksPage } from './pages/WhoBooksPage'
import { RequestsPage } from './pages/RequestsPage'
import { RemindersPage } from './pages/RemindersPage'

function Guard({ allow, children }: { allow: (roles: AppRole[], templates: AgendaTemplate[]) => boolean; children: ReactNode }) {
  const { roles, templates, office } = useAuth()
  return allow(roles, templates) ? children : <Navigate to={homeFor(roles, templates, office)} replace />
}

function HomeGuard({ children }: { children: ReactNode }) {
  const { roles, templates, office } = useAuth()
  return hasHome(roles, office) ? children : <Navigate to={homeFor(roles, templates, office)} replace />
}

const booksForOthers = (roles: AppRole[]) => canSeeAppointments(roles) && canManageMeetings(roles)

const attendsAMeeting = (_: AppRole[], templates: AgendaTemplate[]) => canSeeAgenda(templates)

function AppRoutes() {
  const { loading, session, roles, templates, office, hasHours } = useAuth()
  if (loading) return <Loading />
  if (!session) return <LoginPage />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={homeFor(roles, templates, office, keepsHours(office) && !hasHours)} replace />} />
        <Route path="home" element={<HomeGuard><HomePage /></HomeGuard>} />
        <Route path="agenda" element={<Guard allow={attendsAMeeting}><AgendaPage /></Guard>} />
        <Route path="agenda/:slug" element={<Guard allow={attendsAMeeting}><AgendaPage /></Guard>} />
        <Route path="agenda/:slug/:date" element={<Guard allow={attendsAMeeting}><AgendaPage /></Guard>} />
        <Route path="sacrament" element={<Guard allow={isMember}><SacramentPage /></Guard>} />
        <Route path="appointments" element={<Guard allow={canSeeAppointments}><AppointmentsPage /></Guard>} />
        {/* Callings moved onto the bishopric agenda. */}
        <Route path="callings" element={<Navigate to="/agenda/bishopric" replace />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="reminders" element={<Guard allow={canSeeAppointments}><RemindersPage /></Guard>} />
        {/* Suggesting a name is now one kind of calling request. */}
        <Route path="suggest" element={<Navigate to="/requests?new=calling" replace />} />
        <Route element={<SettingsLayout />}>
          <Route path="hours" element={<Guard allow={canEditHours}><HoursPage /></Guard>} />
          <Route path="away" element={<Guard allow={isMember}><AwayPage /></Guard>} />
          <Route path="schedule" element={<Guard allow={isMember}><SchedulePage /></Guard>} />
          <Route path="meetings" element={<Guard allow={canManageMeetings}><MeetingsPage /></Guard>} />
          <Route path="calling-list" element={<Guard allow={canManageCallingList}><CallingListPage /></Guard>} />
          <Route path="access" element={<Guard allow={canManageAccess}><AccessPage /></Guard>} />
          <Route path="account" element={<AccountPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/lengths" element={<Guard allow={canSeeAppointments}><LengthsPage /></Guard>} />
          <Route path="settings/messages" element={<Guard allow={canSeeAppointments}><MessagesPage /></Guard>} />
          <Route path="settings/who-books" element={<Guard allow={booksForOthers}><WhoBooksPage /></Guard>} />
        </Route>
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
