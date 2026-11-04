// Dates are handled as ISO "YYYY-MM-DD" strings (Postgres `date`), computed in UTC so the
// day never shifts with the viewer's time zone.

export type IsoDate = string

const DAY_MS = 86_400_000

export function parseIso(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10)
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIso(new Date(parseIso(date).getTime() + days * DAY_MS))
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(date: IsoDate): number {
  return parseIso(date).getUTCDay()
}

/** Which occurrence of its weekday this date is within the month: 1 for "First Sunday", 5 for "Fifth Sunday". */
export function weekOfMonth(date: IsoDate): number {
  return Math.ceil(parseIso(date).getUTCDate() / 7)
}

/** 1-12 */
export function monthOf(date: IsoDate): number {
  return parseIso(date).getUTCMonth() + 1
}

/** The given date if it is a Sunday, otherwise the following Sunday. */
export function upcomingSunday(date: IsoDate): IsoDate {
  return addDays(date, (7 - weekday(date)) % 7)
}

/**
 * The Sunday someone who accepts today is sustained (and the person they replace released):
 * today if it's Sunday, since an appointment can come just before sacrament meeting, otherwise
 * the coming Sunday. The bishopric can move it.
 */
export function sustainingSunday(today: IsoDate): IsoDate {
  return upcomingSunday(today)
}

export function sundaysFrom(start: IsoDate, count: number): IsoDate[] {
  const first = upcomingSunday(start)
  return Array.from({ length: count }, (_, i) => addDays(first, i * 7))
}

/** "11/8" as the agenda writes it. */
export function shortDate(date: IsoDate): string {
  const d = parseIso(date)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'
  return `${n}${suffix}`
}

/** "November 1st", matching the weekly agenda tab names. */
export function longDate(date: IsoDate): string {
  const d = parseIso(date)
  return `${MONTHS[d.getUTCMonth()]} ${ordinal(d.getUTCDate())}`
}

export function isBetween(date: IsoDate, start: IsoDate, end: IsoDate): boolean {
  return date >= start && date <= end
}

/** Whole days from one date to a later one. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / DAY_MS)
}
