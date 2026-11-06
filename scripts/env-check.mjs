// Checks that one environment is set up, without changing anything:
//
//   npm run env:check -- staging
//   npm run env:check -- production
//   npm run env:check -- local
//
// For staging and production it reads the GitHub repository and environment settings, the
// Supabase functions and their secrets (names and digests only), the database's Vault names, the
// last answer from the notify function, the health check and its alert emails, the Auth settings
// and the allowlist. Each line is ✓ or ✗,
// and each ✗ shows the command that fixes it. Secret values are never read or printed: GitHub
// secrets are checked for presence only.
//
// Exits 1 when anything is ✗, so it can gate other scripts.
//
// Needs: `gh auth login` and `npx supabase login` done once on this machine.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { ENVIRONMENTS, environmentArg, firstLine, ghTry, querySql, rowsOf, supabaseJson, supabaseTry, withPrivateFileAsync } from './lib/cli.mjs'

const { positionals } = parseArgs({ allowPositionals: true })
const env = environmentArg(positionals, 'env:check', ['staging', 'production', 'local'])

// ---------------------------------------------------------------------------
// Reporting

const sections = []
function section(title) {
  const lines = []
  sections.push({ title, lines })
  return {
    check(pass, label, { detail, fix } = {}) {
      lines.push({ pass, label, detail, fix })
      return pass
    },
    note(label) {
      lines.push({ pass: null, label })
    },
    /** Keeps a line's place for a check whose answer comes later. */
    later() {
      const line = { pass: null, label: '' }
      lines.push(line)
      return { check: (pass, label, { detail, fix } = {}) => Object.assign(line, { pass, label, detail, fix }) }
    },
  }
}

