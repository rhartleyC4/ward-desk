// Exports Ward Desk back to the layout of the bishopric's Google Sheets, as .xlsx files you can
// open in Google Sheets (File → Import, or drop them in Drive). Run by hand; it isn't in the app.
//
//   npm run export-sheets                       # last 2 months, plus what's planned ahead
//   npm run export-sheets -- --months 6         # or --since 2026-01-01, or --all
//   npm run export-sheets -- --out ~/Desktop    # default is ~/Downloads
//
// Writes "Bishopric Agendas <date>.xlsx" (Sacrament, Bishopric Schedule, Travel and a tab per
// bishopric meeting) and
// "Ward Council Agenda <date>.xlsx" (a tab per ward council), plus one workbook for any other
// meeting set up in the app. Newest meeting first, like the sheets.
//
// Reads SUPABASE_DB_URL from the environment (or .env), or --db-url, inside a read-only
// transaction. The files hold member names and callings, so it refuses to write them inside the
// repo, and its output shows only counts and file paths.

import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import ExcelJS from 'exceljs'
import postgres from 'postgres'
import { cutoffDate } from '../import-sheets/parse'
import { buildWorkbooks, type ExportData, type Tab } from './layout'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const envFile = join(repo, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const { values: args } = parseArgs({
  options: {
    today: { type: 'string' },
    since: { type: 'string' },
    months: { type: 'string' },
    all: { type: 'boolean', default: false },
    out: { type: 'string' },
    'db-url': { type: 'string' },
  },
})

const dbUrl = args['db-url'] ?? process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('Set SUPABASE_DB_URL (npm run db:env writes it for local Supabase) or pass --db-url.')
  process.exit(1)
}
const now = new Date()
const today = args.today ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
let from: string | null
try {
  from = cutoffDate(today, args)
} catch (err) {
  console.error((err as Error).message)
  process.exit(1)
}

const outDir = resolve((args.out ?? join(homedir(), 'Downloads')).replace(/^~(?=$|\/)/, homedir()))
if (!relative(repo, outDir).startsWith('..')) {
  console.error('The export holds member names, so it can\'t be written inside the repo. Pick another --out folder.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

const sql = postgres(dbUrl, { max: 1, prepare: false, onnotice: () => {}, connection: { TimeZone: 'UTC' } })

async function load(): Promise<ExportData> {
  return sql.begin('read only', async (tx) => {
    const [profiles, bishopric, meetings, programItems, absences, templates, sections, agendas, agendaItems, needs, candidates, prayerRoll, rotations, recurringEvents, stewardships, requests] = await Promise.all([
      tx`select id, display_name, short_name, office::text as office from public.profiles`,
      tx`select user_id from public.roles where role = 'bishopric'`,
      tx`select id, meeting_date::text, meeting_type::text, title, presiding, conducting_id, opening_hymn, sacrament_hymn, closing_hymn, invocation, benediction from public.meetings order by meeting_date`,
      tx`select meeting_id, position, kind::text, person_name, note from public.program_items`,
      tx`select user_id, starts_on::text, ends_on::text, location from public.absences`,
      tx`select id, slug, name, weekday, weeks_of_month, start_time::text from public.agenda_templates order by position`,
      tx`select id, template_id, position, kind::text, title from public.agenda_sections`,
      tx`select template_id, meeting_date::text, start_time::text, opening_prayer, spiritual_thought, closing_prayer from public.agendas`,
      tx`select id, section_id, body, event_date::text, resolved_on::text, created_at::text from public.agenda_items order by created_at`,
      tx`select id, calling_title, release_name, release_on::text, status::text, notes from public.calling_needs order by created_at`,
      tx`select id, need_id, calling_title, person_name, status::text, sustain_on::text, notes from public.calling_candidates order by created_at`,
      tx`select name, added_on::text, removed_on::text from public.prayer_roll order by added_on, name`,
      tx`select title, months, assignee_id, assignee_label, weekday, week_of_month from public.rotations order by title`,
      tx`select title, weekday, week_of_month, start_time::text from public.recurring_events`,
      tx`select user_id, area, notes from public.stewardships order by created_at, area`,
      tx`select id, from_id, to_id, title, status::text, due_on::text, reply, closed_at::text, created_at::text from public.requests`,
    ])
    return {
      profiles,
      bishopricIds: bishopric.map((r) => r.user_id),
      meetings,
      programItems,
      absences,
      templates: templates.map((t) => ({ ...t, sections: sections.filter((s) => s.template_id === t.id) })),
      agendas,
      agendaItems,
      needs,
      candidates,
      prayerRoll,
      rotations,
      recurringEvents,
      stewardships,
      requests,
    } as unknown as ExportData
  })
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

function addTab(wb: ExcelJS.Workbook, tab: Tab) {
  const ws = wb.addWorksheet(tab.name, tab.frozenRows ? { views: [{ state: 'frozen', ySplit: tab.frozenRows }] } : {})
  tab.widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))
  tab.rows.forEach((cells, r) => {
    cells.forEach((cell, c) => {
      if (cell.value === null && !cell.fill) return
      const target = ws.getCell(r + 1, c + 1)
      target.value = cell.value
      if (cell.value instanceof Date) target.numFmt = 'm/d/yyyy'
      if (cell.bold) target.font = { bold: true }
      if (cell.fill) target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cell.fill } }
      if (typeof cell.value === 'string' && cell.value.includes('\n')) target.alignment = { wrapText: true, vertical: 'top' }
    })
  })
  for (const range of tab.merges) ws.mergeCells(range)
}

try {
  const data = await load()
  const workbooks = buildWorkbooks(data, { from, today })
  mkdirSync(outDir, { recursive: true })
  console.log(`Exporting ${from ? `from ${from}` : 'everything'} (today ${today}).`)
  for (const book of workbooks) {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Ward Desk'
    for (const tab of book.tabs) addTab(wb, tab)
    const path = join(outDir, `${book.title} ${today}.xlsx`)
    await wb.xlsx.writeFile(path)
    const fixed = ['Sacrament', 'Bishopric Schedule', 'Travel']
    const weekly = book.tabs.filter((t) => !fixed.includes(t.name)).length
    const rows = (name: string) => (book.tabs.find((t) => t.name === name)?.rows.length ?? 1) - 1
    const extra = book.slug === 'bishopric' ? ` plus Sacrament (${rows('Sacrament')} Sundays), Bishopric Schedule and Travel (${rows('Travel')} days)` : ''
    console.log(`  ${path}: ${weekly} meeting tab${weekly === 1 ? '' : 's'}${extra}`)
  }
} catch (err) {
  const e = err as { code?: string; table_name?: string; column_name?: string; name?: string; message?: string }
  console.error('Export failed:')
  console.error(`  ${[e.name, e.code, e.table_name, e.column_name].filter(Boolean).join(' / ') || e.message}`)
  await sql.end()
  process.exit(1)
}
await sql.end()
