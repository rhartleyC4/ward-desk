// Writes .env for local development from `supabase status` (local, non-secret default keys).
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
const env = [
  `VITE_SUPABASE_URL=${status.API_URL}`,
  `VITE_SUPABASE_ANON_KEY=${status.ANON_KEY}`,
  'VITE_WARD_TIME_ZONE=America/Denver',
  'VITE_ENABLE_GOOGLE=false',
  '',
].join('\n')
writeFileSync(new URL('../.env', import.meta.url), env)
console.log('Wrote .env for', status.API_URL)
