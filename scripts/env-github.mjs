// Fills in a GitHub environment's variables and secrets, and the repository-wide ones it's missing:
//
//   npm run env:github -- staging
//   npm run env:github -- production
//   npm run env:github -- production --dry-run     # show what it would change, change nothing
//
// It keeps everything that is already right and only sets what is missing or wrong:
//   - SUPABASE_PROJECT_REF: asks which Supabase project, if it isn't set yet.
//   - SUPABASE_ANON_KEY: the project's publishable key, read from Supabase.
//   - CLOUDFLARE_PAGES_PROJECT, WARD_NAME (asked for; the header and installed app's name),
//     WARD_TIME_ZONE, ENABLE_GOOGLE (on if Google sign-in is on in Auth).
//   - SUPABASE_DB_URL: asks for the database password and builds the session pooler URL, then tests
//     it. If one is already set, it asks before replacing it.
//   - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY: makes a pair only when neither exists. Replacing a pair
//     signs every device out of notifications, so it never does that.
//   - Repository: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (asked for if missing), NOTIFY_ENABLED.
//   - Backups (repository, asked for if missing): BACKUP_AGE_RECIPIENT, BACKUP_R2_BUCKET,
//     BACKUP_R2_ENDPOINT, BACKUP_R2_ACCESS_KEY_ID, BACKUP_R2_SECRET_ACCESS_KEY, and
//     BACKUP_DB_URL_<ENV>, a copy of SUPABASE_DB_URL that the nightly backup on main can read.
//     BACKUP_ENABLED is left for you to turn on.
//   - production only: deploys limited to the production branch.
// It shows the list of changes and asks before making them, then offers to re-run the latest
// deploy, since the app reads the variables at build time. A new VAPID private key is printed once
// at the end for your password manager.
//
// Needs: `gh auth login` and `npx supabase login` done once on this machine.

import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { ENVIRONMENTS, ask, confirmOrStop, environmentArg, fail, gh, rowsOf, step, supabase } from './lib/cli.mjs'

const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: { 'dry-run': { type: 'boolean', default: false } } })
const env = environmentArg(positionals, 'env:github')
const dryRun = flags['dry-run']
const expected = ENVIRONMENTS[env]

const parse = (text, fallback) => {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}
const byName = (text) => Object.fromEntries(parse(text, []).map((v) => [v.name, v.value ?? true]))

/** Asks for a value, or in a dry run says it would. '' means skip. */
async function askFor(question, { hidden = false } = {}) {
  if (dryRun) {
    console.log(`  (would ask: ${question.trim()})`)
    return ''
  }
  return ask(`  ${question}`, { hidden })
}

// ---------------------------------------------------------------------------

step(`Reading the repository and the ${env} environment from GitHub`)
if (!gh(['api', 'user', '--jq', '.login'])) fail('gh isn’t signed in. Run gh auth login first.')
const repoVars = byName(ghRead(['variable', 'list', '--json', 'name,value']))
const repoSecrets = byName(ghRead(['secret', 'list', '--json', 'name']))
const envInfo = parse(ghRead(['api', `repos/{owner}/{repo}/environments/${env}`], { missingOk: true }), null)
const vars = envInfo ? byName(ghRead(['variable', 'list', '--env', env, '--json', 'name,value'])) : {}
const secrets = envInfo ? byName(ghRead(['secret', 'list', '--env', env, '--json', 'name'])) : {}
console.log(envInfo ? `  ${Object.keys(vars).length} variables and ${Object.keys(secrets).length} secrets on ${env}` : `  There’s no ${env} environment yet; it will be created.`)

/** Each change: where it goes, what it is, and how to show it (secrets never show). */
const changes = []
const setVar = (name, value, why, scope = 'env') => changes.push({ kind: 'variable', scope, name, value, why })
const setSecret = (name, value, why, scope = 'env') => changes.push({ kind: 'secret', scope, name, value, why })
const toPrint = []

// --- Repository-wide ---------------------------------------------------------

