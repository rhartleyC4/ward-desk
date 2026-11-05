// Writes .env for local development from `supabase status` (local, non-secret default keys).
// Keeps an existing local VAPID key pair, so devices that turned on notifications stay subscribed.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import webpush from 'web-push'

const file = new URL('../.env', import.meta.url)
const previous = existsSync(file) ? Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])) : {}
const vapid = previous.VITE_VAPID_PUBLIC_KEY && previous.VAPID_PRIVATE_KEY
  ? { publicKey: previous.VITE_VAPID_PUBLIC_KEY, privateKey: previous.VAPID_PRIVATE_KEY }
  : webpush.generateVAPIDKeys()

const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
const env = [
  `VITE_SUPABASE_URL=${status.API_URL}`,
  `VITE_SUPABASE_ANON_KEY=${status.ANON_KEY}`,
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
