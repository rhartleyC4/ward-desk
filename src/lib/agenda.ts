// Assembles meeting agendas from the underlying tables, replacing the
// copy-a-new-tab-every-meeting workflow. Pure functions so they can be unit tested.

import { addDays, shortDate, type IsoDate } from './dates'
import type { Enums, Tables } from './database.types'

export type Meeting = Pick<Tables<'meetings'>, 'id' | 'meeting_date' | 'meeting_type' | 'title' | 'conducting_id'>
export type ProgramItem = Pick<Tables<'program_items'>, 'meeting_id' | 'position' | 'kind' | 'person_name' | 'note'>
export type CallingNeed = Pick<Tables<'calling_needs'>, 'id' | 'calling_title' | 'release_name' | 'release_on' | 'status'>
export type Candidate = Pick<Tables<'calling_candidates'>, 'id' | 'need_id' | 'calling_title' | 'person_name' | 'status' | 'sustain_on'>
export type AgendaItem = Pick<Tables<'agenda_items'>, 'id' | 'section_id' | 'body' | 'event_date' | 'resolved_on' | 'created_at'>
export type AgendaSection = Pick<Tables<'agenda_sections'>, 'id' | 'kind'>
export type Profile = Pick<Tables<'profiles'>, 'id' | 'display_name' | 'short_name'>

const TYPE_LABELS: Record<Enums<'meeting_type'>, string> = {
  regular: '',
  fast_sunday: 'FAST SUNDAY',
  stake_conference: 'STAKE CONFERENCE',
  general_conference: 'GENERAL CONFERENCE',
  ward_conference: 'WARD CONFERENCE',
  special_program: 'Special program',
}

export function personLabel(id: string | null, profiles: Profile[]): string {
  if (!id) return ''
  const p = profiles.find((x) => x.id === id)
  return p?.short_name ?? p?.display_name ?? ''
}

/** Program items in order, sorted by position. */
export function programFor<T extends ProgramItem>(meetingId: string, items: T[]): T[] {
  return items.filter((i) => i.meeting_id === meetingId).sort((a, b) => a.position - b.position)
}

/** One line of "Upcoming Sacrament Meetings": "11/8 (Ortiz) - Brother Cole, Sister Diaz". */
export function sacramentLine(meeting: Meeting, items: ProgramItem[], profiles: Profile[]): string {
  const who = personLabel(meeting.conducting_id, profiles)
  const head = who ? `${shortDate(meeting.meeting_date)} (${who})` : shortDate(meeting.meeting_date)

  if (meeting.meeting_type !== 'regular' && meeting.meeting_type !== 'special_program') {
    return `${head} - ${TYPE_LABELS[meeting.meeting_type]}`
  }
  if (meeting.meeting_type === 'special_program') {
    return `${head} - ${meeting.title ?? TYPE_LABELS.special_program}`
  }
  const speakers = programFor(meeting.id, items)
    .filter((i) => i.kind === 'talk' && i.person_name)
    .map((i) => (i.note ? `${i.person_name} (${i.note})` : i.person_name))
  return `${head} - ${speakers.length ? speakers.join(', ') : 'Speakers needed'}`
}

/** Meetings from this Sunday through the next `weeks` Sundays. */
export function upcomingMeetings(date: IsoDate, meetings: Meeting[], weeks = 9): Meeting[] {
  const end = addDays(date, weeks * 7)
  return meetings
    .filter((m) => m.meeting_date >= date && m.meeting_date <= end)
    .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))
}

/** A section's items still open on this date: created on or before it and not resolved before it. */
export function openItems(date: IsoDate, items: AgendaItem[], section: AgendaSection): AgendaItem[] {
  return items
    .filter((i) => i.section_id === section.id)
    .filter((i) => i.created_at.slice(0, 10) <= date && (!i.resolved_on || i.resolved_on >= date))
    .filter((i) => section.kind !== 'calendar' || !i.event_date || i.event_date >= date)
    .sort((a, b) => (a.event_date ?? a.created_at).localeCompare(b.event_date ?? b.created_at))
}

export type NeedRow = {
  need: CallingNeed
  candidates: Candidate[]
  approved: boolean
}

const DECIDED: Candidate['status'][] = ['accepted', 'sustained', 'set_apart']

/**
 * Open needs still being discussed on this date. Once someone accepts, the need moves to
 * Sustainings (and its release to Releases) on their sustain date and drops off from then on.
 * An accepted name with no sustain date stays so someone notices and sets one.
 */
export function needsToDiscuss<T extends CallingNeed>(date: IsoDate, needs: T[], candidates: Candidate[]): T[] {
  return needs.filter(
    (n) => n.status === 'open' && !candidates.some((c) => c.need_id === n.id && DECIDED.includes(c.status) && c.sustain_on && c.sustain_on <= date),
  )
}

/** The "Callings Needed (to discuss)" table: needs still being discussed with their names to consider. */
export function callingsNeeded(date: IsoDate, needs: CallingNeed[], candidates: Candidate[]): NeedRow[] {
  return needsToDiscuss(date, needs, candidates)
    .map((need) => {
      const forNeed = candidates.filter((c) => c.need_id === need.id && c.status !== 'declined')
      const approved = forNeed.some((c) => ['approved', 'extended', 'accepted', 'sustained', 'set_apart'].includes(c.status))
      return { need, candidates: forNeed, approved }
    })
}

/** Names submitted by called leaders that haven't been attached to a need yet. */
export function unsortedSuggestions<T extends Candidate>(candidates: T[]): T[] {
  return candidates.filter((c) => c.need_id == null && c.status === 'suggested')
}

export function releasesOn(date: IsoDate, needs: CallingNeed[]): CallingNeed[] {
  return needs.filter((n) => n.release_on === date && n.release_name)
}

export function sustainingsOn(date: IsoDate, needs: CallingNeed[], candidates: Candidate[]): { id: string; name: string; calling: string }[] {
  return candidates
    .filter((c) => c.sustain_on === date && c.status !== 'declined')
    .map((c) => ({
      id: c.id,
      name: c.person_name,
      calling: needs.find((n) => n.id === c.need_id)?.calling_title ?? c.calling_title ?? '',
    }))
}

/** What each section kind shows, for the meeting setup page. 'interviews' is retired; the database refuses it. */
export const SECTION_KINDS: Record<Exclude<Enums<'agenda_section_kind'>, 'interviews'>, string> = {
  items: 'Items (carried forward until done)',
  calendar: 'Calendar (dated items)',
  assignments: 'Assignments due this month',
  sacrament: 'Upcoming sacrament meetings',
  callings: 'Callings needed',
  follow_ups: 'Follow-ups (open requests)',
  releases: 'Releases that day',
  sustainings: 'Sustainings that day',
  prayer_roll: 'Prayer roll',
  closing_prayer: 'Closing prayer',
}

/** A URL slug from a meeting name, made unique among the slugs already taken. */
export function slugFor(name: string, taken: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'meeting'
  let slug = base
  for (let n = 2; taken.includes(slug); n++) slug = `${base}-${n}`
  return slug
}

/** The ids in a new order after moving one up or down a place. */
export function moveId(ids: string[], id: string, by: -1 | 1): string[] {
  const from = ids.indexOf(id)
  const to = from + by
  if (from < 0 || to < 0 || to >= ids.length) return ids
  const next = [...ids]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}
