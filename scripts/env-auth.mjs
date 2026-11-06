// Applies a hosted project's Auth settings from supabase/config.toml ([remotes.staging] and
// [remotes.production]):
//
//   npm run env:auth -- staging
//   npm run env:auth -- production
//   npm run env:auth -- staging --diff     # only show the differences, change nothing
//
// It shows `supabase config diff` for that project and asks before `supabase config push`. Run
// from a terminal, the push then shows the CLI's own list of every change and asks once more.
//
// Secrets never go in config.toml, only env(...) references. This asks for the project's Resend
// API key and the Google client secret (or reads RESEND_API_KEY and GOOGLE_CLIENT_SECRET from your
// shell). Leave one blank to keep the value already set: its part of the config is left out of the
// push, so the project keeps what it has. Given values go into a private temp copy of the config
// that is deleted afterwards.
//
// `config push` sends every property the file declares, not only the ones in the remotes block,
// so the remotes blocks restate the live values. The diff doesn't compare credentials, and the CLI
// doesn't manage the passkey settings at all: those are set in the dashboard, and after pushing
// this runs env:check, which reads the passkey relying party back.
//
// Flags: --yes skips both questions (for when you've already reviewed the diff).
//
// Needs: `gh auth login` and `npx supabase login` done once on this machine.

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { ask, confirmOrStop, environmentArg, fail, ghVar, step } from './lib/cli.mjs'

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: { yes: { type: 'boolean', default: false }, diff: { type: 'boolean', default: false } },
})
const env = environmentArg(positionals, 'env:auth')
const root = new URL('..', import.meta.url).pathname
const configPath = join(root, 'supabase', 'config.toml')
const config = readFileSync(configPath, 'utf8')

step(`Reading the ${env} project from GitHub`)
const ref = ghVar('SUPABASE_PROJECT_REF', env)
if (!ref) fail(`No SUPABASE_PROJECT_REF on the ${env} GitHub environment. Run npm run env:github -- ${env} first.`)
const blockRef = config.match(new RegExp(`^\\[remotes\\.${env}\\]\\s*\\nproject_id = "([^"]+)"`, 'm'))?.[1]
if (!blockRef) fail(`supabase/config.toml has no [remotes.${env}] block with a project_id.`)
if (blockRef !== ref) fail(`[remotes.${env}] in supabase/config.toml is for ${blockRef}, but GitHub's ${env} project is ${ref}. Fix whichever is wrong first.`)
console.log(`  Project ${ref}`)

// --- Secrets ----------------------------------------------------------------------

// A diff never pushes, so it fills the secrets with placeholders and compares every table.
const secrets = flags.diff ? { RESEND_API_KEY: 'placeholder-for-diff', GOOGLE_CLIENT_SECRET: 'placeholder-for-diff' } : {}
if (!flags.diff) {
  step('Secrets (blank keeps what the project has)')
  secrets.RESEND_API_KEY = process.env.RESEND_API_KEY || (await ask(`  Resend API key for ${env} (won’t show): `, { hidden: true }))
  if (tableHas(`remotes.${env}.auth.external.google`, 'secret')) {
    secrets.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || (await ask('  Google OAuth client secret (won’t show): ', { hidden: true }))
  }
  for (const [name, value] of Object.entries(secrets)) console.log(`  ${name}: ${value ? 'given' : 'keeping the current one'}`)
}

// --- A private copy of the config with the secrets filled in -----------------------

const workdir = mkdtempSync(join(tmpdir(), 'ward-desk-auth-'))
// On every way out, including fail() and Ctrl-C, since the copy may hold secrets.
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }))
process.on('SIGINT', () => process.exit(130))
const supabaseDir = join(workdir, 'supabase')
mkdirSync(supabaseDir, { mode: 0o700 })
// Everything else in supabase/ (seed, functions, templates) is linked, so paths still resolve.
for (const entry of readdirSync(join(root, 'supabase'))) {
  if (entry !== 'config.toml' && !entry.startsWith('.')) symlinkSync(join(root, 'supabase', entry), join(supabaseDir, entry))
}
writeFileSync(join(supabaseDir, 'config.toml'), fillSecrets(config), { mode: 0o600 })

