// One-time import of the bishopric's Google Sheets into Ward Desk.
//
// In Google Sheets, use File → Download → Microsoft Excel (.xlsx) for each sheet, then:
//
//   npm run import-sheets -- --bishopric ~/Downloads/"Bishopric Agendas.xlsx" \
//     --ward-council ~/Downloads/"Ward Council Agenda.xlsx"            # dry run: counts only
//   npm run import-sheets -- ... --apply                                # save
//
// How far back: sacrament meetings and trips from the last 2 months by default, plus everything
// ahead. Change it with --months 6, --since 2026-01-01, or --all. The weekly agenda tabs only
// ever read the newest tab, since open items carry forward.
//
// Reads SUPABASE_DB_URL from the environment (or .env), or --db-url. The dry run does every
// write inside a transaction and rolls it back, so its counts match what --apply would save.
// Running it again is safe: rows that already exist are skipped.
//
// --apply prints a run id. To take that run back out (see undo.ts):
//
//   npm run import-sheets -- --undo <run id>                            # dry run: counts only
//   npm run import-sheets -- --undo <run id> --apply                    # remove
//
// Trips and Sundays conducting link to accounts. With --apply, anyone under Who can sign in who
// has a first or last name but hasn't signed in gets their account now, and uses it when they do.
// Undoing a run leaves those accounts in place; remove one with Delete account in the app.
//
// The output never shows names or other cell contents, only counts and cell references,
// so it can be shared when something needs fixing. The exception is --show-names, which adds how
// each Conducting name and Travel heading maps to an account and which of those look doubtful.

import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { parseArgs } from 'node:util'
import ExcelJS from 'exceljs'
import postgres from 'postgres'
import { sustainingSunday } from '../../src/lib/dates'
import { wardNow } from '../../src/lib/followUp'
import {
  cutoffDate,
  explainMatch,
  latestAgendaTab,
  matchPerson,
  matchSection,
  nameReport,
  parseAgendaTab,
  parseSacrament,
  parseTravel,
  ref,
  type CellValue,
  type NameUse,
  type PersonRow,
  type PlannedAgenda,
  type Problem,
  type SectionRow,
  type Sheet,
} from './parse'
import { insertPrayerName, isRunId, startRun, undoImport, undoReport, undoTotal } from './undo'

const envFile = new URL('../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

const { values: args } = parseArgs({
  options: {
    bishopric: { type: 'string' },
    'ward-council': { type: 'string' },
    'bishopric-tab': { type: 'string' },
    'ward-council-tab': { type: 'string' },
    today: { type: 'string' },
    since: { type: 'string' },
    months: { type: 'string' },
    all: { type: 'boolean', default: false },
    'db-url': { type: 'string' },
    apply: { type: 'boolean', default: false },
    undo: { type: 'string' },
    'show-names': { type: 'boolean', default: false },
  },
})

if (args.undo !== undefined && (args.bishopric || args['ward-council'])) {
  console.error('--undo takes only the run id, not the sheets.')
  process.exit(1)
}
if (args.undo === undefined && !args.bishopric && !args['ward-council']) {
  console.error('Give --bishopric and/or --ward-council with the path to each downloaded .xlsx file.')
  process.exit(1)
}
const dbUrl = args['db-url'] ?? process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('Set SUPABASE_DB_URL (npm run db:env writes it for local Supabase) or pass --db-url.')
  process.exit(1)
}

let host = '(unknown host)'
try {
  host = new URL(dbUrl).host
} catch {
  // keep the placeholder
}

if (args.undo !== undefined) {
  if (!isRunId(args.undo)) {
    console.error('That is not a run id. It looks like 2026-11-09T18:22:01.123456Z, and --apply printed it.')
    process.exit(1)
  }
  const undoSql = postgres(dbUrl, { max: 1, prepare: false, onnotice: () => {} })
  let code = 0
  try {
    const result = await undoImport(undoSql, args.undo, args.apply)
    console.log(`Database: ${host}`)
    console.log(`Run: ${args.undo}`)
    if (undoTotal(result) === 0) {
      console.error('Nothing from that run is in this database.')
      code = 1
    } else {
      for (const line of undoReport(result, args.apply)) console.log(line)
    }
  } catch (err) {
    // Print only the error's codes, as the import does.
    const e = err as { code?: string; table_name?: string; constraint_name?: string; name?: string }
    console.error('Stopped. Nothing was removed.')
    console.error(`  ${[e.name, e.code, e.table_name, e.constraint_name].filter(Boolean).join(' / ')}`)
    code = 1
  }
  await undoSql.end()
  process.exit(code)
}

