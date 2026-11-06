// Lays Ward Desk's data out the way the bishopric's Google Sheets were: Sacrament, Bishopric
// Schedule and Travel tabs, and one tab per meeting. Pure, so tests can check it with invented data
// and read it back with the import's parser. export.ts loads the data and writes the .xlsx files.

import { callingsNeeded, openItems, personLabel, releasesOn, sacramentLine, sustainingsOn, upcomingMeetings } from '../../src/lib/agenda'
import { addDays, longDate, shortDate, upcomingSunday, weekday, type IsoDate } from '../../src/lib/dates'
import { followUps, requestStatusLine, type Request } from '../../src/lib/requests'
import { formatTime, hasDay, meetsOn, nextMeeting, rotationDayLabel, rotationsDue, type RecurringEvent, type Rotation } from '../../src/lib/schedule'
import type { Enums } from '../../src/lib/database.types'
import { columnLetter, parseMonthDay, type Cell } from '../import-sheets/parse'

export interface ExportProfile {
  id: string
  display_name: string | null
  short_name: string | null
  office: Enums<'bishopric_office'> | null
}

export interface ExportMeeting {
  id: string
  meeting_date: IsoDate
  meeting_type: Enums<'meeting_type'>
  title: string | null
  presiding: string | null
  conducting_id: string | null
  opening_hymn: number | null
  sacrament_hymn: number | null
  closing_hymn: number | null
  invocation: string | null
  benediction: string | null
}

export interface ExportProgramItem {
  meeting_id: string
  position: number
  kind: Enums<'program_item_kind'>
  person_name: string | null
  note: string | null
}

export interface ExportSection {
  id: string
  position: number
  kind: Enums<'agenda_section_kind'>
  title: string
}

export interface ExportTemplate {
  id: string
  slug: string
  name: string
  weekday: number
  weeks_of_month: number[] | null
  start_time: string | null
  sections: ExportSection[]
}

export interface ExportData {
  profiles: ExportProfile[]
  bishopricIds: string[]
  meetings: ExportMeeting[]
  programItems: ExportProgramItem[]
  absences: { user_id: string; starts_on: IsoDate; ends_on: IsoDate; location: string | null }[]
  templates: ExportTemplate[]
  agendas: { template_id: string; meeting_date: IsoDate; start_time: string | null; opening_prayer: string | null; spiritual_thought: string | null; closing_prayer: string | null }[]
  agendaItems: { id: string; section_id: string; body: string; event_date: IsoDate | null; resolved_on: IsoDate | null; created_at: string }[]
  needs: { id: string; calling_title: string; release_name: string | null; release_on: IsoDate | null; status: Enums<'need_status'>; notes: string | null }[]
  candidates: { id: string; need_id: string | null; calling_title: string | null; person_name: string; status: Enums<'candidate_status'>; sustain_on: IsoDate | null; notes: string | null }[]
  prayerRoll: { name: string; added_on: IsoDate; removed_on: IsoDate | null }[]
  rotations: Rotation[]
  recurringEvents: RecurringEvent[]
  stewardships: { user_id: string; area: string; notes: string | null }[]
  requests: Pick<Request, 'id' | 'from_id' | 'to_id' | 'title' | 'status' | 'due_on' | 'reply' | 'closed_at' | 'created_at'>[]
}

export interface Tab {
  name: string
  rows: Cell[][]
  /** Column widths in characters, from column A. */
  widths: number[]
  /** Ranges like "B4:N4". */
  merges: string[]
  /** Rows to keep in view at the top. */
  frozenRows?: number
}

export interface Workbook {
  /** Which sheet this stands in for: 'bishopric', 'ward-council' or another meeting's slug. */
  slug: string
  title: string
  tabs: Tab[]
}

export interface Range {
  /** First date to include; null for everything. */
  from: IsoDate | null
  today: IsoDate
}

const GRAY = 'FFCCCCCC'
const YELLOW = 'FFFFFF00'
const SECTION_GRAY = 'FF999999'
const SUNDAY = 'FFFFF2CC'
/** How far ahead the Sacrament and Travel tabs reach, like the agenda's upcoming meetings list. */
const AHEAD_DAYS = 9 * 7

const text = (value: string | number | Date | null, extra: Omit<Cell, 'value'> = {}): Cell => ({ value, ...extra })
const bold = (value: string): Cell => ({ value, bold: true })
const blank: Cell = { value: null }