function report() {
  let failed = 0
  let total = 0
  for (const { title, lines } of sections) {
    console.log(`\n${title}`)
    for (const { pass, label, detail, fix } of lines) {
      if (pass === null) {
        console.log(`  – ${label}`)
        continue
      }
      total++
      if (!pass) failed++
      console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? ` (${detail})` : ''}`)
      if (!pass && fix) console.log(`      fix: ${fix}`)
    }
  }
  console.log(failed ? `\n✗ ${failed} of ${total} checks failed on ${env}.` : `\n✓ All ${total} checks pass on ${env}.`)
  process.exit(failed ? 1 : 0)
}

const sha = (v) => createHash('sha256').update(v).digest('hex')
const json = (text, fallback) => {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------------------

if (env === 'local') await checkLocal()
else await checkHosted()
report()

async function checkHosted() {
  const expected = ENVIRONMENTS[env]
  const fixGithub = `npm run env:github -- ${env}`
  const fixNotify = `npm run notify:setup -- ${env}`
  const fixAuth = `npm run env:auth -- ${env}`

  const [repoVarsOut, repoSecretsOut, envVarsOut, envSecretsOut, envOut, policiesOut] = await Promise.all([
    ghTry(['variable', 'list', '--json', 'name,value']),
    ghTry(['secret', 'list', '--json', 'name']),
    ghTry(['variable', 'list', '--env', env, '--json', 'name,value']),
    ghTry(['secret', 'list', '--env', env, '--json', 'name']),
    ghTry(['api', `repos/{owner}/{repo}/environments/${env}`]),
    env === 'production' ? ghTry(['api', 'repos/{owner}/{repo}/environments/production/deployment-branch-policies']) : null,
  ])

  const github = section('GitHub repository')
  if (!repoVarsOut.ok) {
    github.check(false, 'GitHub CLI can read the repository', { detail: firstLine(repoVarsOut.stderr), fix: 'gh auth login' })
    return
  }
  const repoVars = Object.fromEntries(json(repoVarsOut.stdout, []).map((v) => [v.name, v.value]))
  const repoSecrets = new Set(json(repoSecretsOut.stdout, []).map((s) => s.name))
  github.check(!!repoVars.CLOUDFLARE_ACCOUNT_ID, 'variable CLOUDFLARE_ACCOUNT_ID', { fix: fixGithub })
  github.check(repoVars.DEPLOY_ENABLED === 'true', 'variable DEPLOY_ENABLED is true', { detail: repoVars.DEPLOY_ENABLED === 'true' ? undefined : repoVars.DEPLOY_ENABLED ? `it is "${repoVars.DEPLOY_ENABLED}"` : 'not set', fix: 'gh variable set DEPLOY_ENABLED --body true' })
  github.check(repoVars.NOTIFY_ENABLED === 'true', 'variable NOTIFY_ENABLED is true', { detail: repoVars.NOTIFY_ENABLED === 'true' ? undefined : repoVars.NOTIFY_ENABLED ? `it is "${repoVars.NOTIFY_ENABLED}"` : 'not set', fix: fixGithub })
  github.check(repoSecrets.has('CLOUDFLARE_API_TOKEN'), 'secret CLOUDFLARE_API_TOKEN', { fix: fixGithub })

  // Nightly backups (.github/workflows/backup.yml). Secrets: presence only. They're required for
  // production; staging backups are optional, so on staging these are notes, not failures.
  const backups = section('Backups (repository settings)')
  const backupCheck = (pass, label, options) => (env === 'production' ? backups.check(pass, label, options) : backups.note(`${pass ? 'set' : 'not set (optional on staging)'}: ${label}`))
  const backupUrlName = `BACKUP_DB_URL_${env.toUpperCase()}`
  backupCheck(/^age1[0-9a-z]{58}$/.test(repoVars.BACKUP_AGE_RECIPIENT ?? ''), 'variable BACKUP_AGE_RECIPIENT is an age public key', { detail: repoVars.BACKUP_AGE_RECIPIENT ? undefined : 'not set', fix: fixGithub })
  backupCheck(!!repoVars.BACKUP_R2_BUCKET, 'variable BACKUP_R2_BUCKET', { detail: repoVars.BACKUP_R2_BUCKET, fix: fixGithub })
  backupCheck(/^https:\/\/[0-9a-f]{32}\.(eu\.)?r2\.cloudflarestorage\.com$/.test(repoVars.BACKUP_R2_ENDPOINT ?? ''), 'variable BACKUP_R2_ENDPOINT is an R2 endpoint', { detail: repoVars.BACKUP_R2_ENDPOINT ?? 'not set', fix: fixGithub })
  for (const name of ['BACKUP_R2_ACCESS_KEY_ID', 'BACKUP_R2_SECRET_ACCESS_KEY', backupUrlName]) backupCheck(repoSecrets.has(name), `secret ${name}`, { fix: fixGithub })
  if (env === 'production') backups.check(repoVars.BACKUP_ENABLED === 'true', 'variable BACKUP_ENABLED is true', { detail: repoVars.BACKUP_ENABLED ?? 'not set', fix: 'gh variable set BACKUP_ENABLED --body true (after the R2 and age setup in the README)' })

  const ghEnv = section(`GitHub environment "${env}"`)
  if (!envOut.ok) {
    ghEnv.check(false, 'the environment exists', { fix: fixGithub })
    return
  }
  const unread = [[repoSecretsOut, 'repository secrets'], [envVarsOut, `${env} variables`], [envSecretsOut, `${env} secrets`]].filter(([out]) => !out.ok)
  for (const [out, what] of unread) ghEnv.check(false, `GitHub CLI can read the ${what}`, { detail: firstLine(out.stderr), fix: 'run it again, or gh auth login' })
  const vars = Object.fromEntries(json(envVarsOut.stdout, []).map((v) => [v.name, v.value]))
  const secrets = new Set(json(envSecretsOut.stdout, []).map((s) => s.name))
  const ref = vars.SUPABASE_PROJECT_REF
  ghEnv.check(/^[a-z]{20}$/.test(ref ?? ''), 'variable SUPABASE_PROJECT_REF', { detail: ref, fix: fixGithub })
  const anonCheck = ghEnv.later() // filled in once the project's keys are read
  const cfOk = vars.CLOUDFLARE_PAGES_PROJECT === expected.pagesProject
  ghEnv.check(cfOk, `variable CLOUDFLARE_PAGES_PROJECT is ${expected.pagesProject}`, { detail: cfOk ? undefined : vars.CLOUDFLARE_PAGES_PROJECT ? `it is "${vars.CLOUDFLARE_PAGES_PROJECT}"` : 'not set', fix: fixGithub })
  let tzOk = false
  try {
    tzOk = !!vars.WARD_TIME_ZONE && !!new Intl.DateTimeFormat('en', { timeZone: vars.WARD_TIME_ZONE })
  } catch {
    tzOk = false
  }
  ghEnv.check(tzOk, 'variable WARD_TIME_ZONE', { detail: vars.WARD_TIME_ZONE ? (tzOk ? vars.WARD_TIME_ZONE : `"${vars.WARD_TIME_ZONE}" is not a time zone`) : 'not set', fix: fixGithub })
  const google = vars.ENABLE_GOOGLE
  ghEnv.check(google === 'true' || google === 'false', 'variable ENABLE_GOOGLE is true or false', { detail: google ?? 'not set', fix: fixGithub })
  ghEnv.check(!!vars.VAPID_PUBLIC_KEY, 'variable VAPID_PUBLIC_KEY', { fix: fixGithub })
  ghEnv.check(secrets.has('SUPABASE_DB_URL'), 'secret SUPABASE_DB_URL', { detail: 'present; the value can’t be read back', fix: fixGithub })
  ghEnv.check(secrets.has('VAPID_PRIVATE_KEY'), 'secret VAPID_PRIVATE_KEY', { detail: 'present; the value can’t be read back', fix: fixGithub })
  if (env === 'staging') {
    const admins = (vars.STAGING_ADMIN_EMAILS ?? '').split(',').filter((e) => e.trim())
    ghEnv.check(admins.length > 0, 'variable STAGING_ADMIN_EMAILS', { detail: admins.length ? `${admins.length} address${admins.length === 1 ? '' : 'es'}` : 'not set, so a training-site reset leaves no admin', fix: 'npm run admin:add -- staging <your email>' })
  }
  if (env === 'production') {
    const policy = json(envOut.stdout, {}).deployment_branch_policy
    const branches = json(policiesOut?.stdout ?? '', {}).branch_policies ?? []
    const onlyProduction = !!policy?.custom_branch_policies && branches.length === 1 && branches[0].name === 'production' && (branches[0].type ?? 'branch') === 'branch'
    ghEnv.check(onlyProduction, 'deploys only from the production branch', { detail: onlyProduction ? undefined : policy ? `allowed: ${branches.map((b) => b.name).join(', ') || (policy.protected_branches ? 'protected branches' : 'any branch')}` : 'any branch', fix: fixGithub })
  }

  if (!ref) {
    anonCheck.check(!!vars.SUPABASE_ANON_KEY, 'variable SUPABASE_ANON_KEY', { fix: fixGithub })
    section('Supabase').note(`Skipped: no SUPABASE_PROJECT_REF on the ${env} environment.`)
    return
  }
  const remote = [`--remote=${ref}`]
  const anonKey = vars.SUPABASE_ANON_KEY

  const [keysOut, secretsOut, functionsOut, dbOut, authConfig, authSettings, passkeyOptions] = await Promise.all([
    supabaseJson(['projects', 'api-keys', ...remote]),
    supabaseJson(['secrets', 'list', ...remote]),
    supabaseJson(['functions', 'list', ...remote]),
    querySql(
      `select
        (select coalesce(array_agg(name order by name), '{}') from vault.secrets where name in ('notify_url', 'notify_secret', 'alert_email', 'resend_api_key')) as vault,
        to_regclass('public.allowlist') is not null as has_schema,
        to_regclass('net._http_response') is not null as has_net,
        to_regclass('public.health_state') is not null as has_health,
        -- Through query_to_xml, so it still runs before the backup_runs migration is applied.
        case when to_regclass('public.backup_runs') is not null then (xpath('/row/m/text()', query_to_xml('select max(finished_at) as m from public.backup_runs', false, true, '')))[1]::text end as last_backup`,
      remote,
    ),
    liveAuthConfig(remote),
    anonKey ? fetchJson(`https://${ref}.supabase.co/auth/v1/settings`, { headers: { apikey: anonKey } }) : { error: 'no anon key on GitHub' },
    // The options a browser asks for before a passkey sign-in. They name the relying party.
    anonKey ? fetchJson(`https://${ref}.supabase.co/auth/v1/passkeys/authentication/options`, { method: 'POST', headers: { apikey: anonKey, 'content-type': 'application/json' }, body: '{}' }) : { error: 'no anon key on GitHub' },
  ])

  // The anon key on GitHub must be one of this project's public keys.
  if (keysOut.error) {
    anonCheck.check(false, 'variable SUPABASE_ANON_KEY matches the project', { detail: `couldn’t read the project’s keys: ${keysOut.error}`, fix: 'npx supabase login' })
  } else {
    const publicKeys = rowsOf(keysOut.data, 'keys').filter((k) => k.type === 'publishable' || k.name === 'anon').map((k) => k.api_key)
    anonCheck.check(!!anonKey && publicKeys.includes(anonKey), 'variable SUPABASE_ANON_KEY matches the project', { detail: anonKey ? undefined : 'not set', fix: fixGithub })
  }

  const fns = section(`Supabase functions (${ref})`)
  if (functionsOut.error) {
    fns.check(false, 'Supabase CLI can read the project', { detail: functionsOut.error, fix: 'npx supabase login' })
  } else {
    const deployed = rowsOf(functionsOut.data, 'functions')
    for (const slug of ['notify', 'push']) {
      const fn = deployed.find((f) => f.slug === slug)
      fns.check(fn?.status === 'ACTIVE', `function ${slug} is deployed`, { detail: fn ? `version ${fn.version}, ${fn.status}` : 'not deployed', fix: fixNotify })
    }
  }
  if (!secretsOut.error) {
    const listed = rowsOf(secretsOut.data, 'secrets').map((r) => ({ name: r.name ?? r.Name, digest: String(r.value ?? r.digest ?? r.Digest ?? '').toLowerCase() }))
    const find = (name) => listed.find((s) => s.name === name)
    for (const name of ['NOTIFY_SECRET', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) fns.check(!!find(name), `secret ${name}`, { fix: fixNotify })
    for (const [name, githubValue] of [['VAPID_PUBLIC_KEY', vars.VAPID_PUBLIC_KEY], ['WARD_TIME_ZONE', vars.WARD_TIME_ZONE]]) {
      const secret = find(name)
      const comparable = /^[0-9a-f]{64}$/.test(secret?.digest ?? '')
      const matches = !!secret && (!githubValue || !comparable || secret.digest === sha(githubValue))
      fns.check(matches, `secret ${name}${githubValue && comparable ? ' matches GitHub' : ''}`, { detail: secret ? (matches ? undefined : 'differs from the GitHub variable') : 'not set', fix: fixNotify })
    }
  } else {
    fns.check(false, 'the functions’ secrets', { detail: secretsOut.error, fix: 'npx supabase login' })
  }

  const db = section('Database')
  if (dbOut.error) {
    db.check(false, 'the database can be queried', { detail: dbOut.error, fix: `npx supabase login, and check ${env} has had a deploy` })
  } else {
    const row = dbOut.rows[0] ?? {}
    db.check(!!row.has_schema, 'migrations have been applied', { detail: row.has_schema ? undefined : 'no app tables yet', fix: env === 'production' ? 'git push origin main:production (the deploy applies them)' : 'push to main (the deploy applies them)' })
    const vault = parseArray(row.vault)
    // Only production is backed up nightly; staging backups are manual runs.
    if (env === 'production') {
      const hours = row.last_backup ? (Date.now() - new Date(row.last_backup).getTime()) / 3_600_000 : null
      db.check(hours !== null && hours < 26, 'a backup finished in the last 26 hours', { detail: hours === null ? 'none recorded in public.backup_runs' : `last ${row.last_backup}`, fix: 'gh run list --workflow backup.yml, or start one: gh workflow run backup.yml' })
    }
    for (const name of ['notify_url', 'notify_secret']) db.check(vault.includes(name), `Vault has ${name}`, { fix: fixNotify })
    // pg_net arrives with the notifications migration; before that there is nothing to call.
    // Since the health check migration, notify_calls says which answers were the notify function's
    // (alert emails go through pg_net too).
    const answers = row.has_net
      ? await querySql(
          row.has_health
            ? `select r.status_code as status, r.error_msg as error, r.created as at from public.notify_calls c join net._http_response r on r.id = c.request_id order by c.called_at desc limit 1`
            : `select status_code as status, error_msg as error, created as at from net._http_response order by created desc limit 1`,
          remote,
        )
      : { rows: [] }
    const last = answers.rows?.[0]
    db.check(last?.status === 200, 'the last call to the notify function answered 200', {
      detail: answers.error ?? (last ? `${last.status ?? last.error ?? 'no answer'}, ${new Date(last.at).toLocaleString()}` : row.has_net ? 'no calls yet' : 'pg_net isn’t installed yet: deploy the notifications migration first'),
      fix: last?.status === 401 ? `${fixNotify} (401: the Vault secret and NOTIFY_SECRET differ)` : fixNotify,
    })
    if (row.has_health) {
      const fixAlerts = `npm run alerts:setup -- ${env}`
      for (const name of ['alert_email', 'resend_api_key']) db.check(vault.includes(name), `Vault has ${name}, so the health check can email`, { fix: fixAlerts })
      const health = await querySql(
        `select s.checked_at, s.last_email_at, r.status_code as email_status, r.error_msg as email_error,
          (select count(*)::int from public.client_errors where created_at > now() - interval '7 days') as errors_week
        from public.health_state s left join net._http_response r on r.id = s.last_email_request`,
        remote,
      )
      const h = health.rows?.[0]
      const recent = !!h?.checked_at && Date.now() - new Date(h.checked_at).getTime() < 2 * 60 * 60 * 1000
      db.check(recent, 'the hourly health check is running', {
        detail: health.error ?? (h?.checked_at ? `last ran ${new Date(h.checked_at).toLocaleString()}` : 'hasn’t run yet (it runs at 7 past the hour)'),
        fix: 'check the health job: select * from cron.job_run_details order by start_time desc limit 5',
      })
      if (h?.last_email_at) {
        // pg_net keeps answers 6 hours, so an older email may have no answer left to show.
        const ok = h.email_status === 200 || (h.email_status == null && !h.email_error)
        db.check(ok, 'the last alert email was accepted by Resend', { detail: `${h.email_status ?? h.email_error ?? 'answer no longer kept'}, sent ${new Date(h.last_email_at).toLocaleString()}`, fix: fixAlerts })
      }
      if (h) db.note(`${h.errors_week} app error${h.errors_week === 1 ? '' : 's'} reported in the last 7 days`)
    }
    if (row.has_schema) {
      const admins = await querySql(`select count(*)::int as admins from public.allowlist where 'admin' = any(initial_roles)`, remote)
      const count = admins.rows?.[0]?.admins ?? 0
      db.check(count > 0, 'the allowlist has an admin', { detail: admins.error ?? `${count}`, fix: `npm run admin:add -- ${env} <your email>` })
    }
  }

  const auth = section('Auth')
  if (authConfig.error) {
    auth.check(false, 'Auth settings can be read', { detail: authConfig.error, fix: 'npx supabase login' })
  } else {
    const get = (path) => authConfig.values[path]
    auth.check(get('auth.site_url') === expected.url, `site URL is ${expected.url}`, { detail: get('auth.site_url') === expected.url ? undefined : (get('auth.site_url') ?? 'not set'), fix: fixAuth })
    const redirects = get('auth.additional_redirect_urls') ?? []
    auth.check(redirects.some((u) => u === expected.url || u.startsWith(`${expected.url}/`)), `redirect URLs include ${expected.url}`, { detail: redirects.includes(expected.url) ? undefined : redirects.join(', ') || 'none', fix: fixAuth })
    const smtp = { enabled: get('auth.email.smtp.enabled'), host: get('auth.email.smtp.host'), port: get('auth.email.smtp.port'), user: get('auth.email.smtp.user'), sender: get('auth.email.smtp.admin_email') }
    const smtpOk = smtp.enabled === true && smtp.host === 'smtp.resend.com' && Number(smtp.port) === 465 && smtp.user === 'resend' && smtp.sender === 'noreply@warddesk.app'
    auth.check(smtpOk, 'email sends through Resend (smtp.resend.com:465, from noreply@warddesk.app)', { detail: smtpOk ? undefined : smtp.enabled ? `${smtp.host}:${smtp.port}, user ${smtp.user}, from ${smtp.sender}` : 'custom SMTP is off', fix: fixAuth })
  }
  if (authSettings.error) {
    auth.check(false, 'passkeys are on', { detail: `couldn’t read ${ref}.supabase.co/auth/v1/settings: ${authSettings.error}`, fix: fixGithub })
  } else {
    auth.check(authSettings.data.passkeys_enabled === true, 'passkeys are on', { fix: fixAuth })
    const host = new URL(expected.url).host
    const rpId = passkeyOptions.data?.options?.rpId
    if (authSettings.data.passkeys_enabled) auth.check(rpId === host, `passkey relying party is ${host}`, { detail: rpId === host ? undefined : (rpId ?? passkeyOptions.error ?? 'not set'), fix: fixAuth })
    const googleOn = authSettings.data.external?.google === true
    if (google === 'true') auth.check(googleOn, 'Google sign-in is on (ENABLE_GOOGLE is true)', { fix: fixAuth })
    else auth.note(`Google sign-in is ${googleOn ? 'on' : 'off'} in Auth; the app hides the button while ENABLE_GOOGLE is ${google ?? 'unset'}.`)
  }
}

