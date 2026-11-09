// Pure parsing for the one-time import of the bishopric's Google Sheets (downloaded as .xlsx).
// Works on a small Sheet interface so tests can build sheets from arrays with invented names.
// Nothing here prints cell contents: problems carry a cell reference and a reason only.

export type CellValue = string | number | Date | null

export interface Cell {
  value: CellValue
  /** ARGB of a solid fill, 'theme' for a theme color, or null for no fill. */
  fill?: string | null
  bold?: boolean
}

export interface Sheet {
  name: string
  hidden: boolean
  rowCount: number
  columnCount: number
  /** 1-based. Cells covered by a merge (other than its top-left) read as empty. */
  cell(row: number, col: number): Cell
}

export interface Problem {
  tab: string
  cell: string
  reason: string
}

export type MeetingType =
  | 'regular'
  | 'fast_sunday'
  | 'stake_conference'
  | 'general_conference'
  | 'ward_conference'
  | 'special_program'

export interface PlannedProgramItem {
  kind: 'talk' | 'testimonies'
  personName: string | null
  note: string | null
}

export interface PlannedMeeting {
  row: number
  date: string
  type: MeetingType
  title: string | null
  presiding: string | null
  conducting: string | null
  openingHymn: number | null
  sacramentHymn: number | null
  closingHymn: number | null
  invocation: string | null
  benediction: string | null
  program: PlannedProgramItem[]
}

export interface PlannedAbsence {
  /** The column header, which names the person. */
  person: string
  column: string
  startsOn: string
  endsOn: string
  location: string | null
}

/** The app's four steps, plus sustained for names the sheet marks as already sustained. */
export type CandidateStatus = 'discussing' | 'approved' | 'accepted' | 'sustained'

export interface PlannedCandidate {
  personName: string
  status: CandidateStatus
  notes: string | null
}

export interface PlannedCallingNeed {
  row: number
  callingTitle: string
  releaseName: string | null
  notes: string | null
  candidates: PlannedCandidate[]
}

export type ItemKind = 'discussion' | 'calendar' | 'ordination' | 'missionary'

export interface PlannedItem {
  row: number
  kind: ItemKind
  body: string
  eventDate: string | null
}

export interface PlannedSection {
  row: number
  header: string
  /** items: lines become agenda items. skip: the app builds this section itself. */
  role: 'items' | 'callings' | 'prayer_roll' | 'skip'
  itemKind: ItemKind
  items: PlannedItem[]
  skippedLines: number
}

export interface PlannedAgenda {
  tab: string
  date: string
  openingPrayer: string | null
  spiritualThought: string | null
  closingPrayer: string | null
  sections: PlannedSection[]
  callings: PlannedCallingNeed[]
  prayerRoll: string[]
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function columnLetter(col: number): string {
  let s = ''
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

export function ref(row: number, col: number): string {
  return `${columnLetter(col)}${row}`
}

export function text(value: CellValue): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return null
  const s = String(value).replace(/\s+/g, ' ').trim()
  return s === '' ? null : s
}

export function isoDate(value: CellValue): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null
  return value.toISOString().slice(0, 10)
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * The earliest date to import. `since` (YYYY-MM-DD) wins, then `months` back from today.
 * Null means no limit. Future dates are always kept.
 */
export function cutoffDate(today: string, opts: { since?: string; months?: string; all?: boolean }): string | null {
  if (opts.all) return null
  if (opts.since) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.since) || Number.isNaN(Date.parse(opts.since))) {
      throw new Error(`--since must look like 2026-09-01, not ${opts.since}`)
    }
    return opts.since
  }
  const months = Number(opts.months ?? 2)
  if (!Number.isInteger(months) || months < 0) throw new Error(`--months must be a whole number, not ${opts.months}`)
  const d = new Date(`${today}T00:00:00Z`)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d.toISOString().slice(0, 10)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Reads "November 8th", "Nov. 8", "Dec 4 -" or "11/3" at the start of a string. */