step('Repository settings')
if (!repoVars.CLOUDFLARE_ACCOUNT_ID) {
  const id = await askFor('Cloudflare account ID (from the Cloudflare dashboard; Enter to skip): ')
  if (id) setVar('CLOUDFLARE_ACCOUNT_ID', id, 'missing', 'repo')
}
if (!repoSecrets.CLOUDFLARE_API_TOKEN) {
  const token = await askFor('Cloudflare API token with only Account → Cloudflare Pages → Edit (won’t show; Enter to skip): ', { hidden: true })
  if (token) setSecret('CLOUDFLARE_API_TOKEN', token, 'missing', 'repo')
}
if (repoVars.NOTIFY_ENABLED !== 'true') setVar('NOTIFY_ENABLED', 'true', repoVars.NOTIFY_ENABLED ? `was "${repoVars.NOTIFY_ENABLED}"` : 'missing', 'repo')
console.log(changes.length ? `  ${changes.length} to set` : '  Nothing to change')

// --- Backups (see "Backups and restore" in README.md) ----------------------------
step('Backups')
const backupUrlName = `BACKUP_DB_URL_${env.toUpperCase()}`
const before = changes.length
if (!/^age1[0-9a-z]{58}$/.test(repoVars.BACKUP_AGE_RECIPIENT ?? '')) {
  const recipient = await askFor('age public key for backups, age1… (from age-keygen; Enter to skip): ')
  if (recipient && !/^age1[0-9a-z]{58}$/.test(recipient)) fail('That isn’t an age public key (age1 and 58 more characters). Nothing was changed.')
  if (recipient) setVar('BACKUP_AGE_RECIPIENT', recipient, repoVars.BACKUP_AGE_RECIPIENT ? 'not an age public key' : 'missing', 'repo')
}
if (!repoVars.BACKUP_R2_BUCKET) {
  const name = (await askFor('R2 bucket for backups [ward-desk-backups]: ')) || (dryRun ? '' : 'ward-desk-backups')
  if (name) setVar('BACKUP_R2_BUCKET', name, 'missing', 'repo')
}
const accountId = repoVars.CLOUDFLARE_ACCOUNT_ID ?? changes.find((c) => c.name === 'CLOUDFLARE_ACCOUNT_ID')?.value
if (!/^https:\/\/[0-9a-f]{32}\.(eu\.)?r2\.cloudflarestorage\.com$/.test(repoVars.BACKUP_R2_ENDPOINT ?? '') && accountId) {
  setVar('BACKUP_R2_ENDPOINT', `https://${accountId}.r2.cloudflarestorage.com`, repoVars.BACKUP_R2_ENDPOINT ? 'not an R2 endpoint' : 'missing', 'repo')
}
if (!repoSecrets.BACKUP_R2_ACCESS_KEY_ID || !repoSecrets.BACKUP_R2_SECRET_ACCESS_KEY) {
  console.log('  Make an R2 API token with Object Read & Write on the backup bucket only (R2 → Manage API tokens).')
  const id = await askFor('Its access key ID (Enter to skip): ')
  const secret = id ? await askFor('Its secret access key (won’t show): ', { hidden: true }) : ''
  if (id && secret) {
    setSecret('BACKUP_R2_ACCESS_KEY_ID', id, 'missing', 'repo')
    setSecret('BACKUP_R2_SECRET_ACCESS_KEY', secret, 'missing', 'repo')
  }
}
console.log(changes.length > before ? `  ${changes.length - before} to set` : '  Nothing to change')

// --- The Supabase project ------------------------------------------------------

step('Supabase project')
const projects = rowsOf(JSON.parse(supabase(['projects', 'list', '--output-format', 'json'], { capture: true })), 'projects')
let ref = vars.SUPABASE_PROJECT_REF
if (ref && !projects.some((p) => p.ref === ref)) fail(`SUPABASE_PROJECT_REF on ${env} is ${ref}, but your Supabase account has no such project. Check you’re signed in to the right account (npx supabase login).`)
if (!ref) {
  console.log('  Your Supabase projects:')
  for (const p of projects) console.log(`    ${p.ref}  ${p.name} (${p.region})`)
  if (dryRun) fail('SUPABASE_PROJECT_REF isn’t set; run without --dry-run to choose the project.')
  ref = await ask(`  Which is ${env}? Project ref: `)
  if (!projects.some((p) => p.ref === ref)) fail(`${ref || 'Nothing'} isn’t one of those. Nothing was changed.`)
  setVar('SUPABASE_PROJECT_REF', ref, 'missing')
}
const project = projects.find((p) => p.ref === ref)
const remote = [`--remote=${ref}`]
console.log(`  ${project.name} (${ref}, ${project.region})`)

