// Sundays the bishop and counselors leave short-handed: all of them away, or only one left to
// conduct. Pure so the Away page, Home and the push notification can share it.

import { addDays, upcomingSunday, type IsoDate } from './dates'
import type { Absence } from './schedule'

/** Only who and when matter here. */
type Away = Pick<Absence, 'user_id' | 'starts_on' | 'ends_on'>

/** 'none': no one in the bishopric is there. 'one': only one of them is. */
export type ShortLevel = 'none' | 'one'
export type ShortSunday = { date: IsoDate; level: ShortLevel; awayIds: string[] }

/** Every Sunday from `from` through `to`, both included. */
export function sundaysBetween(from: IsoDate, to: IsoDate): IsoDate[] {
  const days: IsoDate[] = []
  for (let d = upcomingSunday(from); d <= to; d = addDays(d, 7)) days.push(d)
  return days
}

/**
 * The Sundays from `from` through `to` when all the leaders, or all but one, are away. With a
 * single leader set up there's no one to compare, so only "no one there" counts.
 */
export function shortSundays(from: IsoDate, to: IsoDate, leaderIds: string[], absences: Away[]): ShortSunday[] {
  if (!leaderIds.length) return []
  return sundaysBetween(from, to).flatMap((date): ShortSunday[] => {
    const away = new Set(absences.filter((a) => date >= a.starts_on && date <= a.ends_on).map((a) => a.user_id))
    const awayIds = leaderIds.filter((id) => away.has(id))
    const present = leaderIds.length - awayIds.length
    if (present === 0) return [{ date, level: 'none', awayIds }]
    if (present === 1 && leaderIds.length > 1) return [{ date, level: 'one', awayIds }]
    return []
  })
}

/** The worst of these Sundays: 'none' beats 'one'. */
export const worstLevel = (sundays: ShortSunday[]): ShortLevel | null =>
  sundays.some((s) => s.level === 'none') ? 'none' : sundays.length ? 'one' : null

/** The Sundays a new absence would leave short-handed, counting it with the ones already there. */
export function shortSundaysWith(draft: Away, leaderIds: string[], absences: Away[]): ShortSunday[] {
  if (!leaderIds.includes(draft.user_id) || !draft.starts_on || draft.ends_on < draft.starts_on) return []
  return shortSundays(draft.starts_on, draft.ends_on, leaderIds, [...absences, draft])
}