export function parseMonthDay(s: string): { month: number; day: number } | null {
  const named = /^\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?!\d)/i.exec(s)
  if (named) return { month: MONTHS.indexOf(named[1].toLowerCase()) + 1, day: Number(named[2]) }
  const numeric = /^\s*(\d{1,2})\/(\d{1,2})(?![\d/])/.exec(s)
  if (numeric) return { month: Number(numeric[1]), day: Number(numeric[2]) }
  return null
}

/** The sheets leave off the year. Pick the year that puts the date nearest to `near`. */
export function withYear(month: number, day: number, near: string): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const year = Number(near.slice(0, 4))
  const nearTime = Date.parse(`${near}T00:00:00Z`)
  let best: string | null = null
  let bestGap = Infinity
  for (const y of [year - 1, year, year + 1]) {
    const iso = `${y}-${pad(month)}-${pad(day)}`
    const t = Date.parse(`${iso}T00:00:00Z`)
    if (Number.isNaN(t) || new Date(t).getUTCDate() !== day) continue
    const gap = Math.abs(t - nearTime)
    if (gap < bestGap) {
      bestGap = gap
      best = iso
    }
  }
  return best
}

function isFilled(cell: Cell): boolean {
  // Headings use explicit colors. Theme colors show up on ordinary rows (often a theme white).
  if (!cell.fill || cell.fill === 'theme') return false
  const rgb = cell.fill.slice(-6).toUpperCase()
  return rgb !== 'FFFFFF' && rgb !== '000000'
}

/** Splits "Sister Lark (stake)" into the name and the note in parentheses. */
export function splitNote(s: string): { name: string; note: string | null } {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(s)
  if (!m || !m[1]) return { name: s, note: null }
  return { name: m[1].trim(), note: m[2].trim() || null }
}

// ---------------------------------------------------------------------------
// Sacrament tab
// ---------------------------------------------------------------------------

export function eventType(s: string): MeetingType | null {
  const t = s.toLowerCase()
  if (/stake (conference|meeting)/.test(t)) return 'stake_conference'
  if (/general conference/.test(t)) return 'general_conference'
  if (/ward conference/.test(t)) return 'ward_conference'
  return null
}

const FAST = /fast sunday|testimony meeting|testimonies/i
const PROGRAM = /program|christmas|easter/i

/** Reads "41 - Title", "41" or 41. */
export function hymnNumber(value: CellValue): number | null | 'unreadable' {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 && value < 10000 ? value : 'unreadable'
  const s = text(value)
  if (!s) return null
  const m = /^#?\s*(\d{1,4})\b/.exec(s)
  return m ? Number(m[1]) : 'unreadable'
}