const remote = [`--remote=${ref}`, '--workdir', workdir]
step(`Differences between supabase/config.toml and ${env}`)
const diff = spawnSync('npx', ['supabase', 'config', 'diff', ...remote, '--agent', 'no'], { stdio: 'inherit' })
if (diff.status !== 0) fail('config diff failed. Nothing was changed.')
console.log('\n  Not compared above: credentials (the push sends any you gave). The passkey settings aren’t')
console.log(`  managed by config push at all; set them in the dashboard. The check after the push reads the relying party (${hostOf(env)}) back.`)
if (!flags.diff && !secrets.RESEND_API_KEY) console.log('  No Resend key given, so SMTP is left out of the push and stays as it is (the "remote-only" smtp lines above).')
if (flags.diff) process.exit(0)

await confirmOrStop(`Push these Auth settings to ${env.toUpperCase()} (${ref})?`, { yes: flags.yes })

step(`Pushing to ${env}`)
// From a terminal the CLI shows every change and asks again. Otherwise (or with --yes) the
// question above was the confirmation.
const interactive = process.stdin.isTTY && !flags.yes
const push = spawnSync('npx', ['supabase', 'config', 'push', ...remote, '--agent', 'no', ...(interactive ? [] : ['--yes'])], { stdio: 'inherit' })
rmSync(workdir, { recursive: true, force: true })
if (push.status !== 0) fail('config push didn’t finish. See the output above.')

step('Reading the settings back')
const check = spawnSync('node', [join(root, 'scripts', 'env-check.mjs'), env], { encoding: 'utf8' })
const authLines = check.stdout.split('\n\n').find((s) => s.startsWith('Auth'))
console.log(authLines ? `\n${authLines}` : check.stdout)
if (authLines?.includes('✗')) fail(`Some Auth settings on ${env} still aren’t right. See above.`)
console.log(`\n✓ Auth settings on ${env} match supabase/config.toml.`)

// ---------------------------------------------------------------------------

function hostOf(name) {
  return config.match(new RegExp(`^\\[remotes\\.${name}\\.auth\\.webauthn\\][^[]*?rp_id = "([^"]+)"`, 'm'))?.[1] ?? '?'
}

/** True when `[table]` in config.toml sets `key`. */
function tableHas(table, key) {
  const body = tableBody(config, table)
  return body !== undefined && new RegExp(`^${key}\\s*=`, 'm').test(body)
}

function tableBody(text, table) {
  const start = text.indexOf(`\n[${table}]\n`)
  if (start < 0) return undefined
  const from = start + table.length + 4
  const next = text.indexOf('\n[', from)
  return text.slice(from, next < 0 ? undefined : next)
}

/**
 * Replaces env(...) secrets in this environment's block with the given values, and drops the
 * parts whose secret wasn't given, so the push leaves them as they are: the whole SMTP table
 * (Supabase refuses SMTP settings without the password) and the Google `secret` line.
 */
function fillSecrets(text) {
  const smtp = `remotes.${env}.auth.email.smtp`
  const google = `remotes.${env}.auth.external.google`
  const replaceTable = (t, table, fn) => {
    const body = tableBody(t, table)
    if (body === undefined) return t
    const header = `\n[${table}]\n`
    const start = t.indexOf(header)
    const replaced = fn(body)
    return replaced === null ? t.slice(0, start) + t.slice(start + header.length + body.length) : t.slice(0, start + header.length) + replaced + t.slice(start + header.length + body.length)
  }
  // TOML basic strings take JSON's escapes.
  const literal = (v) => JSON.stringify(v)
  let out = replaceTable(text, smtp, (body) => (secrets.RESEND_API_KEY ? body.replace('"env(RESEND_API_KEY)"', literal(secrets.RESEND_API_KEY)) : null))
  out = replaceTable(out, google, (body) => (secrets.GOOGLE_CLIENT_SECRET ? body.replace('"env(GOOGLE_CLIENT_SECRET)"', literal(secrets.GOOGLE_CLIENT_SECRET)) : body.replace(/^secret = .*\n?/m, '')))
  return out
}