async function checkLocal() {
  const root = new URL('..', import.meta.url).pathname
  const tools = section('This machine')
  const want = readFileSync(join(root, '.nvmrc'), 'utf8').trim().replace(/^v/, '')
  const have = process.versions.node
  tools.check(have === want, `Node ${want} (from .nvmrc)`, { detail: have === want ? undefined : `running ${have}`, fix: 'nvm install && nvm use' })
  tools.check(existsSync(join(root, 'node_modules/.package-lock.json')), 'packages installed', { fix: 'npm install' })
  const docker = await supabaseTry(['status', '-o', 'json'])
  const status = docker.ok ? json(docker.stdout, null) : null
  tools.check(!!status?.API_URL, 'local Supabase is running', { detail: status?.API_URL ?? firstLine(docker.stderr), fix: 'npm run db:start' })

  const files = section('Local settings')
  const envFile = join(root, '.env')
  const envText = existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''
  const envUrl = envText.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]
  files.check(!!envUrl && (!status?.API_URL || envUrl === status.API_URL), '.env points at local Supabase', { detail: envUrl ?? 'no .env', fix: 'npm run db:env' })
  const functionsEnv = join(root, 'supabase/functions/.env')
  const functionsSecret = existsSync(functionsEnv) ? readFileSync(functionsEnv, 'utf8').match(/^NOTIFY_SECRET=(.+)$/m)?.[1] : undefined
  files.check(!!functionsSecret, 'supabase/functions/.env has NOTIFY_SECRET', { fix: 'npm run db:env' })

  if (!status?.API_URL) return
  const db = section('Local database')
  const out = await querySql(
    `select
      (select coalesce(array_agg(name order by name), '{}') from vault.secrets where name in ('notify_url', 'notify_secret')) as vault,
      (select count(*) from public.allowlist where 'admin' = any(initial_roles))::int as admins`,
    [],
  )
  if (out.error) {
    db.check(false, 'the local database can be queried', { detail: out.error, fix: 'npm run db:start' })
    return
  }
  const row = out.rows[0] ?? {}
  const vault = parseArray(row.vault)
  if (vault.includes('notify_url') && vault.includes('notify_secret')) db.check(true, 'Vault has notify_url and notify_secret')
  else db.note('Vault has no notify_url / notify_secret. Only needed to try scheduled notifications locally: npm run notify:setup -- local')
  db.check(Number(row.admins) > 0, 'the allowlist has an admin', { detail: `${row.admins ?? 0}`, fix: 'the seed adds them; npm run db:reset reloads it (it wipes the local database every worktree shares)' })
}