const timeZone = process.env.WARD_TIME_ZONE || process.env.VITE_WARD_TIME_ZONE || 'America/Denver'
const today = args.today ?? wardNow(new Date(), timeZone).date
let cutoff: string | null
try {
  cutoff = cutoffDate(today, args)
} catch (err) {
  console.error((err as Error).message)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Reading .xlsx files into the parser's Sheet shape
// ---------------------------------------------------------------------------

type RawValue = ExcelJS.CellValue

function plain(v: RawValue): CellValue {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v
  if (typeof v === 'number' || typeof v === 'string') return v
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('result' in v) return plain(v.result as RawValue)
    if ('text' in v) return plain(v.text as RawValue)
  }
  return null
}

function adapt(ws: ExcelJS.Worksheet): Sheet {
  return {
    name: ws.name,
    hidden: (ws as { state?: string }).state !== 'visible',
    rowCount: ws.rowCount,
    columnCount: ws.columnCount,
    cell(row, col) {
      const c = ws.findCell(row, col)
      if (!c) return { value: null }
      if (c.isMerged && c.master.address !== c.address) return { value: null }
      const f = c.fill
      const fill =
        f?.type === 'pattern' && f.pattern === 'solid'
          ? (f.fgColor?.argb ?? (f.fgColor?.theme !== undefined ? 'theme' : null))
          : null
      return { value: plain(c.value), fill, bold: Boolean(c.font?.bold) }
    },
  }
}

async function load(path: string): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  return wb.worksheets.map(adapt)
}