const keys = rowsOf(JSON.parse(supabase(['projects', 'api-keys', ...remote, '--output-format', 'json'], { capture: true })), 'keys')
const anonKey = (keys.find((k) => k.type === 'publishable') ?? keys.find((k) => k.name === 'anon'))?.api_key
if (!anonKey) fail('The project has no publishable or anon key.')
const currentIsValid = keys.some((k) => (k.type === 'publishable' || k.name === 'anon') && k.api_key === vars.SUPABASE_ANON_KEY)
if (!currentIsValid) setVar('SUPABASE_ANON_KEY', anonKey, vars.SUPABASE_ANON_KEY ? 'not one of this project’s keys' : 'missing')

// --- Build settings --------------------------------------------------------------

step('Build settings')
if (vars.CLOUDFLARE_PAGES_PROJECT !== expected.pagesProject) setVar('CLOUDFLARE_PAGES_PROJECT', expected.pagesProject, vars.CLOUDFLARE_PAGES_PROJECT ? `was "${vars.CLOUDFLARE_PAGES_PROJECT}"` : 'missing')
if (!vars.WARD_NAME?.trim()) {
  const name = (await askFor('Ward name, shown in the header and as the installed app’s name [Ward Desk]: ')) || 'Ward Desk'
  setVar('WARD_NAME', name, 'missing')
}
if (!validTimeZone(vars.WARD_TIME_ZONE)) {
  const zone = (await askFor('Ward time zone [America/Denver]: ')) || 'America/Denver'
  if (!validTimeZone(zone)) fail(`${zone} isn’t a time zone (like America/Denver). Nothing was changed.`)
  setVar('WARD_TIME_ZONE', zone, vars.WARD_TIME_ZONE ? `"${vars.WARD_TIME_ZONE}" isn’t a time zone` : 'missing')
}
if (vars.ENABLE_GOOGLE !== 'true' && vars.ENABLE_GOOGLE !== 'false') {
  const settings = await fetch(`https://${ref}.supabase.co/auth/v1/settings`, { headers: { apikey: anonKey } }).then((r) => r.json()).catch(() => ({}))
  setVar('ENABLE_GOOGLE', settings.external?.google ? 'true' : 'false', `missing; Google sign-in is ${settings.external?.google ? 'on' : 'off'} in Auth`)
}

// --- Notification keys -------------------------------------------------------------

step('Notification keys (VAPID)')
const hasPublic = !!vars.VAPID_PUBLIC_KEY
const hasPrivate = !!secrets.VAPID_PRIVATE_KEY
if (!hasPublic && !hasPrivate) {
  const { default: webpush } = await import('web-push')
  const pair = webpush.generateVAPIDKeys()
  setVar('VAPID_PUBLIC_KEY', pair.publicKey, 'new pair')
  setSecret('VAPID_PRIVATE_KEY', pair.privateKey, 'new pair')
  toPrint.push([`VAPID_PRIVATE_KEY (${env})`, pair.privateKey])
  console.log('  None yet, so a new pair is made.')
} else if (hasPublic && !hasPrivate) {
  console.log('  VAPID_PUBLIC_KEY is set but the VAPID_PRIVATE_KEY secret isn’t. A new pair would sign every device out of notifications, so paste the existing private key instead.')
  const privateKey = await askFor('VAPID private key that goes with that public key (won’t show; Enter to skip): ', { hidden: true })
  if (privateKey) setSecret('VAPID_PRIVATE_KEY', privateKey, 'missing')
} else if (!hasPublic && hasPrivate) {
  console.log('  The VAPID_PRIVATE_KEY secret is set but VAPID_PUBLIC_KEY isn’t.')
  const publicKey = await askFor('VAPID public key that goes with it (Enter to skip): ')
  if (publicKey) setVar('VAPID_PUBLIC_KEY', publicKey, 'missing')
} else {
  console.log('  Both are set; keeping them.')
}

// --- Database URL --------------------------------------------------------------------

