// Takes screenshots of the real app, using only the invented seed data, for the public site.
//
//   npm run screenshots                     all shots, all variants
//   npm run screenshots -- home settings    only features whose name contains one of the words
//
// Environment (all optional):
//   CAPTURE_BASE_URL   an already-running app (default: starts `vite` on CAPTURE_PORT)
//   CAPTURE_PORT       port for the vite we start (default 5189)
//   CAPTURE_NOW        the frozen "now" (default 2026-11-01T07:30 Denver, a Sunday the seed is full on)
//   CAPTURE_OUT        output folder (default site/src/assets/screens)
//
// It needs local Supabase running with the seed loaded (npm run db:start) and a .env (npm run db:env).
// A few example requests are added for the run and removed again afterwards.

import { createClient } from '@supabase/supabase-js'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'
import { chromium, type Browser } from 'playwright'
import sharp from 'sharp'
import { ROLES, SHOTS, type RoleName, type Shot } from './shots'

const root = resolve(import.meta.dirname, '../..')
const out = resolve(root, process.env.CAPTURE_OUT ?? 'site/src/assets/screens')
const port = process.env.CAPTURE_PORT ?? '5189'
const baseUrl = process.env.CAPTURE_BASE_URL ?? `http://localhost:${port}`
const NOW = new Date(process.env.CAPTURE_NOW ?? '2026-11-01T07:30:00-07:00')
const PASSWORD = 'gp7' // the practice password in supabase/seed.sql

const FORMS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, webp: { quality: 78, effort: 5 } },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false, webp: { quality: 74, effort: 5 } },
} as const
const SCHEMES = ['light', 'dark'] as const

function loadEnv() {
  const env: Record<string, string> = {}
  for (const line of readFileSync(resolve(root, '.env'), 'utf8').split('\n')) {
    const i = line.indexOf('=')
    if (i > 0 && !line.startsWith('#')) env[line.slice(0, i)] = line.slice(i + 1)
  }
  return env
}

const env = loadEnv()
const apiUrl = env.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY
if (!apiUrl || !anonKey || !env.SUPABASE_DB_URL) throw new Error('No .env: run `npm run db:start` then `npm run db:env`.')
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(apiUrl)) throw new Error(`Refusing to run against ${apiUrl}: local Supabase only.`)

const filters = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const shots = SHOTS.filter((s) => !filters.length || filters.some((f) => s.feature.includes(f)))

// --- The app ---------------------------------------------------------------

async function startApp(): Promise<ChildProcess | null> {
  if (process.env.CAPTURE_BASE_URL) return null
  const child = spawn('npx', ['vite', '--port', port, '--strictPort'], { cwd: root, stdio: 'ignore' })
  for (let i = 0; i < 120; i++) {
    if (await fetch(baseUrl).then((r) => r.ok, () => false)) return child
    await new Promise((r) => setTimeout(r, 500))
  }
  child.kill()
  throw new Error(`The app did not start on ${baseUrl} (is port ${port} taken?)`)
}

// --- Sessions --------------------------------------------------------------

type Stored = string
async function signIn(email: string): Promise<{ key: string; value: Stored }> {
  const client = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error || !data.session) throw new Error(`Could not sign in ${email}: ${error?.message}`)
  // Same shape supabase-js stores. The expiry is pushed out so the frozen clock never triggers a refresh.
  const session = { ...data.session, expires_at: Math.floor(Date.now() / 1000) + 10 * 365 * 86400 }
  return { key: `sb-${new URL(apiUrl).hostname.split('.')[0]}-auth-token`, value: JSON.stringify(session) }
}

// --- Example data ----------------------------------------------------------
// The seed has no requests, so add a few for the run. Everything added is removed afterwards.

const sql = postgres(env.SUPABASE_DB_URL, { max: 1, onnotice: () => {} })

async function snapshot() {
  const ids = async (table: string) => new Set((await sql.unsafe(`select id from public.${table}`)).map((r) => r.id as string))
  return { requests: await ids('requests'), calling_requests: await ids('calling_requests'), calling_needs: await ids('calling_needs'), calling_candidates: await ids('calling_candidates'), interviews: await ids('interviews'), agenda_assignments: await ids('agenda_assignments'), agendas: await ids('agendas') }
}

