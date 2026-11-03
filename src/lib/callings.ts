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