step('Database connection for deploys (SUPABASE_DB_URL)')
let replaceDb = !secrets.SUPABASE_DB_URL
if (!replaceDb && !dryRun) replaceDb = /^y(es)?$/i.test(await ask('  It’s set (GitHub can’t show it). Replace it? [y/N] '))
if (!replaceDb && secrets.SUPABASE_DB_URL) console.log('  Keeping it.')
// The backup's copy is set along with it, or on its own (which needs the password again).
const needBackupUrl = replaceDb || !repoSecrets[backupUrlName]
if (!replaceDb && needBackupUrl) console.log(`  The repository secret ${backupUrlName} (the same URL, for nightly backups) isn’t set.`)
if (needBackupUrl) {
  const password = await askFor(`Database password for ${project.name} (won’t show): `, { hidden: true })
  if (password) {
    const url = await sessionPoolerUrl(ref, project.region, password)
    if (replaceDb) setSecret('SUPABASE_DB_URL', url, secrets.SUPABASE_DB_URL ? 'replaced' : 'missing')
    setSecret(backupUrlName, url, repoSecrets[backupUrlName] ? 'replaced with SUPABASE_DB_URL' : 'missing', 'repo')
  } else if (!dryRun) {
    console.log('  No password given; skipping it.')
  }
}

// --- Deployment branch rule ----------------------------------------------------------

let branchRule = false
if (env === 'production') {
  step('Deployment branches')
  const branches = envInfo ? parse(ghRead(['api', 'repos/{owner}/{repo}/environments/production/deployment-branch-policies']), {}).branch_policies ?? [] : []
  const policy = envInfo?.deployment_branch_policy
  branchRule = !(policy?.custom_branch_policies && branches.length === 1 && branches[0].name === 'production')
  console.log(branchRule ? `  Will allow deploys only from the production branch (now: ${branches.map((b) => b.name).join(', ') || 'any branch'}).` : '  Only the production branch can deploy.')
}

// --- Confirm and apply -----------------------------------------------------------------

if (!changes.length && !branchRule && envInfo) {
  console.log(`\n✓ Nothing to change on ${env}.`)
  process.exit(0)
}

console.log(`\nChanges for ${env.toUpperCase()}:`)
if (!envInfo) console.log(`  create the ${env} environment`)
for (const c of changes) {
  const where = c.scope === 'repo' ? 'repository' : env
  const shown = c.kind === 'secret' ? '(hidden)' : c.name === 'SUPABASE_ANON_KEY' ? `${c.value.slice(0, 16)}…` : c.value.length > 40 ? `${c.value.slice(0, 20)}…` : c.value
  console.log(`  ${where} ${c.kind} ${c.name} = ${shown}  (${c.why})`)
}
if (branchRule) console.log('  limit deploys to the production branch')

if (dryRun) {
  console.log('\nDry run: nothing was changed.')
  process.exit(0)
}
await confirmOrStop(`Make these changes on GitHub for ${env.toUpperCase()}?`)

step('Saving')
if (!envInfo || branchRule) {
  const body = env === 'production' ? { deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } } : {}
  ghOrFail(['api', '-X', 'PUT', `repos/{owner}/{repo}/environments/${env}`, '--input', '-'], JSON.stringify(body))
}
if (branchRule) {
  const existing = parse(ghRead(['api', 'repos/{owner}/{repo}/environments/production/deployment-branch-policies']), {}).branch_policies ?? []
  for (const b of existing.filter((b) => b.name !== 'production')) ghOrFail(['api', '-X', 'DELETE', `repos/{owner}/{repo}/environments/production/deployment-branch-policies/${b.id}`])
  if (!existing.some((b) => b.name === 'production')) ghOrFail(['api', '-X', 'POST', 'repos/{owner}/{repo}/environments/production/deployment-branch-policies', '-f', 'name=production', '-f', 'type=branch'])
  console.log('  ✓ deploys limited to the production branch')
}
for (const c of changes) {
  const target = c.scope === 'repo' ? [] : ['--env', env]
  // Values go in on stdin, so they never show in the process list.
  ghOrFail([c.kind, 'set', c.name, ...target], c.value)
  console.log(`  ✓ ${c.scope === 'repo' ? 'repository' : env} ${c.kind} ${c.name}`)
}

// --- Re-run the deploy ----------------------------------------------------------------------