/** A date as a spreadsheet date cell (midnight UTC, which the writer stores as that day). */
const dateCell = (date: IsoDate): Cell => ({ value: new Date(`${date}T00:00:00Z`) })

function earliest(dates: (IsoDate | null | undefined)[], fallback: IsoDate): IsoDate {
  return dates.filter((d): d is IsoDate => Boolean(d)).sort()[0] ?? fallback
}

function latest(dates: (IsoDate | null | undefined)[], fallback: IsoDate): IsoDate {
  return [fallback, ...dates.filter((d): d is IsoDate => Boolean(d))].sort().at(-1)!
}

// ---------------------------------------------------------------------------
// Sacrament tab: one row per Sunday
// ---------------------------------------------------------------------------

const CONFERENCE_LABELS: Partial<Record<Enums<'meeting_type'>, string>> = {
  stake_conference: 'Stake Conference',
  general_conference: 'General Conference',
  ward_conference: 'Ward Conference',
}

export function sacramentTab(data: ExportData, range: Range): Tab {
  const from = range.from ?? earliest(data.meetings.map((m) => m.meeting_date), range.today)
  const to = latest(data.meetings.map((m) => m.meeting_date), addDays(range.today, AHEAD_DAYS))
  const talks = (m: ExportMeeting) =>
    data.programItems
      .filter((p) => p.meeting_id === m.id && p.kind === 'talk' && p.person_name)
      .sort((a, b) => a.position - b.position)
      .map((p) => (p.note ? `${p.person_name} (${p.note})` : p.person_name!))
  const meetings = data.meetings.filter((m) => m.meeting_date >= from && m.meeting_date <= to)
  const speakerCount = Math.max(6, ...meetings.map((m) => talks(m).length + 1))

  const headers = ['Date', 'Presiding', 'Conducting', 'Opening Hymn', 'Invocation', 'Sacrament Hymn', ...Array.from({ length: speakerCount }, (_, i) => `Speaker ${i + 1}`), 'Closing Hymn', 'Benediction']
  const lastCol = headers.length
  const rows: Cell[][] = [headers.map(bold)]
  const merges: string[] = []

  for (let sunday = upcomingSunday(from); sunday <= to; sunday = addDays(sunday, 7)) {
    const m = meetings.find((x) => x.meeting_date === sunday)
    const row: Cell[] = [dateCell(sunday)]
    rows.push(row)
    if (!m) continue

    const conducting = personLabel(m.conducting_id, data.profiles) || null
    const label = CONFERENCE_LABELS[m.meeting_type]
    // A conference with nothing else planned is one gray label across the row, as on the sheet.
    if (label && !conducting && !talks(m).length) {
      row.push({ value: label, bold: true, fill: GRAY })
      merges.push(`B${rows.length}:${columnLetter(lastCol)}${rows.length}`)
      continue
    }

    const speakers: Cell[] = []
    if (m.meeting_type === 'fast_sunday') speakers.push({ value: 'Fast Sunday', fill: GRAY })
    else if (m.meeting_type === 'special_program') speakers.push({ value: m.title ?? 'Special program', fill: GRAY })
    else if (label) speakers.push(text(label))
    speakers.push(...talks(m).map((t) => text(t)))
    while (speakers.length < speakerCount) speakers.push(blank)

    row.push(text(m.presiding), text(conducting), text(m.opening_hymn), text(m.invocation), text(m.sacrament_hymn), ...speakers, text(m.closing_hymn), text(m.benediction))
  }
  return { name: 'Sacrament', rows, widths: [11, 12, 12, 9, 18, 9, ...Array(speakerCount).fill(20), 9, 18], merges, frozenRows: 1 }
}

// ---------------------------------------------------------------------------
// Travel tab: one row per day, one column per person
// ---------------------------------------------------------------------------

const OFFICE_ORDER: (Enums<'bishopric_office'> | null)[] = ['bishop', 'first_counselor', 'second_counselor', 'executive_secretary', 'assistant_executive_secretary', 'ward_clerk']

