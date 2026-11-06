// Restores an off-site backup into LOCAL Supabase, for a restore drill or to look at real data
// after an accident (see "Backups and restore" in README.md):
//
//   npm run backup:restore -- --identity ~/Downloads/ward-desk-backup.key              # latest production backup
//   npm run backup:restore -- --identity <key> --env staging                              # latest staging backup
//   npm run backup:restore -- --identity <key> --key production/monthly/2026-11.dump.age  # a chosen one
//   npm run backup:restore -- --identity <key> --file ./some.dump.age                     # a file you already have
//   npm run backup:restore -- --identity <key> --list                                     # list what's in R2
//
// It downloads the encrypted dump from R2 (S3 API), decrypts it in memory with your age identity
// file, and loads it into the local database: public is replaced (schema and data), and the auth
// and supabase_migrations tables get the backup's rows. Nothing decrypted is written to disk; the
// identity's path is used once and never saved. It refuses any database but local Supabase's.
//
// R2 access: BACKUP_R2_ENDPOINT and BACKUP_R2_BUCKET come from the environment or the GitHub repo
// variables; the access key is asked for (use a read-only R2 token) unless BACKUP_R2_ACCESS_KEY_ID
// and BACKUP_R2_SECRET_ACCESS_KEY are set.
//
// Afterwards the local database holds REAL member data. Run `npm run db:reset` when you're done.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { parseArgs } from 'node:util'
import { Decrypter } from 'age-encryption'
import { AwsClient } from 'aws4fetch'
import { ask, confirmOrStop, fail, gh, step } from './lib/cli.mjs'

const { values: flags } = parseArgs({
  options: {
    identity: { type: 'string' },
    env: { type: 'string', default: 'production' },
    key: { type: 'string' },
    file: { type: 'string' },
    list: { type: 'boolean', default: false },
    'db-url': { type: 'string', default: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' },
    container: { type: 'string', default: 'supabase_db_ward-desk' },
    yes: { type: 'boolean', default: false },
  },
})

// --- Only ever the local database ---------------------------------------------------------
const target = new URL(flags['db-url'])
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) fail(`${target.hostname} isn’t this machine. backup:restore only restores into local Supabase.`)
if (target.port !== '54322') fail(`Port ${target.port || '(default)'} isn’t local Supabase’s database port (54322).`)
const inspect = spawnSync('docker', ['inspect', '--format', '{{.State.Running}}', flags.container], { encoding: 'utf8' })
if (inspect.stdout.trim() !== 'true') fail(`The local Supabase database (${flags.container}) isn’t running. Start it with npm run db:start.`)

if (!['production', 'staging'].includes(flags.env)) fail('--env is production or staging.')

// --- Find the backup ------------------------------------------------------------------------
let r2
async function bucket() {
  if (r2) return r2
  const endpoint = process.env.BACKUP_R2_ENDPOINT || gh(['variable', 'get', 'BACKUP_R2_ENDPOINT'])
  const name = process.env.BACKUP_R2_BUCKET || gh(['variable', 'get', 'BACKUP_R2_BUCKET'])
  if (!endpoint || !name) fail('BACKUP_R2_ENDPOINT and BACKUP_R2_BUCKET aren’t set here or on GitHub. Run npm run env:github -- production.')
  const accessKeyId = process.env.BACKUP_R2_ACCESS_KEY_ID || (await ask('  R2 access key ID (a read-only token is enough): '))
  const secretAccessKey = process.env.BACKUP_R2_SECRET_ACCESS_KEY || (await ask('  R2 secret access key (won’t show): ', { hidden: true }))
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
  const base = `${endpoint.replace(/\/$/, '')}/${name}`
  r2 = {
    async list(prefix) {
      const keys = []
      let token = ''
      do {
        const query = new URLSearchParams({ 'list-type': '2', prefix, ...(token ? { 'continuation-token': token } : {}) })
        const res = await client.fetch(`${base}?${query}`)
        if (!res.ok) fail(`Couldn’t list ${prefix} in R2: ${res.status} ${await res.text()}`)
        const xml = await res.text()
        for (const m of xml.matchAll(/<Contents>.*?<Key>(.*?)<\/Key>.*?<Size>(\d+)<\/Size>.*?<\/Contents>/gs)) keys.push({ key: m[1], size: Number(m[2]) })
        token = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/)?.[1] ?? ''
      } while (token)
      return keys.sort((a, b) => a.key.localeCompare(b.key))
    },
    async get(key) {
      const res = await client.fetch(`${base}/${key.split('/').map(encodeURIComponent).join('/')}`)
      if (!res.ok) fail(`Couldn’t download ${key}: ${res.status} ${await res.text()}`)
      return new Uint8Array(await res.arrayBuffer())
    },
  }
  return r2
}

if (flags.list) {
  step(`Backups of ${flags.env} in R2`)
  const keys = await (await bucket()).list(`${flags.env}/`)
  for (const { key, size } of keys) console.log(`  ${key}  ${(size / 1024).toFixed(0)} KB`)
  console.log(keys.length ? `\n  ${keys.length} backups` : '  None yet.')
  process.exit(0)
}

if (!flags.identity) fail('Pass your age identity file: --identity <path> (the private key from your password manager, saved to a temporary file).')
const identityPath = flags.identity.replace(/^~(?=\/)/, homedir())
const identity = readFileSync(identityPath, 'utf8').split('\n').map((l) => l.trim()).find((l) => l.startsWith('AGE-SECRET-KEY-'))
if (!identity) fail(`${flags.identity} has no AGE-SECRET-KEY- line.`)

