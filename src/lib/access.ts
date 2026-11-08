// UI-side mirror of the RLS rules in supabase/migrations. The database is the real gate;
// these only decide what to show.

import type { Enums } from './database.types'

export type AppRole = Enums<'app_role'>

/** Callings are worked on the bishopric agenda; this decides whether they're editable there. */
export const canSeeCallings = (roles: AppRole[]) => roles.includes('bishopric')
/** Appointments sit with interviews, which RLS limits to the bishopric. */
export const canSeeAppointments = (roles: AppRole[]) => roles.includes('bishopric')
/** Agendas follow attendance, not roles: RLS returns only the templates someone may open. */
export const canSeeAgenda = (templates: readonly unknown[]) => templates.length > 0
export const canPlanMeetings = (roles: AppRole[]) => roles.includes('bishopric')
/** Ask someone to do something. Matches the insert policy on requests. */
export const canSendRequests = (roles: AppRole[]) => roles.includes('bishopric')
/** Ward leaders ask the bishopric for calling changes; the bishopric adds callings to fill directly. */
export const canAskForCallings = (roles: AppRole[]) => roles.includes('leader') && !roles.includes('bishopric')
export const canEditSchedule = (roles: AppRole[]) => roles.includes('bishopric') || roles.includes('admin')
/** Set appointment hours, your own or (for secretaries) a leader's. Matches can_manage_meetings() on the hours tables. */
export const canEditHours = (roles: AppRole[]) => roles.includes('bishopric') || roles.includes('admin')
/** Create meetings, edit their sections and choose attendees. Matches can_manage_meetings() in the database. */
export const canManageMeetings = (roles: AppRole[]) => roles.includes('bishopric') || roles.includes('admin')
/** Decide who may sign in and with which roles. Matches the allowlist RLS policy. */
export const canManageAccess = (roles: AppRole[]) => roles.includes('admin')
/** Tidy the titles the Calling box suggests. RLS also lets the bishopric add to the list as they use new titles. */
export const canManageCallingList = (roles: AppRole[]) => roles.includes('admin')
/** Called leaders only submit names; everyone else with a role sees the ward calendar pages. */
export const isMember = (roles: AppRole[]) => roles.some((r) => r !== 'leader')

type Office = Enums<'bishopric_office'> | null

/** The offices that schedule appointments for the bishop and counselors. */
export const SECRETARY_OFFICES: Enums<'bishopric_office'>[] = ['executive_secretary', 'assistant_executive_secretary']
export const isSecretaryOffice = (office: Office) => !!office && SECRETARY_OFFICES.includes(office)

/** The executive secretaries' home: who needs an appointment, open times, and the week ahead. */
export const hasSecretaryHome = (roles: AppRole[], office: Office) => isSecretaryOffice(office) && canSeeAppointments(roles)

/** The offices that hold interviews themselves. */
export const LEADER_OFFICES: Enums<'bishopric_office'>[] = ['bishop', 'first_counselor', 'second_counselor']

/** The bishop's and counselors' home: their day, quick actions, and the week ahead. */
export const hasBishopricHome = (roles: AppRole[], office: Office) => !!office && LEADER_OFFICES.includes(office) && canSeeAppointments(roles)

/** Whether this person has a Home screen of either kind. */
export const hasHome = (roles: AppRole[], office: Office) => hasSecretaryHome(roles, office) || hasBishopricHome(roles, office)

export type NavLink = { to: string; label: string }

/**
 * The everyday tabs. Things set up once (hours, meetings, the calling list, access) live in
 * Settings instead, so the tab bar stays short.
 */
export function navFor(roles: AppRole[], templates: readonly unknown[] = [], office: Office = null): NavLink[] {
  const links: NavLink[] = []
  if (hasHome(roles, office)) links.push({ to: '/home', label: 'Home' })
  if (canSeeAgenda(templates)) links.push({ to: '/agenda', label: 'Meetings' })
  if (isMember(roles)) links.push({ to: '/sacrament', label: 'Sacrament' })
  if (canSeeAppointments(roles)) links.push({ to: '/appointments', label: 'Appointments' })
  // Anyone can be sent a request, so everyone with a role has the tab.
  if (roles.length) links.push({ to: '/requests', label: 'Requests' })
  return links
}

