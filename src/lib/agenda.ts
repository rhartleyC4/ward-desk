// Assembles the weekly bishopric agenda from the underlying tables, replacing the
// copy-a-new-tab-every-Sunday workflow. Pure functions so they can be unit tested.

import { addDays, shortDate, type IsoDate } from './dates'
import type { Enums, Tables } from './database.types'

export type Meeting = Pick<Tables<'meetings'>, 'id' | 'meeting_date' | 'meeting_type' | 'title' | 'conducting_id'>
export type ProgramItem = Pick<Tables<'program_items'>, 'meeting_id' | 'position' | 'kind' | 'person_name' | 'note'>
export type CallingNeed = Pick<Tables<'calling_needs'>, 'id' | 'calling_title' | 'release_name' | 'release_on' | 'status'>
export type Candidate = Pick<Tables<'calling_candidates'>, 'id' | 'need_id' | 'calling_title' | 'person_name' | 'status' | 'sustain_on'>
export type Interview = Pick<Tables<'interviews'>, 'interviewer_id' | 'scheduled_at' | 'person_name' | 'purpose' | 'status'>
export type AgendaItem = Pick<Tables<'agenda_items'>, 'id' | 'kind' | 'body' | 'event_date' | 'resolved_on' | 'created_at'>
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

/** Items still open on this date: created on or before it and not resolved before it. */
export function openItems(date: IsoDate, items: AgendaItem[], kind: Enums<'agenda_item_kind'>): AgendaItem[] {
  return items
    .filter((i) => i.kind === kind)
    .filter((i) => i.created_at.slice(0, 10) <= date && (!i.resolved_on || i.resolved_on >= date))
    .filter((i) => kind !== 'calendar' || !i.event_date || i.event_date >= date)
    .sort((a, b) => (a.event_date ?? a.created_at).localeCompare(b.event_date ?? b.created_at))
}

export type NeedRow = {
  need: CallingNeed
  candidates: Candidate[]
  approved: boolean
}

/** The "Callings Needed (to discuss)" table: open needs with their names to consider. */
export function callingsNeeded(needs: CallingNeed[], candidates: Candidate[]): NeedRow[] {
  return needs
    .filter((n) => n.status === 'open')
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

export function sustainingsOn(date: IsoDate, needs: CallingNeed[], candidates: Candidate[]): { name: string; calling: string }[] {
  return candidates
    .filter((c) => c.sustain_on === date && c.status !== 'declined')
    .map((c) => ({
      name: c.person_name,
      calling: needs.find((n) => n.id === c.need_id)?.calling_title ?? c.calling_title ?? '',
    }))
}

const PURPOSE_LABELS: Record<Enums<'interview_purpose'>, string> = {
  calling: 'calling',
  temple_recommend: 'temple recommend',
  ppi: 'PPI',
  youth: 'youth interview',
  tithing_declaration: 'tithing declaration',
  advancement: 'advancement',
  other: '',
}

export type InterviewGroup = { interviewerId: string | null; slots: { time: string; label: string }[] }

/** "Callings & Temple Recommend Interviews Scheduled", grouped by interviewer, in the ward's time zone. */
export function interviewsOn(date: IsoDate, interviews: Interview[], timeZone: string): InterviewGroup[] {
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })

  const groups = new Map<string | null, InterviewGroup>()
  for (const iv of [...interviews].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))) {
    if (iv.status === 'cancelled') continue
    const at = new Date(iv.scheduled_at)
    if (dayFmt.format(at) !== date) continue
    const purpose = PURPOSE_LABELS[iv.purpose]
    const label = [iv.person_name, purpose && `(${purpose})`].filter(Boolean).join(' ')
    const group = groups.get(iv.interviewer_id) ?? { interviewerId: iv.interviewer_id, slots: [] }
    group.slots.push({ time: timeFmt.format(at), label })
    groups.set(iv.interviewer_id, group)
  }
  return [...groups.values()]
}
