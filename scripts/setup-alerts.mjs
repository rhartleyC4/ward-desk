// Turns on alert emails for one environment:
//
//   npm run alerts:setup -- staging
//   npm run alerts:setup -- production
//
// Every hour the database's health check (public.health_check, in
// supabase/migrations/*_health_checks.sql) looks for failed notification runs, pushes that
// couldn't be delivered, failed scheduled jobs and errors in the app. When it finds any, it emails
// the alert address through Resend. This saves the address and a Resend API key in the database's
// Vault, then sends a test email and shows whether Resend accepted it. On production, once the
// BACKUP_ENABLED repository variable is true, it also turns on the alert for a missing nightly
// backup, so run it again after turning backups on.
//
// Use the project's own sending-only Resend key (the one Auth's SMTP uses). Running it again is
// safe: it replaces what's there.
//
// Needs: `gh auth login` and `npx supabase login` done once on this machine.
//
// Flags: --email <address[,address]> skips that question, --yes skips the "are you sure".

import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { ask, confirmOrStop, environmentArg, fail, ghVar, quote, runSql, step } from './lib/cli.mjs'

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: { email: { type: 'string' }, yes: { type: 'boolean', default: false } },
})
const env = environmentArg(positionals, 'alerts:setup')

const upsertVault = (name, value) => `
  if exists (select 1 from vault.secrets where name = ${quote(name)}) then
    perform vault.update_secret((select id from vault.secrets where name = ${quote(name)}), ${quote(value)});
  else
    perform vault.create_secret(${quote(value)}, ${quote(name)});
  end if;`

step(`Reading the ${env} settings from GitHub`)
const ref = ghVar('SUPABASE_PROJECT_REF', env)
if (!ref) fail(`No SUPABASE_PROJECT_REF variable on the ${env} GitHub environment (is gh signed in?).`)
const remote = [`--remote=${ref}`]
console.log(`  Project ${ref}`)

const ready = runSql(
  `select to_regprocedure('public.send_alert(text, text)') is not null as ready,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'health_state' and column_name = 'expects_backups') as has_backup_check`,
  remote,
  { readOnly: true },
)[0]
if (!ready?.ready) fail(`The health check migration isn't on ${env} yet. Deploy it first (${env === 'production' ? 'git push origin main:production' : 'push to main'}).`)

let gitEmail = ''
try {
  gitEmail = execFileSync('git', ['config', 'user.email'], { encoding: 'utf8' }).trim()
} catch {
  // No default to offer.
}
const email = flags.email || (await ask(`  Send alerts to${gitEmail ? ` [${gitEmail}]` : ''}: `)) || gitEmail
if (!email || !email.split(',').every((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim()))) fail('Give an email address (or several, separated by commas). Nothing was changed.')

const key = process.env.RESEND_API_KEY || (await ask(`  Paste the ${env} Resend API key (it won't show): `, { hidden: true }))
if (!key) fail('No Resend key given. Nothing was changed.')
if (!key.startsWith('re_')) fail('That doesn’t look like a Resend key (they start with re_). Nothing was changed.')

await confirmOrStop(`Send ${env.toUpperCase()} (${ref}) alerts to ${email}?`, { yes: flags.yes })

step('Saving the alert address and Resend key in the database’s Vault')
const label = env === 'production' ? 'Ward Desk' : 'Ward Desk training site'
runSql(`do $$ begin ${upsertVault('alert_email', email)} ${upsertVault('resend_api_key', key)} ${upsertVault('alert_label', label)} end $$;`, remote)

// Nightly backups run for production only, once BACKUP_ENABLED is on (.github/workflows/backup.yml).
const expectsBackups = env === 'production' && ghVar('BACKUP_ENABLED') === 'true'
if (ready.has_backup_check) {
  step(expectsBackups ? 'Turning on the missing-backup alert' : 'Leaving the missing-backup alert off')
  runSql(`update public.health_state set expects_backups = ${expectsBackups} where id`, remote)
  console.log(expectsBackups ? '  The check emails when no backup has finished in 26 hours.' : `  ${env === 'production' ? 'BACKUP_ENABLED isn’t true yet. Run this again once backups are on.' : 'Only production has nightly backups.'}`)
}

step('Sending a test email')
const id = runSql(
  `select public.send_alert('alerts are on', ${quote(`This is a test from npm run alerts:setup -- ${env}.\n\nFrom now on, the hourly health check emails this address when notifications fail or the app hits errors. No email means nothing went wrong.`)}) as id`,
  remote,
)[0]?.id
if (!id) fail('The database didn’t send it. Check the Vault step above, then run this again.')

let response
for (let i = 0; i < 10 && !response; i++) {
  await new Promise((r) => setTimeout(r, 2000))
  response = runSql(`select status_code, content, error_msg from net._http_response where id = ${Number(id)}`, remote, { readOnly: true })[0]
}
if (!response) fail('No answer from Resend after 20 seconds. Run npm run env:check -- ' + env + ' in a minute to see it.')
if (response.status_code !== 200) fail(`Resend answered ${response.status_code ?? response.error_msg}: ${response.content ?? ''}`)

console.log(`\n✓ Alerts are on for ${env} (${ref}). A test email is on its way to ${email}.`)
console.log('  The check runs at 7 minutes past every hour and only emails when something went wrong.')