// ---------------------------------------------------------------------------

/** Postgres arrays come back as JSON arrays or as `{a,b}` text depending on the driver. */
function parseArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return value.replace(/^\{|\}$/g, '').split(',').filter(Boolean)
  return []
}

async function fetchJson(url, init) {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) })
    if (!response.ok) return { error: `HTTP ${response.status}` }
    return { data: await response.json() }
  } catch (error) {
    return { error: error.message }
  }
}

/**
 * The project's live Auth settings, read with `supabase config pull --dry-run` against an empty
 * config in a temp folder, so every setting that isn't a default shows up as "remote only". Nothing
 * is written: it's a dry run, and the folder is deleted. Secret values come back masked or not at all.
 */
async function liveAuthConfig(remote) {
  return withPrivateFileAsync('placeholder', '', async (placeholder) => {
    const workdir = join(placeholder, '..', 'project')
    mkdirSync(join(workdir, 'supabase'), { recursive: true })
    writeFileSync(join(workdir, 'supabase', 'config.toml'), 'project_id = "env-check"\n')
    const out = await supabaseJson(['config', 'pull', '--dry-run', ...remote, '--workdir', workdir])
    if (out.error) return { error: out.error }
    const values = {}
    for (const change of out.data.changes ?? []) values[change.path.join('.')] = change.remote
    return { values }
  })
}