export function travelTab(data: ExportData, range: Range): Tab {
  const from = range.from ?? earliest(data.absences.map((a) => a.starts_on), range.today)
  const to = latest(data.absences.map((a) => a.ends_on), addDays(range.today, AHEAD_DAYS))
  const absences = data.absences.filter((a) => a.ends_on >= from && a.starts_on <= to)
  const ids = new Set([...data.bishopricIds, ...absences.map((a) => a.user_id)])
  const rank = (p: ExportProfile) => {
    const i = OFFICE_ORDER.indexOf(p.office)
    return i < 0 ? OFFICE_ORDER.length : i
  }
  const people = data.profiles
    .filter((p) => ids.has(p.id))
    .sort((a, b) => rank(a) - rank(b) || personLabel(a.id, data.profiles).localeCompare(personLabel(b.id, data.profiles)))

  const rows: Cell[][] = [[bold('Date'), bold('Event'), ...people.map((p) => bold(personLabel(p.id, data.profiles) || 'Unnamed'))]]
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const row: Cell[] = [dateCell(day), weekday(day) === 0 ? { value: 'Sunday', bold: true, fill: SUNDAY } : blank]
    for (const p of people) {
      const away = absences.filter((a) => a.user_id === p.id && a.starts_on <= day && a.ends_on >= day)
      row.push(away.length ? text([...new Set(away.map((a) => a.location || 'X'))].join('; ')) : blank)
    }
    rows.push(row)
  }
  return { name: 'Travel', rows, widths: [11, 14, ...people.map(() => 14)], merges: [], frozenRows: 1 }
}

// ---------------------------------------------------------------------------
// Bishopric Schedule tab: standing meetings, rotations and stewardships
// ---------------------------------------------------------------------------

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKS = ['First', 'Second', 'Third', 'Fourth', 'Fifth']
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT_MONTHS = FULL_MONTHS.map((m) => m.slice(0, 3))
const ASSIGNMENTS_GRAY = 'FFB7B7B7'

const byTime = (a: RecurringEvent, b: RecurringEvent) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99')
const eventLabel = (e: RecurringEvent) => (e.start_time ? `${formatTime(e.start_time)} ${e.title}` : e.title)
const monthList = (months: number[], names: string[]) => [...months].sort((a, b) => a - b).map((m) => names[m - 1]).join(', ')

export function scheduleTab(data: ExportData): Tab {
  const rows: Cell[][] = []

  // "First Sunday - 8:30 Bishopric meeting, 9:15 Welfare meeting", one line per week of the month.
  const sunday = data.recurringEvents.filter((e) => e.weekday === 0)
  if (sunday.length) {
    WEEKS.forEach((week, i) => {
      const events = sunday.filter((e) => e.week_of_month == null || e.week_of_month === i + 1).sort(byTime)
      if (events.length) rows.push([text(`${week} Sunday - ${events.map(eventLabel).join(', ')}`)])
    })
    rows.push([])
  }

  // Rotations with no set day, such as PPIs: "Elders Quorum President - Feb, Jun, Oct".
  const anyDay = data.rotations.filter((r) => !hasDay(r))
  const ppis = anyDay.filter((r) => /^ppis?\s*:/i.test(r.title))
  if (ppis.length) {
    rows.push([text('PPIs')])
    for (const r of ppis) rows.push([text(`${r.title.replace(/^ppis?\s*:\s*/i, '')} - ${monthList(r.months, SHORT_MONTHS)}`)])
  }
  for (const r of anyDay.filter((x) => !ppis.includes(x))) rows.push([text(`${r.title} - ${monthList(r.months, SHORT_MONTHS)}`)])
  if (anyDay.length) rows.push([])

  // Other days of the week: "Tuesday - Youth activities".
  const weekdays = data.recurringEvents.filter((e) => e.weekday !== 0).sort((a, b) => a.weekday - b.weekday || byTime(a, b))
  for (const e of weekdays) {
    const when = e.week_of_month ? `${WEEKS[e.week_of_month - 1]} ${DAYS[e.weekday]}` : DAYS[e.weekday]
    rows.push([text(`${when} - ${eventLabel(e)}`)])
  }
  if (weekdays.length) rows.push([])

  // Rotations on a set day, as a small table: "Primary message (3rd Sunday) | Bishop | January, April".
  const titles = [...new Set(data.rotations.filter(hasDay).map((r) => r.title))]
  for (const title of titles) {
    data.rotations
      .filter((r) => hasDay(r) && r.title === title)
      .forEach((r, i) => {
        const person = r.assignee_id ? personLabel(r.assignee_id, data.profiles) : r.assignee_label
        rows.push([text(i === 0 ? `${title} (${rotationDayLabel(r)})` : null), text(person || null), text(monthList(r.months, FULL_MONTHS))])
      })
  }
  if (titles.length) rows.push([])

  // Each leader's stewardships under BISHOPRIC ASSIGNMENTS.
  const rank = (id: string) => {
    const i = OFFICE_ORDER.indexOf(data.profiles.find((p) => p.id === id)?.office ?? null)
    return i < 0 ? OFFICE_ORDER.length : i
  }
  const leaders = [...new Set(data.stewardships.map((s) => s.user_id))].sort((a, b) => rank(a) - rank(b))
  if (leaders.length) {
    rows.push([{ value: 'BISHOPRIC ASSIGNMENTS', bold: true, fill: ASSIGNMENTS_GRAY }, ...Array.from({ length: 3 }, () => ({ value: null, fill: ASSIGNMENTS_GRAY }))])
    rows.push([])
    for (const id of leaders) {
      const name = data.profiles.find((p) => p.id === id)?.display_name || personLabel(id, data.profiles) || 'Unnamed'
      rows.push([bold(`${name}:`)])
      for (const s of data.stewardships.filter((x) => x.user_id === id)) rows.push([text(`*${s.area}${s.notes ? ` (${s.notes})` : ''}`)])
      rows.push([])
    }
  }
  return { name: 'Bishopric Schedule', rows, widths: [60, 14, 40, 10], merges: [] }
}