const buildVars = ['SUPABASE_PROJECT_REF', 'SUPABASE_ANON_KEY', 'WARD_NAME', 'WARD_TIME_ZONE', 'ENABLE_GOOGLE', 'VAPID_PUBLIC_KEY', 'CLOUDFLARE_PAGES_PROJECT', 'SUPABASE_DB_URL', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']
if (changes.some((c) => buildVars.includes(c.name))) {
  const branch = env === 'production' ? 'production' : 'main'
  const latest = parse(gh(['run', 'list', '--workflow', 'ci.yml', '--branch', branch, '--event', 'push', '--limit', '1', '--json', 'databaseId,displayTitle,status']), [])[0]
  if (!latest) {
    console.log(`\n  No deploy has run from ${branch} yet. ${env === 'production' ? 'Promote with git push origin main:production' : 'Push to main'} to deploy with these settings.`)
  } else if (latest.status !== 'completed') {
    console.log(`\n  A deploy from ${branch} is running now ("${latest.displayTitle}"). Re-run it once it finishes, so the build picks these up.`)
  } else if (/^y(es)?$/i.test(await ask(`\nThe app reads these when it’s built. Re-run the latest ${env} deploy ("${latest.displayTitle}")? [y/N] `))) {
    ghOrFail(['run', 'rerun', String(latest.databaseId)])
    console.log(`  ✓ Started. Watch it with: gh run watch ${latest.databaseId}`)
  }
}

if (repoVars.BACKUP_ENABLED !== 'true') console.log('\n  Nightly backups are off. Once R2 and the age key are set up, turn them on: gh variable set BACKUP_ENABLED --body true')
if (repoVars.DEPLOY_ENABLED !== 'true') console.log('\n  Deploys are off. Once both environments are set up, turn them on: gh variable set DEPLOY_ENABLED --body true')
console.log(`\n✓ GitHub is set up for ${env}. Check everything with: npm run env:check -- ${env}`)
if (toPrint.length) {
  console.log('\n  Save this in your password manager. It is not shown again, and GitHub can’t show it back:')
  for (const [name, value] of toPrint) console.log(`\n      ${name}: ${value}`)
  console.log('')
}

// ---------------------------------------------------------------------------

function validTimeZone(zone) {
  if (!zone) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * Reads from GitHub, retrying once. A failed read stops the script rather than looking like
 * "not set", which would plan to overwrite settings that are fine. `missingOk` turns a 404 into ''.
 */
function ghRead(args, { missingOk = false } = {}) {
  let result
  for (let attempt = 0; attempt < 2; attempt++) {
    result = spawnSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    if (result.status === 0) return result.stdout.trim()
    if (missingOk && /HTTP 404|Not Found/i.test(result.stderr)) return ''
  }
  fail(`Couldn’t read from GitHub (gh ${args.slice(0, 3).join(' ')}): ${result.stderr.trim()}. Nothing was changed.`)
}

function ghOrFail(args, input) {
  const result = spawnSync('gh', args, { encoding: 'utf8', input: input ?? '', stdio: ['pipe', 'pipe', 'pipe'] })
  if (result.status !== 0) fail(`gh ${args.slice(0, 3).join(' ')} failed: ${result.stderr.trim()}`)
  return result.stdout
}

/**
 * The session pooler connection string (IPv4, which GitHub's runners need). The pooler host is
 * aws-0 or aws-1 depending on when the project was made, so it tries each and keeps the one that
 * connects. The password is percent-encoded and only ever handled in this process.
 */
async function sessionPoolerUrl(ref, region, password) {
  const { default: postgres } = await import('postgres')
  let lastError = ''
  for (const cluster of ['aws-0', 'aws-1']) {
    const url = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${cluster}-${region}.pooler.supabase.com:5432/postgres`
    const sql = postgres(url, { max: 1, connect_timeout: 10, prepare: false, onnotice: () => {} })
    try {
      await sql`select 1`
      console.log(`  ✓ Connected through ${cluster}-${region}.pooler.supabase.com`)
      return url
    } catch (error) {
      lastError = error.message
      // A wrong password is the same on both hosts; only "tenant not found" means try the other.
      if (/password authentication failed/i.test(lastError)) fail('The database password is wrong. Nothing was changed. (Reset it under Database → Settings if you don’t have it.)')
    } finally {
      await sql.end({ timeout: 2 }).catch(() => {})
    }
  }
  fail(`Couldn’t connect through the session pooler: ${lastError}. Nothing was changed.`)
}
