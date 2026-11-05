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
export const canSuggest = (roles: AppRole[]) => roles.includes('leader') || roles.includes('bishopric')
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

export function navFor(roles: AppRole[], templates: readonly unknown[] = [], office: Office = null): NavLink[] {
  const links: NavLink[] = []
  if (hasHome(roles, office)) links.push({ to: '/home', label: 'Home' })
  if (canSeeAgenda(templates)) links.push({ to: '/agenda', label: 'Agenda' })
  if (isMember(roles)) links.push({ to: '/sacrament', label: 'Sacrament' })
  if (canSeeAppointments(roles)) links.push({ to: '/appointments', label: 'Appointments' })
  if (canEditHours(roles)) links.push({ to: '/hours', label: 'Hours' })
  if (canSuggest(roles) && !canSeeCallings(roles)) links.push({ to: '/suggest', label: 'Suggest a name' })
  if (isMember(roles)) links.push({ to: '/away', label: 'Away' }, { to: '/schedule', label: 'Schedule' })
  if (canManageMeetings(roles)) links.push({ to: '/meetings', label: 'Meetings' })
  if (canManageCallingList(roles)) links.push({ to: '/calling-list', label: 'Calling list' })
  if (canManageAccess(roles)) links.push({ to: '/access', label: 'Access' })
  return links
}

/** Where to land after sign-in. A bishop or counselor who hasn't set appointment hours is asked to first. */
export function homeFor(roles: AppRole[], templates: readonly unknown[] = [], office: Office = null, needsHours = false): string {
  if (needsHours && canEditHours(roles)) return '/hours'
  return navFor(roles, templates, office)[0]?.to ?? '/no-access'
}
