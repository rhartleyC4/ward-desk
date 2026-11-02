// UI-side mirror of the RLS rules in supabase/migrations. The database is the real gate;
// these only decide what to show.

import type { Enums } from './database.types'

export type AppRole = Enums<'app_role'>

export const canSeeCallings = (roles: AppRole[]) => roles.includes('bishopric')
export const canSeeAgenda = (roles: AppRole[]) => roles.includes('bishopric')
export const canPlanMeetings = (roles: AppRole[]) => roles.includes('bishopric')
export const canSuggest = (roles: AppRole[]) => roles.includes('leader') || roles.includes('bishopric')
export const canEditSchedule = (roles: AppRole[]) => roles.includes('bishopric') || roles.includes('admin')
/** Called leaders only submit names; everyone else with a role sees the ward calendar pages. */
export const isMember = (roles: AppRole[]) => roles.some((r) => r !== 'leader')

export type NavLink = { to: string; label: string }

export function navFor(roles: AppRole[]): NavLink[] {
  const links: NavLink[] = []
  if (canSeeAgenda(roles)) links.push({ to: '/agenda', label: 'Agenda' })
  if (isMember(roles)) links.push({ to: '/sacrament', label: 'Sacrament' })
  if (canSeeCallings(roles)) links.push({ to: '/callings', label: 'Callings' })
  if (canSuggest(roles) && !canSeeCallings(roles)) links.push({ to: '/suggest', label: 'Suggest a name' })
  if (isMember(roles)) links.push({ to: '/away', label: 'Away' }, { to: '/schedule', label: 'Schedule' })
  return links
}

/** Where to land after sign-in. */
export function homeFor(roles: AppRole[]): string {
  return navFor(roles)[0]?.to ?? '/no-access'
}