async function addExamples() {
  const id = async (email: string) => (await sql`select id from public.profiles where email = ${email}`)[0].id as string
  const [bishop, first, secretary, assistant, hollis, young] = await Promise.all(['bishop@ward.test', 'first@ward.test', 'secretary@ward.test', 'assistant@ward.test', 'eqpres@ward.test', 'rspres@ward.test'].map(id))
  const at = (days: number) => new Date(NOW.getTime() + days * 86400000).toISOString()
  const rows = [
    [bishop, secretary, 'Update the ward directory', 'Add the families who moved in last month.', '2026-11-04', 'sent', null, null, -2],
    [first, secretary, 'Reserve the cultural hall for the Christmas party', null, '2026-11-13', 'sent', null, null, -1],
    [bishop, hollis, 'Share the temple day schedule with the quorum', 'Second Tuesday of the month.', '2026-11-10', 'sent', null, null, -2],
    [bishop, young, 'Invite a speaker for November 15', null, '2026-11-08', 'seen', null, at(-1), -4],
    [bishop, assistant, 'Confirm the interview room for Sunday', null, null, 'done', 'Booked, and the key is at the front desk.', at(-1), -5],
  ] as const
  for (const [from, to, title, details, due, status, reply, closed, age] of rows) {
    await sql`insert into public.requests (from_id, to_id, title, details, due_on, status, reply, seen_at, closed_at, created_at)
      values (${from}, ${to}, ${title}, ${details}, ${due}, ${status}, ${reply}, ${status === 'sent' ? null : at(age + 1)}, ${status === 'done' ? closed : null}, ${at(age)})`
  }

  // Prayers and a spiritual thought handed out for the next Sunday's meetings; two are waiting on an answer.
  const templates = Object.fromEntries((await sql`select slug, id from public.agenda_templates`).map((t) => [t.slug, t.id as string]))
  const give = async (slug: string, part: string, to: string, by: string, status = 'asked') => {
    await sql`insert into public.agenda_assignments (template_id, meeting_date, part, assignee_id, assigned_by)
      values (${templates[slug]}, '2026-11-08', ${part}::public.meeting_part, ${to}, ${by})`
    if (status !== 'asked') await sql`update public.agenda_assignments set status = ${status}::public.assignment_answer, answered_at = ${at(-1)}, answered_by = ${to} where template_id = ${templates[slug]} and meeting_date = '2026-11-08' and part = ${part}::public.meeting_part`
  }
  await give('ward-council', 'closing_prayer', hollis, secretary)
  await give('bishopric', 'opening_prayer', young, secretary, 'accepted')
  await give('bishopric', 'spiritual_thought', hollis, secretary)

  // Calling requests go through the same function the app calls, as the Elders Quorum president.
  const s = await signIn('eqpres@ward.test')
  const client = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  await client.auth.setSession(JSON.parse(s.value))
  const call = (args: Record<string, unknown>) => client.rpc('submit_calling_request', args as never)
  const a = await call({ request_kind: 'fill', title: 'Elders Quorum Instructor', org: 'Elders Quorum', needed: '2026-11-22', request_notes: 'The current instructor moves next month.', names: [] })
  const b = await call({ request_kind: 'replace', title: 'Elders Quorum Secretary', org: 'Elders Quorum', releasing: 'Brother Vale', names: ['Brother Marsh'] })
  const c = await call({ request_kind: 'fill', title: 'Activities Committee Member', org: 'Activities', names: [] })
  for (const r of [a, b, c]) if (r.error) throw new Error(`Calling request failed: ${r.error.message}`)
  // The bishopric has received one and started on another, so the tracker shows each stage.
  await sql`update public.calling_requests set received_by = ${bishop}, received_at = ${at(-1)}, created_at = ${at(-3)} where id = ${b.data as string}`
  await sql`update public.calling_requests set created_at = ${at(-1)} where id = ${a.data as string}`
  await sql`update public.calling_requests set received_by = ${bishop}, received_at = ${at(-2)}, created_at = ${at(-4)} where id = ${c.data as string}`
}

// A mentoring delegation for the mentoring shots: Brother Lane helps Bishop Avery. Removed afterwards.
async function addDelegation() {
  const id = async (email: string) => (await sql`select id from public.profiles where email = ${email}`)[0].id as string
  const [mentor, forId] = await Promise.all([id('first@ward.test'), id('bishop@ward.test')])
  await sql`delete from public.delegations where mentor_id = ${mentor} and ended_at is null`
  await sql`insert into public.delegations (mentor_id, for_id, ends_at) values (${mentor}, ${forId}, now() + interval '4 weeks')`
  return mentor
}

async function removeDelegation(mentor: string) {
  await sql`delete from public.delegations where mentor_id = ${mentor}`
}

async function removeExamples(before: Awaited<ReturnType<typeof snapshot>>) {
  const after = await snapshot()
  const added = (t: keyof typeof before) => [...after[t]].filter((x) => !before[t].has(x))
  // Assignments first: deleting one clears the name its trigger copied onto the agenda.
  for (const t of ['agenda_assignments', 'requests', 'calling_requests', 'calling_candidates', 'calling_needs', 'agendas'] as const) {
    const ids = added(t)
    if (ids.length) await sql.unsafe(`delete from public.${t} where id = any($1::uuid[])`, [ids])
  }
  // Booking a time must never be left behind; the script only opens that form.
  const interviews = added('interviews')
  if (interviews.length) await sql.unsafe('delete from public.interviews where id = any($1::uuid[])', [interviews])
}