export function parseSacrament(sheet: Sheet): { meetings: PlannedMeeting[]; emptySundays: number; problems: Problem[] } {
  const problems: Problem[] = []
  const col: Record<string, number> = {}
  const speakers: number[] = []
  for (let c = 1; c <= sheet.columnCount; c++) {
    const h = text(sheet.cell(1, c).value)?.toLowerCase()
    if (!h) continue
    if (/^speaker/.test(h)) speakers.push(c)
    else if (h === 'date') col.date = c
    else if (h === 'presiding') col.presiding = c
    else if (h === 'conducting') col.conducting = c
    else if (h.startsWith('opening hymn')) col.openingHymn = c
    else if (h === 'invocation' || h === 'opening prayer') col.invocation = c
    else if (h.startsWith('sacrament hymn')) col.sacramentHymn = c
    else if (h.startsWith('closing hymn')) col.closingHymn = c
    else if (h === 'benediction' || h === 'closing prayer') col.benediction = c
  }
  for (const key of ['date', 'presiding', 'conducting']) {
    if (!col[key]) problems.push({ tab: sheet.name, cell: '1', reason: `no "${key}" column header` })
  }
  if (!col.date) return { meetings: [], emptySundays: 0, problems }

  const meetings: PlannedMeeting[] = []
  const seen = new Set<string>()
  let emptySundays = 0
  const read = (row: number, c: number | undefined) => (c ? text(sheet.cell(row, c).value) : null)
  const hymn = (row: number, c: number | undefined) => {
    if (!c) return null
    const n = hymnNumber(sheet.cell(row, c).value)
    if (n === 'unreadable') {
      problems.push({ tab: sheet.name, cell: ref(row, c), reason: 'hymn without a number' })
      return null
    }
    return n
  }

  for (let row = 2; row <= sheet.rowCount; row++) {
    const date = isoDate(sheet.cell(row, col.date).value)
    if (!date) {
      if (text(sheet.cell(row, col.date).value)) problems.push({ tab: sheet.name, cell: ref(row, col.date), reason: 'date column is not a date' })
      continue
    }
    if (seen.has(date)) {
      problems.push({ tab: sheet.name, cell: ref(row, col.date), reason: 'second row for the same date, skipped' })
      continue
    }

    let hasAny = false
    for (let c = col.date + 1; c <= sheet.columnCount; c++) if (text(sheet.cell(row, c).value)) hasAny = true
    if (!hasAny) {
      emptySundays++
      continue
    }
    seen.add(date)

    const presidingCell = col.presiding ? sheet.cell(row, col.presiding) : { value: null }
    const presiding = text(presidingCell.value)
    const conducting = read(row, col.conducting)

    // A conference or other whole-meeting event written across the row.
    if (presiding && !conducting && (eventType(presiding) || isFilled(presidingCell))) {
      const type = eventType(presiding) ?? 'special_program'
      meetings.push({
        row, date, type, title: type === 'special_program' ? presiding : null,
        presiding: null, conducting: null, openingHymn: null, sacramentHymn: null, closingHymn: null,
        invocation: null, benediction: null, program: [],
      })
      continue
    }

    let type: MeetingType = 'regular'
    let title: string | null = null
    const program: PlannedProgramItem[] = []
    for (const c of speakers) {
      const s = read(row, c)
      if (!s) continue
      const event = eventType(s)
      if (FAST.test(s)) {
        type = 'fast_sunday'
        program.push({ kind: 'testimonies', personName: null, note: null })
      } else if (event) {
        type = event
      } else if (PROGRAM.test(s) && (isFilled(sheet.cell(row, c)) || !/\s(sister|brother|elder|bro\.?|sis\.?)\s/i.test(` ${s} `))) {
        type = 'special_program'
        title = s
      } else {
        const { name, note } = splitNote(s)
        program.push({ kind: 'talk', personName: name, note })
      }
    }

    meetings.push({
      row, date, type, title, presiding, conducting,
      openingHymn: hymn(row, col.openingHymn),
      sacramentHymn: hymn(row, col.sacramentHymn),
      closingHymn: hymn(row, col.closingHymn),
      invocation: read(row, col.invocation),
      benediction: read(row, col.benediction),
      program,
    })
  }
  return { meetings, emptySundays, problems }
}

// ---------------------------------------------------------------------------
// Travel tab: one row per day, one column per person
// ---------------------------------------------------------------------------

export function parseTravel(sheet: Sheet): { absences: PlannedAbsence[]; problems: Problem[] } {
  const problems: Problem[] = []
  const people: { col: number; person: string }[] = []
  for (let c = 2; c <= sheet.columnCount; c++) {
    const h = text(sheet.cell(1, c).value)
    if (h && !/^(event|events|notes?)$/i.test(h)) people.push({ col: c, person: h })
  }
  const days: { row: number; date: string }[] = []
  for (let row = 2; row <= sheet.rowCount; row++) {
    const date = isoDate(sheet.cell(row, 1).value)
    if (date) days.push({ row, date })
  }

  const absences: PlannedAbsence[] = []
  for (const { col, person } of people) {
    let open: PlannedAbsence | null = null
    let key = ''
    let prevDate = ''
    for (const { row, date } of days) {
      const value = text(sheet.cell(row, col).value)
      const k = value?.toLowerCase() ?? ''
      if (open && value && k === key && date === addDaysIso(prevDate, 1)) {
        open.endsOn = date
      } else {
        if (open) absences.push(open)
        open = value
          ? { person, column: columnLetter(col), startsOn: date, endsOn: date, location: /^x$/i.test(value) ? null : value }
          : null
        key = k
      }
      prevDate = date
    }
    if (open) absences.push(open)
  }
  return { absences, problems }
}

