// Sets up notifications for one environment in a single run:
//
//   npm run notify:setup -- staging
//   npm run notify:setup -- production
//   npm run notify:setup -- local          # the local stack, to try it (serve the functions first)
//
// It reads the project ref, VAPID public key and time zone from that GitHub environment, makes a
// new NOTIFY_SECRET, sets the functions' secrets, builds and deploys the notify and push
// functions, saves where to call and the secret in the database's Vault, then starts one run of
// the scheduled job and shows whether it worked. Running it again is safe: it replaces the secret
// in both places and redeploys.
//
// The VAPID private key is a GitHub secret, which can't be read back. If the project doesn't have
// one yet, the script asks for it (or reads VAPID_PRIVATE_KEY from the environment).
//
// Needs: `gh auth login` and `npx supabase login` done once on this machine.
//
// Flags: --yes skips the "are you sure", --skip-deploy leaves the functions as they are.

import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: { yes: { type: 'boolean', default: false }, 'skip-deploy': { type: 'boolean', default: false } },
})
const env = positionals[0]
if (!['staging', 'production', 'local'].includes(env)) {
  console.error('Say which environment: npm run notify:setup -- staging (or production, or local)')
  process.exit(1)
}
const local = env === 'local'

const step = (text) => console.log(`\n▸ ${text}`)
const fail = (text) => {
  console.error(`\n✗ ${text}`)
  process.exit(1)
}