function pickTab(sheets: Sheet[], name: string | undefined): Sheet | null {
  if (name) return sheets.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null
  return latestAgendaTab(sheets)
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

const problems: Problem[] = []
const lines: string[] = []
const say = (s = '') => lines.push(s)

let sacrament: ReturnType<typeof parseSacrament> | null = null
let travel: ReturnType<typeof parseTravel> | null = null
const agendas: { slug: 'bishopric' | 'ward-council'; agenda: PlannedAgenda }[] = []
let olderMeetings = 0
let olderTrips = 0

if (args.bishopric) {
  const sheets = await load(args.bishopric)
  say(`${basename(args.bishopric)} (${sheets.length} tabs)`)
  const sac = sheets.find((s) => /^sacrament$/i.test(s.name.trim()))
  if (sac) {
    sacrament = parseSacrament(sac)
    if (cutoff) {
      const all = sacrament.meetings
      sacrament.meetings = all.filter((m) => m.date >= cutoff!)
      olderMeetings = all.length - sacrament.meetings.length
      const firstKept = sacrament.meetings[0]?.row ?? Infinity
      sacrament.problems = sacrament.problems.filter((p) => {
        const row = Number(p.cell.replace(/^[A-Z]+/, ''))
        return row <= 1 || row >= firstKept
      })
    }
    problems.push(...sacrament.problems)
  } else say('  no "Sacrament" tab')
  const tr = sheets.find((s) => /^travel$/i.test(s.name.trim()))
  if (tr) {
    travel = parseTravel(tr)
    if (cutoff) {
      const all = travel.absences
      travel.absences = all.filter((a) => a.endsOn >= cutoff!)
      olderTrips = all.length - travel.absences.length
    }
    problems.push(...travel.problems)
  } else say('  no "Travel" tab')
  const tab = pickTab(sheets, args['bishopric-tab'])
  if (tab) {
    const parsed = parseAgendaTab(tab, 'bishopric', today)
    problems.push(...parsed.problems)
    if (parsed.agenda) agendas.push({ slug: 'bishopric', agenda: parsed.agenda })
  } else say('  no weekly agenda tab found')
}

if (args['ward-council']) {
  const sheets = await load(args['ward-council'])
  say(`${basename(args['ward-council'])} (${sheets.length} tabs)`)
  const tab = pickTab(sheets, args['ward-council-tab'])
  if (tab) {
    const parsed = parseAgendaTab(tab, 'ward-council', today)
    problems.push(...parsed.problems)
    if (parsed.agenda) agendas.push({ slug: 'ward-council', agenda: parsed.agenda })
  } else say('  no weekly agenda tab found')
}

// ---------------------------------------------------------------------------
// Write (inside one transaction; rolled back unless --apply)
// ---------------------------------------------------------------------------

class DryRun extends Error {}

const sql = postgres(dbUrl, { max: 1, prepare: false, onnotice: () => {} })

let step = 'connecting'
let runId = ''
let nameLines: string[] = []
try {
  await sql.begin(async (tx) => {
    runId = await startRun(tx)

    step = 'creating accounts for people who have not signed in'
    const [{ created }] = await tx<{ created: number }[]>`select public.create_waiting_accounts() as created`
    const [{ nameless }] = await tx<{ nameless: number }[]>`select count(*)::int as nameless from public.allowlist where profile_id is null`
    if (created) say(`Accounts: ${created} added for people who haven't signed in yet, from the names under Who can sign in`)
    if (nameless) say(`Accounts: ${nameless} people under Who can sign in have no name or account, so nothing can link to them`)

    step = 'reading people and agenda sections'
    const people = await tx<PersonRow[]>`select id, short_name, display_name, email from public.profiles`
    const sectionRows = await tx<(SectionRow & { slug: string; template_id: string })[]>`
      select s.id, s.title, s.kind::text as kind, t.slug, t.id as template_id
      from public.agenda_sections s join public.agenda_templates t on t.id = s.template_id`
    // What was already there before this run, so a re-run skips it but repeated lines in a sheet don't collapse.
    const openItems = new Set(
      (await tx<{ k: string }[]>`select section_id || '|' || body as k from public.agenda_items where resolved_on is null`).map((r) => r.k),
    )
    const openNeeds = new Set(
      (await tx<{ k: string }[]>`
        select lower(calling_title) || '|' || coalesce(release_name, '') as k from public.calling_needs where status = 'open'`).map((r) => r.k),
    )

    const conductingNames: string[] = []

    if (sacrament) {
      step = 'sacrament meetings'
      const existing = new Set((await tx<{ d: string }[]>`select meeting_date::text as d from public.meetings`).map((r) => r.d))
      let added = 0
      let skipped = 0
      let talks = 0
      const unmatchedConducting = new Set<string>()
      for (const m of sacrament.meetings) {
        if (existing.has(m.date)) {
          skipped++
          continue
        }
        const conductingId = m.conducting ? matchPerson(m.conducting, people) : null
        if (m.conducting) conductingNames.push(m.conducting)
        if (m.conducting && !conductingId) unmatchedConducting.add(m.conducting.toLowerCase())
        const [row] = await tx<{ id: string }[]>`
          insert into public.meetings (meeting_date, meeting_type, title, presiding, conducting_id,
            opening_hymn, sacrament_hymn, closing_hymn, invocation, benediction, notes)
          values (${m.date}, ${m.type}, ${m.title}, ${m.presiding}, ${conductingId},
            ${m.openingHymn}, ${m.sacramentHymn}, ${m.closingHymn}, ${m.invocation}, ${m.benediction},
            ${m.conducting && !conductingId ? `Conducting: ${m.conducting}` : null})
          returning id`
        for (const [i, p] of m.program.entries()) {
          await tx`
            insert into public.program_items (meeting_id, position, kind, person_name, note, status)
            values (${row.id}, ${i + 1}, ${p.kind}, ${p.personName}, ${p.note}, 'confirmed')`
          if (p.kind === 'talk') talks++
        }
        added++
      }
      const dates = sacrament.meetings.map((m) => m.date)
      say(`  Sacrament: ${sacrament.meetings.length} meetings from ${dates[0] ?? '-'} to ${dates.at(-1) ?? '-'}; ` +
        `${added} added (${talks} talks), ${skipped} already in the app, ${sacrament.emptySundays} blank Sundays left out`)
      if (olderMeetings) say(`    ${olderMeetings} meetings before ${cutoff} left out`)
      if (unmatchedConducting.size) {
        say(`    ${unmatchedConducting.size} different "Conducting" names match no one in the app; kept in each meeting's notes`)
      }
    }

    if (travel) {
      step = 'travel'
      const byColumn = new Map<string, string | null>()
      for (const a of travel.absences) {
        if (!byColumn.has(a.column)) byColumn.set(a.column, matchPerson(a.person, people))
      }
      let added = 0
      let skipped = 0
      let unmatched = 0
      for (const a of travel.absences) {
        const userId = byColumn.get(a.column)
        if (!userId) {
          unmatched++
          continue
        }
        const [dupe] = await tx`
          select 1 from public.absences where user_id = ${userId} and starts_on = ${a.startsOn} and ends_on = ${a.endsOn}`
        if (dupe) {
          skipped++
          continue
        }
        await tx`
          insert into public.absences (user_id, starts_on, ends_on, location)
          values (${userId}, ${a.startsOn}, ${a.endsOn}, ${a.location})`
        added++
      }
      say(`  Travel: ${travel.absences.length} trips; ${added} added, ${skipped} already in the app`)
      if (olderTrips) say(`    ${olderTrips} trips that ended before ${cutoff} left out`)
      for (const [column, id] of byColumn) {
        if (!id) {
          const n = travel.absences.filter((a) => a.column === column).length
          say(`    column ${column}: heading matches no one in the app, ${n} trips left out`)
        }
      }
      if (unmatched) say('    (Enter their first and last name under Who can sign in, or check the heading, then run again to add their trips.)')
    }

    const prayerNames = new Map<string, string>()
    for (const { slug, agenda } of agendas) {
      step = `${slug} agenda`
      const sections = sectionRows.filter((s) => s.slug === slug)
      const templateId = sections[0]?.template_id
      say(`  ${slug === 'bishopric' ? 'Bishopric' : 'Ward council'} agenda: tab "${agenda.tab}" for ${agenda.date}`)
      if (!templateId) {
        say(`    no "${slug}" agenda template in the app; skipped`)
        continue
      }
      await tx`
        insert into public.agendas (template_id, meeting_date, opening_prayer, spiritual_thought, closing_prayer)
        values (${templateId}, ${agenda.date}, ${agenda.openingPrayer}, ${agenda.spiritualThought}, ${agenda.closingPrayer})
        on conflict (template_id, meeting_date) do update set
          opening_prayer = coalesce(agendas.opening_prayer, excluded.opening_prayer),
          spiritual_thought = coalesce(agendas.spiritual_thought, excluded.spiritual_thought),
          closing_prayer = coalesce(agendas.closing_prayer, excluded.closing_prayer)`

      for (const section of agenda.sections) {
        if (section.role === 'skip') {
          say(`    ${ref(section.row, 1)}: ${section.skippedLines} lines left out (the app builds this section itself)`)
          continue
        }
        if (section.role !== 'items') continue
        if (!section.items.length) continue
        const sectionId = matchSection(section.header, section.itemKind, sections)
        if (!sectionId) {
          problems.push({ tab: agenda.tab, cell: ref(section.row, 1), reason: `heading matches no section in the app; ${section.items.length} items left out` })
          continue
        }
        const title = sections.find((s) => s.id === sectionId)!.title
        let added = 0
        for (const item of section.items) {
          if (openItems.has(`${sectionId}|${item.body}`)) continue
          await tx`
            insert into public.agenda_items (section_id, kind, body, event_date)
            values (${sectionId}, ${item.kind}, ${item.body}, ${item.eventDate})`
          added++
        }
        say(`    ${ref(section.row, 1)} → "${title}": ${section.items.length} items, ${added} added`)
      }

      if (agenda.callings.length) {
        step = 'callings'
        let added = 0
        let names = 0
        for (const need of agenda.callings) {
          if (openNeeds.has(`${need.callingTitle.toLowerCase()}|${need.releaseName ?? ''}`)) continue
          // Sustained already: taken as set apart (day unknown), so the calling is done and stays off
          // the agenda. Accepted: like marking Accepted in the app, sustain (and release) on the
          // coming Sunday. Only one name per calling can be approved, so the one furthest along keeps
          // its step and any others go back to being considered.
          const lead = need.candidates.find((c) => c.status === 'sustained') ?? need.candidates.find((c) => c.status === 'accepted') ?? need.candidates.find((c) => c.status === 'approved')
          const accepted = lead?.status === 'accepted'
          const releaseOn = accepted && need.releaseName ? sustainingSunday(today) : null
          const [row] = await tx<{ id: string }[]>`
            insert into public.calling_needs (calling_title, release_name, release_on, notes)
            values (${need.callingTitle}, ${need.releaseName}, ${releaseOn}, ${need.notes})
            returning id`
          for (const c of need.candidates) {
            const status = c !== lead && c.status !== 'discussing' ? 'discussing' : c.status === 'sustained' ? 'set_apart' : c.status
            const sustainOn = status === 'accepted' ? sustainingSunday(today) : null
            await tx`
              insert into public.calling_candidates (need_id, person_name, status, sustain_on, notes)
              values (${row.id}, ${c.personName}, ${status}, ${sustainOn}, ${c.notes})`
            names++
          }
          added++
        }
        const byStatus = new Map<string, number>()
        for (const c of agenda.callings.flatMap((n) => n.candidates)) byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1)
        say(`    Callings needed: ${agenda.callings.length} callings, ${added} added with ${names} names ` +
          `(${[...byStatus].map(([s, n]) => `${n} ${s}`).join(', ') || 'no names'})`)
      }

      for (const name of agenda.prayerRoll) prayerNames.set(name.toLowerCase(), name)
    }

    if (prayerNames.size) {
      step = 'prayer roll'
      let added = 0
      for (const name of prayerNames.values()) {
        const [dupe] = await tx`select 1 from public.prayer_roll where lower(name) = lower(${name}) and removed_on is null`
        if (dupe) continue
        await insertPrayerName(tx, runId, name)
        added++
      }
      say(`  Prayer roll: ${prayerNames.size} names across both sheets, ${added} added`)
    }

    if (args['show-names']) {
      const conducting = new Map<string, NameUse>()
      for (const label of conductingNames) {
        const use = conducting.get(label.toLowerCase())
        if (use) use.count++
        else conducting.set(label.toLowerCase(), { label, count: 1, match: explainMatch(label, people) })
      }
      const columns = new Map<string, NameUse>()
      for (const a of travel?.absences ?? []) {
        const use = columns.get(a.column)
        if (use) use.count++
        else columns.set(a.column, { label: a.person, count: 1, column: a.column, match: explainMatch(a.person, people) })
      }
      nameLines = nameReport([...conducting.values(), ...columns.values()])
    }

    if (!args.apply) throw new DryRun()
  })
} catch (err) {
  if (!(err instanceof DryRun)) {
    // Print only the error's codes; its message and detail can quote cell contents.
    const e = err as { code?: string; constraint_name?: string; table_name?: string; column_name?: string; name?: string }
    console.error(`Stopped while saving ${step}. Nothing was saved.`)
    console.error(`  ${[e.name, e.code, e.table_name, e.column_name, e.constraint_name].filter(Boolean).join(' / ')}`)
    await sql.end()
    process.exit(1)
  }
}
await sql.end()

console.log(`Database: ${host}`)
console.log(args.apply ? 'Saved.' : 'Dry run: nothing was saved. Add --apply to save.')
if (args.apply) console.log(`Run id: ${runId} (to take it back out: npm run import-sheets -- --undo ${runId})`)
console.log(cutoff ? `Going back to ${cutoff} (change with --months, --since or --all).` : 'Going back to the start of each sheet (--all).')
console.log()
for (const l of lines) console.log(l)
if (problems.length) {
  console.log()
  console.log(`${problems.length} cells to check by hand:`)
  for (const p of problems) console.log(`  ${p.tab} ${p.cell}: ${p.reason}`)
}
if (nameLines.length) {
  console.log()
  for (const l of nameLines) console.log(l)
}