// ---------------------------------------------------------------------------
// Weekly agenda tabs (bishopric and ward council)
// ---------------------------------------------------------------------------

/** Finds the date a weekly tab is for, from its name or its "Date:" line. */
export function agendaDate(sheet: Sheet, today: string): string | null {
  const candidates = [sheet.name]
  for (let row = 1; row <= Math.min(5, sheet.rowCount); row++) {
    const s = text(sheet.cell(row, 1).value)
    if (s) candidates.push(s.replace(/^date\s*:\s*/i, ''))
  }
  for (const s of candidates) {
    const md = parseMonthDay(s)
    if (!md) continue
    const year = /\b(20\d\d)\b/.exec(s)
    if (year) {
      const iso = `${year[1]}-${pad(md.month)}-${pad(md.day)}`
      if (!Number.isNaN(Date.parse(iso))) return iso
    }
    const iso = withYear(md.month, md.day, today)
    if (iso) return iso
  }
  return null
}

/** The newest weekly tab: the first one in the workbook whose name reads as a date. */
export function latestAgendaTab(sheets: Sheet[]): Sheet | null {
  return sheets.find((s) => parseMonthDay(s.name) !== null) ?? null
}

const FIELD = /^(opening prayer|spiritual thought[^:]*|closing prayer|presiding\s*\/\s*conducting|presiding|conducting|date)\s*:\s*(.*)$/i

export function classifySection(header: string, template: 'bishopric' | 'ward-council'): { role: PlannedSection['role']; itemKind: ItemKind } {
  const h = header.toLowerCase()
  if (/prayer roll/.test(h)) return { role: 'prayer_roll', itemKind: 'discussion' }
  if (/interview/.test(h)) return { role: 'skip', itemKind: 'discussion' }
  if (/callings? needed/.test(h)) return { role: 'callings', itemKind: 'discussion' }
  if (/sacrament meeting/.test(h)) return { role: 'skip', itemKind: 'discussion' }
  if (/^\s*(releases|sustainings)/.test(h)) return { role: 'skip', itemKind: 'discussion' }
  if (template === 'bishopric') {
    if (/sunday\s*&|week/.test(h)) return { role: 'skip', itemKind: 'discussion' }
    if (/^\s*calendar/.test(h)) return { role: 'items', itemKind: 'calendar' }
    if (/ordination|advancement/.test(h)) return { role: 'items', itemKind: 'ordination' }
    if (/missionary/.test(h)) return { role: 'items', itemKind: 'missionary' }
  }
  return { role: 'items', itemKind: 'discussion' }
}

function rowText(sheet: Sheet, row: number, fromCol = 1): string | null {
  const parts: string[] = []
  for (let c = fromCol; c <= sheet.columnCount; c++) {
    const v = sheet.cell(row, c).value
    const s = v instanceof Date ? isoDate(v) : text(v)
    if (s) parts.push(s)
  }
  return parts.length ? parts.join(' — ') : null
}

function isHeaderRow(sheet: Sheet, row: number): string | null {
  const cell = sheet.cell(row, 1)
  const s = text(cell.value)
  if (!s) return null
  if (FIELD.test(s)) return null
  if (isFilled(cell)) return s
  if (cell.bold && /:\s*$/.test(s)) return s
  return null
}

/** Event date for a calendar line like "Dec. 4 - Ward Christmas party" or "11/3 Tuesday - ...". */
export function calendarDate(line: string, agendaDay: string): string | null {
  const md = parseMonthDay(line)
  return md ? withYear(md.month, md.day, agendaDay) : null
}

