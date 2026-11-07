// Gets a fresh checkout ready to run locally:
//
//   npm run setup
//
// Checks Node matches .nvmrc and Docker is running, installs packages, starts local Supabase
// (or leaves it alone if it is already running), asks for the ward name, writes .env and
// supabase/functions/.env, and ends with `npm run env:check -- local`. Running it again is safe.
//
// The local Supabase stack is shared by every checkout and worktree on this machine. This never
// resets it or regenerates database types, since it may hold migrations from other branches.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { ask, fail, step } from './lib/cli.mjs'

const run = (command, args, { quiet = false } = {}) => spawnSync(command, args, { encoding: 'utf8', stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' })

step('Checking Node')
const want = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim().replace(/^v/, '')
const have = process.versions.node
if (have.split('.')[0] !== want.split('.')[0]) fail(`This is Node ${have}, but .nvmrc asks for ${want}. Run: nvm install && nvm use, then npm run setup again.`)
console.log(have === want ? `  Node ${have}` : `  Node ${have} (.nvmrc says ${want}; same major version, so carrying on. nvm use switches to it.)`)

step('Checking Docker')
if (run('docker', ['info'], { quiet: true }).status !== 0) fail('Docker isn’t running. Start OrbStack or Docker Desktop, then run npm run setup again.')
console.log('  Docker is running')

step('Installing packages')
if (run('npm', ['install', '--no-fund', '--no-audit']).status !== 0) fail('npm install failed.')

step('Starting local Supabase')
const status = run('npx', ['supabase', 'status', '-o', 'json', '--agent', 'no'], { quiet: true })
if (status.status === 0) {
  // Already up, maybe started from another worktree. Only build this checkout's notify bundle.
  console.log('  Already running. It’s shared by every worktree, so it’s left as it is.')
  console.log('  If this branch adds migrations, apply them without a reset: npx supabase migration up')
  if (run('npm', ['run', 'functions:build', '--silent']).status !== 0) fail('Building the notify bundle failed.')
} else if (run('npm', ['run', 'db:start']).status !== 0) {
  fail('Local Supabase didn’t start. See the output above.')
}

step('Ward name')
// Shown in the header and as the installed app's name. Enter keeps the current one.
const envFile = new URL('../.env', import.meta.url)
const currentName = (existsSync(envFile) ? readFileSync(envFile, 'utf8').match(/^VITE_WARD_NAME=(.*)$/m)?.[1]?.trim() : '') || 'Ward Desk'
const wardName = (await ask(`  Ward name [${currentName}]: `)) || currentName
console.log(`  ${wardName}`)

step('Writing .env and supabase/functions/.env')
if (spawnSync('npm', ['run', 'db:env', '--silent'], { stdio: 'inherit', env: { ...process.env, WARD_NAME: wardName } }).status !== 0) fail('npm run db:env failed.')

step('Checking the result')
const check = run('node', [new URL('./env-check.mjs', import.meta.url).pathname, 'local'])
if (check.status !== 0) process.exit(check.status ?? 1)
console.log('\n  Next: npm run dev, then open http://localhost:5173. Seeded sign-ins are in README.md under "Setup".')