// ---------------------------------------------------------------------------
// Weekly agenda tabs
// ---------------------------------------------------------------------------

/** The meeting dates to export for a template, newest first: its pattern plus any saved agenda. */
export function agendaDates(template: ExportTemplate, data: ExportData, range: Range): IsoDate[] {
  const saved = data.agendas.filter((a) => a.template_id === template.id).map((a) => a.meeting_date)
  const sectionIds = new Set(template.sections.map((s) => s.id))
  const firstItem = data.agendaItems.filter((i) => sectionIds.has(i.section_id)).map((i) => i.created_at.slice(0, 10))
  const from = range.from ?? earliest([...saved, ...firstItem], range.today)
  const to = nextMeeting(template, range.today)
  const dates = new Set(saved.filter((d) => d >= from && d <= to))
  for (let d = from; d <= to; d = addDays(d, 1)) if (meetsOn(template, d)) dates.add(d)
  return [...dates].sort().reverse()
}

/** "Ward Bishopric Meeting Agenda", "Ward Council Meeting Agenda". */
export function agendaTitle(name: string): string {
  const ward = /^ward\b/i.test(name) ? name : `Ward ${name}`
  return `${/\bmeeting\b/i.test(ward) ? ward : `${ward} Meeting`} Agenda`
}

/** A calendar line, with its date in front when the text doesn't start with one. */
function calendarLine(body: string, eventDate: IsoDate | null): string {
  return eventDate && !parseMonthDay(body) ? `${shortDate(eventDate)} - ${body}` : body
}

const STATUS_MARKS: Partial<Record<Enums<'candidate_status'>, [boolean, boolean, boolean]>> = {
  approved: [true, false, false],
  accepted: [true, true, false],
  sustained: [true, true, true],
  set_apart: [true, true, true],
}

