// Adds someone as an admin (with the bishopric role) before their first sign-in, since sign-in is
// refused for any email not on the allowlist:
//
//   npm run admin:add -- production you@example.com
//   npm run admin:add -- staging you@example.com
//
// Production: adds the email to public.allowlist with roles {admin,bishopric}.
// Staging: adds it to the STAGING_ADMIN_EMAILS GitHub variable, so a training-site reset re-adds
// them, and to the staging allowlist now. Real addresses never go in seed.sql.
//
// Roles are added to any the person already has, never replacing them. A database trigger passes
// them on to someone who has already signed in. Asks before changing anything (--yes skips that).
//
// Needs: `gh auth login` and `npx supabase login` done once on this machine.

import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { confirmOrStop, environmentArg, fail, gh, ghVar, quote, runSql, step } from './lib/cli.mjs'

const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: { yes: { type: 'boolean', default: false } } })
const env = environmentArg(positionals, 'admin:add')
const email = (positionals[1] ?? '').trim().toLowerCase()
if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)) fail(`Give the email to add: npm run admin:add -- ${env} you@example.com`)

step(`Reading the ${env} project from GitHub`)
if (!gh(['api', 'user', '--jq', '.login'])) fail('gh isn’t signed in. Run gh auth login first.')
const ref = ghVar('SUPABASE_PROJECT_REF', env)
if (!ref) fail(`No SUPABASE_PROJECT_REF on the ${env} GitHub environment. Run npm run env:github -- ${env} first.`)
const remote = [`--remote=${ref}`]
console.log(`  Project ${ref}`)

step('Checking the allowlist')
const [state] = runSql(`select to_regclass('public.allowlist') is not null as has_schema`, remote, { readOnly: true })
if (!state?.has_schema) fail(`The ${env} database has no allowlist yet, because its migrations haven’t run. ${env === 'production' ? 'Promote first (git push origin main:gp7)' : 'Push to main first'}, then run this again.`)
const [current] = runSql(`select initial_roles::text as roles from public.allowlist where email = ${quote(email)}`, remote, { readOnly: true })
console.log(current ? `  Already on it, with roles ${current.roles}` : '  Not on it yet')

let staged = []
let stagedChanged = false
if (env === 'staging') {
  staged = ghVar('STAGING_ADMIN_EMAILS', env).split(',').map((e) => e.trim()).filter(Boolean)
  stagedChanged = !staged.some((e) => e.toLowerCase() === email)
  console.log(stagedChanged ? `  Not in STAGING_ADMIN_EMAILS yet (${staged.length} there)` : '  Already in STAGING_ADMIN_EMAILS')
}

const hasRoles = current && ['admin', 'bishopric'].every((r) => current.roles.includes(r))
if (hasRoles && !stagedChanged) {
  console.log(`\n✓ ${email} is already an admin on ${env}.`)
  process.exit(0)
}

const changes = [
  !hasRoles && `add ${email} to the ${env} allowlist as admin and bishopric${current ? ' (keeping their other roles)' : ''}`,
  stagedChanged && `add ${email} to STAGING_ADMIN_EMAILS, so training-site resets keep them`,
].filter(Boolean)
console.log(`\nChanges for ${env.toUpperCase()}:\n${changes.map((c) => `  ${c}`).join('\n')}`)
await confirmOrStop('Make these changes?', { yes: flags.yes })

if (!hasRoles) {
  step('Adding to the allowlist')
  runSql(
    `insert into public.allowlist (email, initial_roles) values (${quote(email)}, '{admin,bishopric}')
     on conflict (email) do update
       set initial_roles = array(select distinct r from unnest(allowlist.initial_roles || excluded.initial_roles) as r order by r);`,
    remote,
  )
  console.log('  ✓ done')
}

if (stagedChanged) {
  step('Saving STAGING_ADMIN_EMAILS')
  const result = spawnSync('gh', ['variable', 'set', 'STAGING_ADMIN_EMAILS', '--env', 'staging'], { encoding: 'utf8', input: [...staged, email].join(',') })
  if (result.status !== 0) fail(`gh variable set failed: ${result.stderr.trim()}`)
  console.log('  ✓ done')
}

console.log(`\n✓ ${email} can sign in to ${env} as an admin.`)