/** Runs the Supabase CLI. `--yes` is passed because you already confirmed below. */
function supabase(args, { capture = false } = {}) {
  const result = spawnSync('npx', ['supabase', ...args], { encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' })
  if (result.status !== 0) fail(`supabase ${args[0]} ${args[1] ?? ''} failed${capture ? `:\n${result.stderr || result.stdout}` : ''}`)
  return result.stdout
}

const ghVar = (name) => {
  try {
    return execFileSync('gh', ['variable', 'get', name, '--env', env], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (hidden) rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? s : '')
    rl.question(question, (answer) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
}

/** Runs SQL from a private temp file, so values in it never show in the process list or shell history. */
function runSql(sql, remote, { readOnly = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ward-desk-'))
  const file = join(dir, 'query.sql')
  try {
    writeFileSync(file, sql, { mode: 0o600 })
    const out = supabase(['db', 'query', ...remote, '--file', file, '--output-format', 'json', ...(readOnly ? ['--read-only'] : ['--yes'])], { capture: true })
    // A statement with no rows (DO, a bare function call) prints its command tag, not JSON.
    try {
      return JSON.parse(out).rows ?? []
    } catch {
      return []
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`
const upsertVault = (name, value) => `
  if exists (select 1 from vault.secrets where name = ${quote(name)}) then
    perform vault.update_secret((select id from vault.secrets where name = ${quote(name)}), ${quote(value)});
  else
    perform vault.create_secret(${quote(value)}, ${quote(name)});
  end if;`

// ---------------------------------------------------------------------------

let ref = ''
let remote = []
let url
let secret

if (local) {
  // The local stack: the secret is the one npm run db:env wrote, so `supabase functions serve` matches.
  const functionsEnv = new URL('../supabase/functions/.env', import.meta.url)
  secret = existsSync(functionsEnv) ? readFileSync(functionsEnv, 'utf8').match(/^NOTIFY_SECRET=(.+)$/m)?.[1] : undefined
  if (!secret) fail('No NOTIFY_SECRET in supabase/functions/.env. Run npm run db:env first.')
  url = 'http://supabase_kong_ward-desk:8000/functions/v1/notify'
} else {
  step(`Reading the ${env} settings from GitHub`)
  ref = ghVar('SUPABASE_PROJECT_REF')
  if (!ref) fail(`No SUPABASE_PROJECT_REF variable on the ${env} GitHub environment (is gh signed in?).`)
  remote = [`--remote=${ref}`]
  url = `https://${ref}.supabase.co/functions/v1/notify`
  console.log(`  Project ${ref}`)

  if (!flags.yes) {
    const answer = await ask(`\nSet up notifications on ${env.toUpperCase()} (${ref})? This makes a new notify secret and redeploys the functions. [y/N] `)
    if (!/^y(es)?$/i.test(answer)) fail('Stopped. Nothing was changed.')
  }

  const publicKey = ghVar('VAPID_PUBLIC_KEY')
  const timeZone = ghVar('WARD_TIME_ZONE') || 'America/Denver'
  if (!publicKey) fail(`No VAPID_PUBLIC_KEY variable on the ${env} GitHub environment. See "Notifications" in README.md to make a key pair.`)

  step('Checking the functions’ secrets')
  let existing = []
  try {
    const listed = JSON.parse(supabase(['secrets', 'list', ...remote, '--output-format', 'json'], { capture: true }))
    const rows = Array.isArray(listed) ? listed : (listed.rows ?? listed.secrets ?? [])
    existing = rows.map((r) => ({ name: r.name ?? r.Name, digest: String(r.value ?? r.digest ?? r.Digest ?? '') }))
  } catch {
    console.log('  Could not read the list; setting everything.')
  }
  const has = (name) => existing.find((s) => s.name === name)
  const sha = (v) => createHash('sha256').update(v).digest('hex')
  const publicMatches = has('VAPID_PUBLIC_KEY') && has('VAPID_PUBLIC_KEY').digest.toLowerCase() === sha(publicKey)

  const secrets = { NOTIFY_SECRET: (secret = randomBytes(24).toString('hex')), WARD_TIME_ZONE: timeZone }
  if (!has('VAPID_SUBJECT')) secrets.VAPID_SUBJECT = 'mailto:noreply@warddesk.app'
  if (has('VAPID_PRIVATE_KEY') && (publicMatches || !/^[0-9a-f]{64}$/i.test(has('VAPID_PUBLIC_KEY')?.digest ?? ''))) {
    console.log('  The VAPID key pair is already set; keeping it.')
  } else {
    console.log(has('VAPID_PRIVATE_KEY') ? '  The VAPID public key there doesn’t match GitHub’s, so the pair is set again.' : '  No VAPID private key there yet.')
    const privateKey = process.env.VAPID_PRIVATE_KEY || (await ask(`  Paste the ${env} VAPID private key (it won't show): `, { hidden: true }))
    if (!privateKey) fail('No VAPID private key given. Nothing was changed.')
    secrets.VAPID_PUBLIC_KEY = publicKey
    secrets.VAPID_PRIVATE_KEY = privateKey
  }

  step(`Setting ${Object.keys(secrets).join(', ')}`)
  const dir = mkdtempSync(join(tmpdir(), 'ward-desk-'))
  try {
    const file = join(dir, 'secrets.env')
    writeFileSync(file, Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 })
    supabase(['secrets', 'set', ...remote, '--env-file', file, '--yes'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  if (flags['skip-deploy']) {
    console.log('\n  Skipping the deploy (--skip-deploy).')
  } else {
    step('Building and deploying the notify and push functions')
    const build = spawnSync('npm', ['run', 'functions:build', '--silent'], { stdio: 'inherit' })
    if (build.status !== 0) fail('Building the notify bundle failed.')
    supabase(['functions', 'deploy', 'notify', 'push', ...remote, '--yes'])
  }
}

step('Saving where to call and the secret in the database’s Vault')
runSql(`do $$ begin ${upsertVault('notify_url', url)} ${upsertVault('notify_secret', secret)} end $$;`, remote)

step('Trying one run of the scheduled job')
// Sends whatever is due right now, exactly as the 10-minute job would.
const started = runSql('select now()::text as at', remote, { readOnly: true })[0].at
runSql('select public.call_notify();', remote)
let response
for (let i = 0; i < 15 && !response; i++) {
  await new Promise((r) => setTimeout(r, 2000))
  response = runSql(`select status_code, content, error_msg from net._http_response where created >= ${quote(started)}::timestamptz order by created desc limit 1`, remote, { readOnly: true })[0]
}

if (!response) fail('No answer from the function after 30 seconds. Check it is deployed, then run this again.')
if (response.status_code !== 200) fail(`The function answered ${response.status_code ?? 'nothing'}: ${response.content ?? response.error_msg}`)

console.log(`\n✓ Notifications are set up on ${env}${ref ? ` (${ref})` : ''}. The job now runs every 10 minutes.`)
console.log(`  This run: ${response.content}`)
if (!local) {
  console.log('\n  Save this notify secret in your password manager. It is not shown again or kept anywhere else in plain text:')
  console.log(`\n      NOTIFY_SECRET (${env}): ${secret}\n`)
}