const STATUS_RANK: CandidateStatus[] = ['discussing', 'approved', 'accepted', 'sustained']

/**
 * What a mark in a status column means, from its heading. The sheet has Appr? (approved),
 * Called? (they accepted the call) and Sust? (sustained).
 */
export function statusForHeading(heading: string): CandidateStatus {
  const h = heading.toLowerCase()
  if (h.startsWith('sust')) return 'sustained'
  if (h.startsWith('call') || h.startsWith('accept')) return 'accepted'
  return 'approved'
}

function parseCallingsTable(sheet: Sheet, startRow: number, endRow: number, problems: Problem[]): PlannedCallingNeed[] {
  let headerRow = 0
  for (let row = startRow; row <= endRow; row++) {
    if (text(sheet.cell(row, 1).value)?.toLowerCase() === 'calling') {
      headerRow = row
      break
    }
  }
  if (!headerRow) {
    if (startRow <= endRow) problems.push({ tab: sheet.name, cell: ref(startRow, 1), reason: 'callings section has no "Calling" header row' })
    return []
  }
  const col = { calling: 1, release: 0, names: 0, notes: 0 }
  const statusCols: { col: number; status: CandidateStatus }[] = []
  for (let c = 2; c <= sheet.columnCount; c++) {
    const h = text(sheet.cell(headerRow, c).value)?.toLowerCase()
    if (!h) continue
    if (h.startsWith('release')) col.release = c
    else if (h.startsWith('name')) col.names = c
    else if (h.startsWith('note')) col.notes = c
    else if (col.names) statusCols.push({ col: c, status: statusForHeading(h) })
  }
  const read = (row: number, c: number) => (c ? text(sheet.cell(row, c).value) : null)
  /** Any mark counts (Y, X, ✓); "N" or "no" does not. The furthest step marked wins. */
  const marked = (row: number, c: number) => {
    const v = read(row, c)
    return Boolean(v && !/^(n|no)$/i.test(v))
  }

  const needs: PlannedCallingNeed[] = []
  for (let row = headerRow + 1; row <= endRow; row++) {
    const calling = read(row, col.calling)
    const name = read(row, col.names)
    const note = read(row, col.notes)
    let status: CandidateStatus = 'discussing'
    for (const s of statusCols) {
      if (marked(row, s.col) && STATUS_RANK.indexOf(s.status) > STATUS_RANK.indexOf(status)) status = s.status
    }

    if (calling) {
      const release = read(row, col.release)
      needs.push({
        row,
        callingTitle: calling,
        releaseName: release && !/^(n\/?a|none|-+)$/i.test(release) ? release : null,
        notes: note,
        candidates: [],
      })
    } else if (!name && !note) {
      continue
    } else if (!needs.length) {
      problems.push({ tab: sheet.name, cell: ref(row, col.names || 1), reason: 'callings row without a calling above it' })
      continue
    } else if (note && !name) {
      const need = needs[needs.length - 1]
      need.notes = need.notes ? `${need.notes}\n${note}` : note
      continue
    }

    if (name) {
      const need = needs[needs.length - 1]
      const { name: person, note: inParens } = splitNote(name)
      // On a calling's own row the note belongs to the calling; on a continuation row, to that name.
      const notes = [inParens, calling ? null : note].filter(Boolean).join('\n') || null
      need.candidates.push({ personName: person, status, notes })
    }
  }
  return needs
}