export function agendaTab(template: ExportTemplate, date: IsoDate, data: ExportData): Tab {
  const agenda = data.agendas.find((a) => a.template_id === template.id && a.meeting_date === date)
  const fill = template.slug === 'bishopric' ? YELLOW : SECTION_GRAY
  const time = formatTime(agenda?.start_time ?? template.start_time)
  const rows: Cell[][] = [
    [bold(agendaTitle(template.name))],
    [bold(`Date: ${longDate(date)}${time ? ` - ${time}` : ''}`)],
    [],
    [bold(`Opening Prayer: ${agenda?.opening_prayer ?? ''}`.trim())],
    [bold(`Spiritual Thought: ${agenda?.spiritual_thought ?? ''}`.trim())],
    [],
  ]
  const header = (title: string) => rows.push([{ value: `${title}:`, bold: true, fill }, ...Array.from({ length: 4 }, () => ({ value: null, fill }))])
  const lines = (items: string[]) => items.forEach((s) => rows.push([text(s)]))
  const fullName = (id: string) => data.profiles.find((p) => p.id === id)?.display_name || personLabel(id, data.profiles) || 'someone'

  for (const section of [...template.sections].sort((a, b) => a.position - b.position)) {
    switch (section.kind) {
      case 'items':
      case 'calendar': {
        header(section.title)
        const items = openItems(date, data.agendaItems, section)
        lines(items.map((i) => (section.kind === 'calendar' ? calendarLine(i.body, i.event_date) : i.body)))
        break
      }
      case 'follow_ups':
        header(section.title)
        lines(
          followUps(date, data.requests).map((r) =>
            [`${r.title} — ${fullName(r.from_id)} asked ${fullName(r.to_id)}`, requestStatusLine(r, date), r.reply && `“${r.reply}”`].filter(Boolean).join(' · '),
          ),
        )
        break
      case 'assignments':
        header(section.title)
        lines(
          rotationsDue(date, data.rotations).map((r) => {
            const title = rotationDayLabel(r) ? `${r.title} (${rotationDayLabel(r)})` : r.title
            const person = r.assignee_id ? personLabel(r.assignee_id, data.profiles) : r.assignee_label
            return person ? `${title} — ${person}` : title
          }),
        )
        break
      case 'sacrament':
        header(section.title)
        lines(upcomingMeetings(date, data.meetings).map((m) => sacramentLine(m, data.programItems, data.profiles)))
        break
      case 'callings': {
        header(section.title)
        rows.push(['Calling', 'Release', 'Names to Consider', 'Appr?', 'Called?', 'Sust?', 'Notes'].map(bold))
        for (const { need, candidates } of callingsNeeded(date, data.needs, data.candidates)) {
          const notes = data.needs.find((n) => n.id === need.id)?.notes ?? null
          const mark = (c: (typeof candidates)[number] | undefined) => (STATUS_MARKS[c?.status ?? 'discussing'] ?? [false, false, false]).map((y) => text(y ? 'Y' : null))
          const candidateNotes = (id: string) => data.candidates.find((c) => c.id === id)?.notes ?? null
          const [first, ...rest] = candidates
          const firstNotes = [notes, first && candidateNotes(first.id)].filter(Boolean).join('\n') || null
          rows.push([text(need.calling_title), text(need.release_name), text(first?.person_name ?? null), ...mark(first), text(firstNotes)])
          for (const c of rest) rows.push([blank, blank, text(c.person_name), ...mark(c), text(candidateNotes(c.id))])
        }
        break
      }
      case 'releases':
        header(`${section.title} (${shortDate(date)})`)
        lines(releasesOn(date, data.needs).map((n) => `${n.release_name}, ${n.calling_title}`))
        break
      case 'sustainings':
        header(`${section.title} (${shortDate(date)})`)
        lines(sustainingsOn(date, data.needs, data.candidates).map((s) => `${s.name}, ${s.calling}`))
        break
      case 'closing_prayer':
        rows.push([bold(`Closing Prayer: ${agenda?.closing_prayer ?? ''}`.trim())])
        break
      case 'prayer_roll':
        rows.push([bold('Prayer Roll Names:')])
        lines(data.prayerRoll.filter((p) => p.added_on <= date && (!p.removed_on || p.removed_on > date)).map((p) => p.name))
        break
      case 'interviews':
        // Retired: appointments live on the Appointments page now.
        continue
    }
    rows.push([])
  }
  return { name: longDate(date), rows, widths: [40, 18, 28, 7, 8, 7, 40], merges: [] }
}

// ---------------------------------------------------------------------------
// Workbooks
// ---------------------------------------------------------------------------

const TITLES: Record<string, string> = { bishopric: 'Bishopric Agendas', 'ward-council': 'Ward Council Agenda' }

/** One workbook per meeting. The bishopric's also has the Sacrament, Bishopric Schedule and Travel tabs, as before. */
export function buildWorkbooks(data: ExportData, range: Range): Workbook[] {
  return data.templates.map((template) => {
    const dates = agendaDates(template, data, range)
    const tabs = dates.map((date) => {
      const tab = agendaTab(template, date, data)
      // Tab names leave off the year, as the sheets did, unless a longer export repeats one.
      const repeats = dates.some((d) => d !== date && longDate(d) === longDate(date))
      return repeats ? { ...tab, name: `${tab.name} ${date.slice(0, 4)}` } : tab
    })
    if (template.slug === 'bishopric') tabs.unshift(sacramentTab(data, range), scheduleTab(data), travelTab(data, range))
    return { slug: template.slug, title: TITLES[template.slug] ?? `${template.name} Agenda`, tabs }
  })
}
