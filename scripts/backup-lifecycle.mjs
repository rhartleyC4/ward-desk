// Sets how long off-site backups are kept, by writing the bucket's R2 lifecycle rules from
// scripts/lib/backup-retention.mjs (see "Backups and restore" in README.md):
//
//   npm run backup:lifecycle -- production --dry-run    # show what would change
//   npm run backup:lifecycle -- production              # show it, ask, apply
//   npm run backup:lifecycle -- staging
//
// Both environments' backups share one bucket (production/… and staging/… keys), so either name
// writes the same rules for both and replaces whatever rules the bucket had. The environment only
// picks which GitHub variables are read when the bucket isn't named in the shell.
//
// R2 access: BACKUP_R2_ENDPOINT and BACKUP_R2_BUCKET come from the environment or the GitHub repo
// variables. The access key is asked for unless BACKUP_R2_ACCESS_KEY_ID and
// BACKUP_R2_SECRET_ACCESS_KEY are set. Changing lifecycle rules needs a token with Admin Read &
// Write on the bucket. The read-only restore token and the upload token can't do it.

import { parseArgs } from 'node:util'
import { ask, confirmOrStop, environmentArg, fail, gh, step } from './lib/cli.mjs'
import { diffRules, lifecycleClient, printRules, RETENTION, sameRules } from './lib/backup-retention.mjs'

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'dry-run': { type: 'boolean', default: false }, yes: { type: 'boolean', default: false } },
})
const env = environmentArg(positionals, 'backup:lifecycle')

const endpoint = process.env.BACKUP_R2_ENDPOINT || gh(['variable', 'get', 'BACKUP_R2_ENDPOINT'])
const bucket = process.env.BACKUP_R2_BUCKET || gh(['variable', 'get', 'BACKUP_R2_BUCKET'])
if (!endpoint || !bucket) fail(`BACKUP_R2_ENDPOINT and BACKUP_R2_BUCKET aren’t set here or on GitHub. Run npm run env:github -- ${env}.`)

step(`Backup expiry for ${env} (bucket ${bucket})`)
console.log(`  Wanted (scripts/lib/backup-retention.mjs):\n${printRules(RETENTION)}`)

const accessKeyId = process.env.BACKUP_R2_ACCESS_KEY_ID || (await ask('\n  R2 access key ID (a token with Admin Read & Write on the bucket): '))
const secretAccessKey = process.env.BACKUP_R2_SECRET_ACCESS_KEY || (await ask('  R2 secret access key (won’t show): ', { hidden: true }))
if (!accessKeyId || !secretAccessKey) fail('An R2 access key is needed to read the current rules.')
const r2 = lifecycleClient({ endpoint, bucket, accessKeyId, secretAccessKey })

const current = await r2.get()
if (current.error) fail(`Couldn’t read the bucket’s current rules: ${current.error}. (The token needs Admin Read & Write.)`)
console.log(`\n  Now in the bucket:\n${printRules(current.rules)}`)

if (sameRules(current.rules)) {
  console.log('\n✓ The bucket already has exactly these rules. Nothing to change.')
  process.exit(0)
}
const { missing, extra } = diffRules(current.rules)
console.log('\n  Change:')
for (const line of missing) console.log(`    + ${line}`)
for (const line of extra) console.log(`    − ${line}  (removed)`)

if (flags['dry-run']) {
  console.log('\nDry run: nothing was changed.')
  process.exit(0)
}
await confirmOrStop('Replace the bucket’s lifecycle rules with the wanted ones? Objects older than the new periods are deleted by R2 within about a day.', { yes: flags.yes })
const result = await r2.put()
if (result.error) fail(`R2 refused the change: ${result.error}`)
const after = await r2.get()
if (after.error || !sameRules(after.rules)) fail('Applied, but reading the rules back did not match. Run npm run env:check to see.')
console.log('\n✓ Backup expiry applied and read back.')