export function parseAgendaTab(sheet: Sheet, template: 'bishopric' | 'ward-council', today: string): { agenda: PlannedAgenda | null; problems: Problem[] } {
  const problems: Problem[] = []
  const date = agendaDate(sheet, today)
  if (!date) {
    problems.push({ tab: sheet.name, cell: 'A2', reason: 'could not read the meeting date' })
    return { agenda: null, problems }
  }
  const agenda: PlannedAgenda = {
    tab: sheet.name, date, openingPrayer: null, spiritualThought: null, closingPrayer: null,
    sections: [], callings: [], prayerRoll: [],
  }

  // Section boundaries first, so the callings table can be read as a block.
  const starts: { row: number; header: string }[] = []
  for (let row = 1; row <= sheet.rowCount; row++) {
    const header = isHeaderRow(sheet, row)
    if (header && row > 2) starts.push({ row, header })
  }

  let current: PlannedSection | null = null
  let sectionIndex = -1
  for (let row = 1; row <= sheet.rowCount; row++) {
    if (sectionIndex + 1 < starts.length && starts[sectionIndex + 1].row === row) {
      sectionIndex++
      const { header } = starts[sectionIndex]
      const { role, itemKind } = classifySection(header, template)
      current = { row, header: header.replace(/:\s*$/, ''), role, itemKind, items: [], skippedLines: 0 }
      agenda.sections.push(current)
      if (role === 'callings') {
        const end = sectionIndex + 1 < starts.length ? starts[sectionIndex + 1].row - 1 : sheet.rowCount
        agenda.callings.push(...parseCallingsTable(sheet, row + 1, end, problems))
      }
      continue
    }

    const first = text(sheet.cell(row, 1).value)
    const field = first ? FIELD.exec(first) : null
    if (field) {
      const label = field[1].toLowerCase()
      const value = field[2].trim() || rowText(sheet, row, 2)
      if (label.startsWith('opening prayer')) agenda.openingPrayer = value || null
      else if (label.startsWith('spiritual thought')) agenda.spiritualThought = value || null
      else if (label.startsWith('closing prayer')) agenda.closingPrayer = value || null
      // A field line ends whatever list came before it, except the prayer roll heading after it.
      current = null
      continue
    }
    if (row <= 2) continue

    const line = rowText(sheet, row)
    if (!line || !current) continue
    if (/^-+$/.test(line)) continue

    switch (current.role) {
      case 'skip':
        current.skippedLines++
        break
      case 'callings':
        break
      case 'prayer_roll':
        agenda.prayerRoll.push(line)
        break
      case 'items':
        current.items.push({
          row,
          kind: current.itemKind,
          body: line,
          eventDate: current.itemKind === 'calendar' ? calendarDate(line, date) : null,
        })
        break
    }
  }
  return { agenda, problems }
}

// ---------------------------------------------------------------------------
// Matching sheet labels to rows in the database
// ---------------------------------------------------------------------------

export interface PersonRow {
  id: string
  short_name: string | null
  display_name: string | null
  email: string
}

const TITLES = new Set(['bishop', 'brother', 'sister', 'elder', 'president', 'bro', 'sis', 'pres'])

export interface NameMatch {
  /** Who the label links to, if exactly one person fits. */
  person: PersonRow | null
  fits: PersonRow[]
  /** Why someone should look at this match. Empty when it looks sound. */
  doubts: string[]
}

function nameWords(...names: (string | null)[]): string[] {
  return names
    .filter(Boolean)
    .flatMap((s) => s!.toLowerCase().split(/\s+/))
    .filter((w) => !TITLES.has(w))
}

function matchDoubts(words: string[], person: PersonRow): string[] {
  const inName = nameWords(person.short_name, person.display_name)
  if (words.some((w) => !inName.includes(w))) return ['matched using their email address, not their name']
  if (words.length === 1 && words[0] !== nameWords(person.display_name).at(-1)) return ['one word that is not their last name']
  return []
}