let encrypted
let source
if (flags.file) {
  source = flags.file
  encrypted = new Uint8Array(readFileSync(flags.file))
} else {
  step('Finding the backup in R2')
  let key = flags.key
  if (!key) {
    const daily = await (await bucket()).list(`${flags.env}/daily/`)
    if (!daily.length) fail(`There are no backups under ${flags.env}/daily/ yet.`)
    key = daily.at(-1).key
  }
  source = key
  console.log(`  ${key}`)
  encrypted = await (await bucket()).get(key)
}

step('Decrypting')
const decrypter = new Decrypter()
decrypter.addIdentity(identity)
let dump
try {
  dump = await decrypter.decrypt(encrypted)
} catch (error) {
  fail(`Couldn’t decrypt ${source}: ${error.message}. Is that the right identity file?`)
}
console.log(`  ${(dump.length / 1024).toFixed(0)} KB dump`)

// --- Pick what to load -------------------------------------------------------------------------
const pgRestore = (args, input) => spawnSync('docker', ['exec', '-i', flags.container, 'pg_restore', ...args], { input, maxBuffer: 256 * 1024 * 1024 })
const listing = pgRestore(['--list'], dump)
if (listing.status !== 0) fail(`That isn’t a pg_dump file: ${listing.stderr}`)
const entries = listing.stdout.toString().split('\n').filter((l) => /^\d+;/.test(l))
// Each line is "<id>; <oid> <oid> <TYPE WORDS> <schema> <name> <owner>". public is loaded whole,
// except the schema itself (made empty first); only its grants come from the backup. auth and
// supabase_migrations get rows only, plus auth's trigger that calls into public (it went with public).
const wanted = entries.filter((l) => {
  const [, type, schema, name] = l.replace(/^\d+; \d+ \d+ /, '').match(/^((?:[A-Z]+ )+)(\S+) (.*)$/) ?? []
  if (schema === '-') return type.trim() === 'ACL' && name.startsWith('SCHEMA public ')
  if (schema === 'public') return true
  if (schema === 'auth' && name.startsWith('schema_migrations ')) return false
  if (schema === 'auth' || schema === 'supabase_migrations') return ['TABLE DATA', 'SEQUENCE SET'].includes(type.trim()) || (schema === 'auth' && type.trim() === 'TRIGGER')
  return false
})
const counts = (schema) => entries.filter((l) => l.includes(`TABLE DATA ${schema} `)).length
console.log(`  public: ${counts('public')} tables of data; auth: ${counts('auth')}; supabase_migrations: ${counts('supabase_migrations')}`)

step('Restoring into local Supabase')
console.log('  This replaces everything in the local database (shared with any other worktrees).')
await confirmOrStop('Replace the local database with this backup?', { yes: flags.yes })

const psql = (sql) => spawnSync('docker', ['exec', '-i', flags.container, 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' })
// One transaction, so a failure leaves the local database as it was. auth.schema_migrations is
// the Auth server's own version table (owned by it, and the same locally), so it's left alone.
const clear = psql(`
  begin;
  drop schema public cascade;
  create schema public;
  grant usage on schema public to anon, authenticated, service_role;
  grant all on schema public to postgres, service_role;
  do $$ declare t text; begin
    for t in select format('%I.%I', schemaname, tablename) from pg_tables where schemaname in ('auth', 'supabase_migrations')
      and (schemaname, tablename) <> ('auth', 'schema_migrations') loop
      execute 'truncate ' || t || ' cascade';
    end loop;
  end $$;
  commit;
`)
if (clear.status !== 0) fail(`Couldn’t clear the local database: ${clear.stderr}`)

// pg_restore reads the list from a file, so it goes into the container's /tmp (it names objects, no data).
const listFile = `/tmp/backup-restore-${process.pid}.list`
const writeList = spawnSync('docker', ['exec', '-i', flags.container, 'sh', '-c', `cat > ${listFile}`], { input: wanted.join('\n') + '\n' })
if (writeList.status !== 0) fail('Couldn’t pass the restore list to the database container.')
// Three passes. Tables, functions and types are made as postgres, like the migrations make them,
// so later migrations can change them. The rest runs as the local superuser: rows load with
// triggers off (auth's tables already have their foreign keys, and rows come in dump order), and
// grants include default privileges for supabase_admin, which only it can set.
let restored
for (const [section, user, extra] of [['pre-data', 'postgres', []], ['data', 'supabase_admin', ['--disable-triggers']], ['post-data', 'supabase_admin', []]]) {
  restored = pgRestore(['-U', user, '-d', 'postgres', '--no-owner', `--section=${section}`, '--single-transaction', '--exit-on-error', ...extra, '-L', listFile], dump)
  if (restored.status !== 0) break
}
spawnSync('docker', ['exec', flags.container, 'rm', '-f', listFile])
if (restored.status !== 0) fail(`pg_restore failed: ${restored.stderr}\nThe local database may be half-restored. Run npm run db:reset to get back to the seed.`)

const summary = spawnSync('docker', ['exec', flags.container, 'psql', '-U', 'postgres', '-Atc', "select (select count(*) from auth.users) || ' auth users, ' || (select count(*) from information_schema.tables where table_schema = 'public') || ' public tables, newest migration ' || coalesce((select max(version) from supabase_migrations.schema_migrations), 'none')"], { encoding: 'utf8' })
if (summary.status !== 0) fail('Restored, but couldn’t read it back.')
console.log(`  ✓ Restored ${source}: ${summary.stdout.trim()}`)

console.log(`
  The local database now holds REAL member data${flags.file ? '' : ` from ${flags.env}`}.
    - Don't run the seed, tests or import scripts against it, and don't share screenshots.
    - Local migrations newer than the backup's aren't applied: npx supabase migration up
    - When you're done: npm run db:reset   (back to the invented seed data)
    - Delete the identity file you saved for this.
`)