// --- Capturing -------------------------------------------------------------

// The training banner and install prompt are hidden for the shots; the app itself is unchanged.
const HIDE = `
  [role="status"]:has([aria-label="Hide training notice"]) { display: none !important; }
  *, *::before, *::after { caret-color: transparent !important; }
`

async function settled(page: import('playwright').Page, shot: Shot) {
  await page.getByText(shot.waitFor).locator('visible=true').first().waitFor({ timeout: 20000 })
  await page.waitForFunction(() => document.querySelectorAll('[role="progressbar"]').length === 0, undefined, { timeout: 20000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
}

async function capture(browser: Browser, sessions: Map<RoleName, { key: string; value: Stored }>) {
  const manifest: Record<string, { route: string; role: string; caption: string; variants: string[] }> = {}
  const skipped: string[] = []
  mkdirSync(out, { recursive: true })

  for (const form of ['phone', 'desktop'] as const) {
    for (const scheme of SCHEMES) {
      const f = FORMS[form]
      for (const role of new Set(shots.map((s) => s.role))) {
        const context = await browser.newContext({
          viewport: f.viewport,
          deviceScaleFactor: f.deviceScaleFactor,
          isMobile: f.isMobile,
          hasTouch: f.hasTouch,
          colorScheme: scheme,
          locale: 'en-US',
          timezoneId: 'America/Denver',
          reducedMotion: 'reduce',
        })
        const s = sessions.get(role)!
        await context.addInitScript(
          ([key, value]) => {
            localStorage.setItem(key, value)
            localStorage.setItem('ward-desk:install-dismissed', '1')
            sessionStorage.setItem('training-banner-hidden', '1')
          },
          [s.key, s.value],
        )
        await context.clock.setFixedTime(NOW)
        await context.addInitScript(`document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(HIDE)}; document.head.append(s) })`)
        const page = await context.newPage()
        for (const shot of shots.filter((x) => x.role === role && (!x.only || x.only.includes(form)))) {
          const name = `${shot.feature}-${form}-${scheme}`
          try {
            await page.goto(baseUrl + shot.route)
            await settled(page, shot)
            if (shot.prepare) {
              await shot.prepare(page)
              await page.waitForTimeout(300)
            }
            const png = await page.screenshot({ type: 'png' })
            await sharp(png).webp(f.webp).toFile(resolve(out, `${name}.webp`))
            const entry = (manifest[shot.feature] ??= { route: shot.route, role: ROLES[shot.role].label, caption: shot.caption, variants: [] })
            entry.variants.push(`${form}-${scheme}`)
            console.log('captured', name)
          } catch (e) {
            skipped.push(`${name}: ${(e as Error).message.split('\n')[0]}`)
            console.warn('SKIPPED', name, (e as Error).message.split('\n')[0])
          }
        }
        await context.close()
      }
    }
  }
  return { manifest, skipped }
}

async function main() {
  const app = await startApp()
  const before = await snapshot()
  let browser: Browser | undefined
  let mentor: string | undefined
  try {
    await addExamples()
    mentor = await addDelegation()
    const sessions = new Map<RoleName, { key: string; value: Stored }>()
    for (const role of new Set(shots.map((s) => s.role))) sessions.set(role, await signIn(ROLES[role].email))
    browser = await chromium.launch()
    const { manifest, skipped } = await capture(browser, sessions)

    // A partial run keeps the other features' entries.
    const file = resolve(out, 'manifest.json')
    let existing: Record<string, unknown> = {}
    if (filters.length) {
      try {
        existing = JSON.parse(readFileSync(file, 'utf8')).features
      } catch {
        // no manifest yet
      }
    }
    const features = Object.fromEntries(Object.entries({ ...existing, ...manifest }).sort(([a], [b]) => a.localeCompare(b)))
    writeFileSync(file, JSON.stringify({ capturedFor: NOW.toISOString(), features }, null, 2) + '\n')
    if (!filters.length) {
      // Drop images from shots that no longer exist.
      const keep = new Set(Object.keys(features))
      for (const f of readdirSync(out)) if (f.endsWith('.webp') && !keep.has(f.replace(/-(phone|desktop)-(light|dark)\.webp$/, ''))) rmSync(resolve(out, f))
    }
    if (skipped.length) console.warn(`\n${skipped.length} skipped:\n${skipped.join('\n')}`)
  } finally {
    await browser?.close()
    if (mentor) await removeDelegation(mentor).catch((e) => console.error('Could not remove the delegation:', e))
    await removeExamples(before).catch((e) => console.error('Could not remove the example data:', e))
    await sql.end()
    app?.kill()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
