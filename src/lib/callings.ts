import type { Tables } from './database.types'

/** An entry on the calling list: a title the Calling box suggests. */
export type ListedCalling = Pick<Tables<'callings'>, 'id' | 'title' | 'organization'>

/** The organizations the handbook list uses, in the order they're shown. */
export const ORGANIZATIONS = [
  'Bishopric',
  'Elders Quorum',
  'Relief Society',
  'Aaronic Priesthood',
  'Young Women',
  'Primary',
  'Sunday School',
  'Missionary',
  'Temple and Family History',
  'Music',
  'Other',
]

/** Titles the bishopric typed that joined the list without an organization, waiting for an admin. */
export const UNREVIEWED = 'Added by the ward'

export const groupOf = (c: Pick<ListedCalling, 'organization'>) => c.organization ?? UNREVIEWED

const rank = (group: string) => {
  if (group === UNREVIEWED) return ORGANIZATIONS.length + 1
  const i = ORGANIZATIONS.indexOf(group)
  // Organizations an admin typed in that aren't in the handbook list go just before the unreviewed ones.
  return i === -1 ? ORGANIZATIONS.length : i
}

/**
 * The list grouped by organization in handbook order, then any other organizations A–Z, then the
 * unreviewed titles. Titles are A–Z within each group.
 */
export function groupCallings(list: ListedCalling[]): { group: string; callings: ListedCalling[] }[] {
  const groups = new Map<string, ListedCalling[]>()
  for (const c of list) groups.set(groupOf(c), [...(groups.get(groupOf(c)) ?? []), c])
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([group, callings]) => ({ group, callings: callings.sort((a, b) => a.title.localeCompare(b.title)) }))
}

/** The list in display order, flattened for the picker. */
export const sortCallings = (list: ListedCalling[]) => groupCallings(list).flatMap((g) => g.callings)

/** Cleans up a typed title: trims it and collapses runs of spaces. */
export const tidyTitle = (title: string) => title.trim().replace(/\s+/g, ' ')

type NeedRef = { id: string; calling_id: string | null; calling_title: string }
type CandidateRef = { need_id: string | null; calling_title: string | null }
type Stewardship = { user_id: string; area: string }

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The organization a name's calling belongs to on the calling list, if it's there and has one. */
export function organizationFor(candidate: CandidateRef, needs: NeedRef[], list: ListedCalling[]): string | null {
  const need = candidate.need_id ? needs.find((n) => n.id === candidate.need_id) : undefined
  const listed = (need?.calling_id && list.find((c) => c.id === need.calling_id)) || list.find((c) => same(c.title, need?.calling_title ?? candidate.calling_title ?? ''))
  return listed?.organization ?? null
}

/**
 * Who meets with someone called in this organization: the one leader whose bishopric assignment
 * names it. None when no leader has it or more than one shares it, so the bishopric decides.
 */
export function coveringLeader(organization: string | null, stewardships: Stewardship[], leaderIds: string[]): string | null {
  if (!organization) return null
  const ids = new Set(stewardships.filter((s) => leaderIds.includes(s.user_id) && same(s.area, organization)).map((s) => s.user_id))
  return ids.size === 1 ? [...ids][0] : null
}