/** Finds who a short label like "Ortiz" or "Bishop" means, and how sure that is. */
export function explainMatch(label: string, people: PersonRow[]): NameMatch {
  const nobody = (doubt: string, fits: PersonRow[] = []): NameMatch => ({ person: null, fits, doubts: [doubt] })
  const several = (fits: PersonRow[]) => nobody(`fits ${fits.length} people, so it links to no one`, fits)

  const l = label.toLowerCase().replace(/[.,]/g, '').trim()
  if (!l) return nobody('blank')
  const exact = people.filter((p) => p.short_name?.toLowerCase() === l || p.display_name?.toLowerCase() === l)
  if (exact.length === 1) return { person: exact[0], fits: exact, doubts: [] }
  if (exact.length > 1) return several(exact)
  const words = l.split(/\s+/).filter((w) => !TITLES.has(w))
  if (!words.length) return nobody('only a title, so it links to no one')
  const fits = people.filter((p) => {
    const theirs = new Set(nameWords(p.short_name, p.display_name, p.email.split('@')[0].replace(/[._-]+/g, ' ')))
    return words.every((w) => theirs.has(w))
  })
  if (!fits.length) return nobody('fits no one')
  if (fits.length > 1) return several(fits)
  return { person: fits[0], fits, doubts: matchDoubts(words, fits[0]) }
}

/** Matches a short label like "Ortiz" or "Bishop" to exactly one person, or null. */
export function matchPerson(label: string, people: PersonRow[]): string | null {
  return explainMatch(label, people).person?.id ?? null
}

export interface NameUse {
  label: string
  /** Sundays conducting, or trips in the column. */
  count: number
  /** The Travel column; absent for Conducting. */
  column?: string
  match: NameMatch
}

const account = (p: PersonRow) => `${p.display_name ?? p.short_name ?? '(no name)'} <${p.email}>`

/** How each sheet name maps to an account, then the mappings worth a second look. Shows real names. */
export function nameReport(uses: NameUse[]): string[] {
  const where = (u: NameUse) => (u.column ? `Travel column ${u.column}` : 'Conducting')
  const target = (m: NameMatch) => (m.person ? account(m.person) : m.fits.length ? m.fits.map(account).join(', ') : 'no one')

  const questions = uses.flatMap((u) => u.match.doubts.map((d) => `  ${where(u)} "${u.label}" → ${target(u.match)}: ${d}`))
  // Each Travel column is one person, so two columns reaching the same account means one is wrong.
  const columnsByPerson = new Map<string, NameUse[]>()
  for (const u of uses) {
    if (!u.column || !u.match.person) continue
    columnsByPerson.set(u.match.person.id, [...(columnsByPerson.get(u.match.person.id) ?? []), u])
  }
  for (const same of columnsByPerson.values()) {
    if (same.length > 1) questions.push(`  Travel columns ${same.map((u) => u.column).join(' and ')} all link to ${target(same[0].match)}`)
  }

  return [
    'Names (these are real names, so do not share this part):',
    ...uses.map((u) => `  ${where(u)} "${u.label}" (${u.count} ${u.column ? 'trips' : 'Sundays'}) → ${target(u.match)}`),
    '',
    questions.length ? `Questionable (${questions.length}):` : 'Questionable: none',
    ...questions,
  ]
}

export interface SectionRow {
  id: string
  title: string
  kind: string
}

const STOP = new Set(['and', 'the', 'of', 'for', 'to', 'a', 'ward', 'items', 'needed'])

function words(s: string): string[] {
  return s.toLowerCase().replace(/&/g, ' ').split(/[^a-z]+/).filter((w) => w.length > 1 && !STOP.has(w))
}

/** Picks the app's agenda section for a sheet heading and item kind, or null. */
export function matchSection(header: string, itemKind: ItemKind, sections: SectionRow[]): string | null {
  if (itemKind === 'calendar') return sections.find((s) => s.kind === 'calendar')?.id ?? null
  const candidates = sections.filter((s) => s.kind === 'items')
  const want = words(header)
  let best: SectionRow | null = null
  let bestScore = 0
  for (const s of candidates) {
    const theirs = words(s.title)
    // Count prefix matches so "Activities Cmte" still meets "Activities Committee".
    const score = want.filter((w) => theirs.some((t) => t.startsWith(w) || w.startsWith(t))).length
    if (score > bestScore) {
      best = s
      bestScore = score
    }
  }
  return best?.id ?? null
}