export type SettingsIcon = 'away' | 'hours' | 'lengths' | 'messages' | 'whoBooks' | 'agendas' | 'schedule' | 'callingList' | 'access'
export type SettingsLink = NavLink & { hint: string; icon: SettingsIcon }
export type SettingsGroup = { title: string; links: SettingsLink[] }

/** Settings, grouped by what they're about. Each person sees only what their role can change. */
export function settingsFor(roles: AppRole[], office: Office = null): SettingsGroup[] {
  const you: SettingsLink[] = []
  if (isMember(roles)) you.push({ to: '/away', label: "Dates I'll be away", hint: 'Taken out of your appointment hours', icon: 'away' })

  const appointments: SettingsLink[] = []
  if (canEditHours(roles)) appointments.push({ to: '/hours', label: 'Appointment hours', hint: keepsHoursOffice(office) ? 'When you can meet' : 'When each leader can meet', icon: 'hours' })
  if (canSeeAppointments(roles)) {
    appointments.push(
      { to: '/settings/lengths', label: 'Usual lengths', hint: 'How long each kind of interview takes', icon: 'lengths' },
      { to: '/settings/messages', label: 'Message templates', hint: 'The texts and emails you send', icon: 'messages' },
    )
  }
  if (canSeeAppointments(roles) && canManageMeetings(roles)) appointments.push({ to: '/settings/who-books', label: 'Who books for whom', hint: 'Which secretary schedules each leader', icon: 'whoBooks' })

  const meetings: SettingsLink[] = []
  if (canManageMeetings(roles)) meetings.push({ to: '/meetings', label: 'Agendas', hint: 'Sections and who attends', icon: 'agendas' })
  if (isMember(roles)) meetings.push({ to: '/schedule', label: 'Standing schedule', hint: 'Regular meetings, rotations, assignments', icon: 'schedule' })
  if (canManageCallingList(roles)) meetings.push({ to: '/calling-list', label: 'Calling list', hint: "The ward's callings", icon: 'callingList' })

  const ward: SettingsLink[] = []
  if (canManageAccess(roles)) ward.push({ to: '/access', label: 'Who can sign in', hint: 'People, roles and positions', icon: 'access' })

  return [
    { title: 'You', links: you },
    { title: 'Appointments', links: appointments },
    { title: 'Meetings', links: meetings },
    { title: 'Ward', links: ward },
  ].filter((g) => g.links.length > 0)
}

/** Pages opened from Settings, which show a way back to it. */
export const SETTINGS_PAGES = ['/account', '/away', '/hours', '/schedule', '/meetings', '/calling-list', '/access', '/settings/']

export const isSettingsPage = (pathname: string) => pathname === '/settings' || SETTINGS_PAGES.some((p) => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p))

/**
 * Where the top-left back button goes: wherever sent us here, else Settings for a page opened from
 * it. With the Settings list showing beside the page (settingsBeside), a button back to it would go
 * nowhere new. Someone with a single tab has no tab bar, so off that tab the button leads back to it.
 */
export function backFor(pathname: string, links: NavLink[], { sent, settingsBeside = false }: { sent?: NavLink | null; settingsBeside?: boolean } = {}): NavLink | null {
  const back = sent ?? (pathname !== '/settings' && isSettingsPage(pathname) ? { to: '/settings', label: 'Settings' } : null)
  if (back && !(settingsBeside && back.to === '/settings')) return back
  const [only] = links
  const onIt = !!only && (pathname === only.to || pathname.startsWith(`${only.to}/`))
  return links.length === 1 && !onIt ? only : null
}

const keepsHoursOffice = (office: Office) => !!office && LEADER_OFFICES.includes(office)

/** Where to land after sign-in. A bishop or counselor who hasn't set appointment hours is asked to first. */
export function homeFor(roles: AppRole[], templates: readonly unknown[] = [], office: Office = null, needsHours = false): string {
  if (needsHours && canEditHours(roles)) return '/hours'
  return navFor(roles, templates, office)[0]?.to ?? '/no-access'
}
