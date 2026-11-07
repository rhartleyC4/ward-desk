// Writes .env for local development from `supabase status` (local, non-secret default keys).
// Keeps an existing local VAPID key pair, so devices that turned on notifications stay subscribed.
// Keeps the ward name too, unless npm run setup passes a new one in WARD_NAME.
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import webpush from 'web-push'

const file = new URL('../.env', import.meta.url)
const previous = existsSync(file) ? Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])) : {}
const vapid = previous.VITE_VAPID_PUBLIC_KEY && previous.VAPID_PRIVATE_KEY
  ? { publicKey: previous.VITE_VAPID_PUBLIC_KEY, privateKey: previous.VAPID_PRIVATE_KEY }
  : webpush.generateVAPIDKeys()

const wardName = process.env.WARD_NAME?.trim() || previous.VITE_WARD_NAME?.trim() || 'Ward Desk'

const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
const env = [
  `VITE_SUPABASE_URL=${status.API_URL}`,
  `VITE_SUPABASE_ANON_KEY=${status.ANON_KEY}`,
  `VITE_WARD_NAME=${wardName}`,
  'VITE_WARD_TIME_ZONE=America/Denver',
  'VITE_ENABLE_GOOGLE=false',
  '# Day-ahead summaries (npm run notify). A key pair made for this machine only.',
  `VITE_VAPID_PUBLIC_KEY=${vapid.publicKey}`,
  `VAPID_PRIVATE_KEY=${vapid.privateKey}`,
  `SUPABASE_DB_URL=${status.DB_URL}`,
  '',
].join('\n')
writeFileSync(file, env)
console.log('Wrote .env for', status.API_URL)

// The Edge Functions read their secrets from here when served locally
// (npx supabase functions serve). Same key pair, so the same devices get them. NOTIFY_SECRET is
// what pg_cron sends the notify function; keep it if there is one.
const functionsEnv = new URL('../supabase/functions/.env', import.meta.url)
const previousFunctions = existsSync(functionsEnv) ? readFileSync(functionsEnv, 'utf8') : ''
const notifySecret = previousFunctions.match(/^NOTIFY_SECRET=(.+)$/m)?.[1] ?? randomBytes(24).toString('hex')
writeFileSync(
  functionsEnv,
  [`VAPID_PUBLIC_KEY=${vapid.publicKey}`, `VAPID_PRIVATE_KEY=${vapid.privateKey}`, 'VAPID_SUBJECT=mailto:noreply@warddesk.app', 'WARD_TIME_ZONE=America/Denver', `NOTIFY_SECRET=${notifySecret}`, ''].join('\n'),
)
console.log('Wrote supabase/functions/.env')
