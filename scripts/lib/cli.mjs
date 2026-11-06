// Shared helpers for the setup scripts (notify:setup, env:check, env:github, env:auth, admin:add).
//
// Every Supabase CLI call passes `--agent no`. The CLI prints JSON differently when it thinks an
// AI agent is running it (rows wrapped in `{rows: [...]}`) than for a person (a bare array), so
// the output would change depending on who runs the script. `rowsOf` accepts both shapes anyway.

import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const ENVIRONMENTS = {
  staging: { url: 'https://gp7-training.warddesk.app', pagesProject: 'ward-desk-staging' },
  production: { url: 'https://gp7.warddesk.app', pagesProject: 'ward-desk' },
}

export const step = (text) => console.log(`\n▸ ${text}`)

export function fail(text) {
  console.error(`\n✗ ${text}`)
  process.exit(1)
}

/** Reads the environment name from the command line, or stops with how to call the command. */
export function environmentArg(positionals, command, allowed = ['staging', 'production']) {
  const env = positionals[0]
  if (!allowed.includes(env)) fail(`Say which environment: npm run ${command} -- ${allowed[0]} (or ${allowed.slice(1).join(', or ')})`)
  return env
}

/** Turns CLI JSON output into a list of rows, whichever shape it came in. */
export function rowsOf(parsed, ...keys) {
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object') {
    for (const key of ['rows', ...keys]) if (Array.isArray(parsed[key])) return parsed[key]
  }
  return []
}

const supabaseArgs = (args) => ['supabase', ...args, '--agent', 'no']

/**
 * Runs the Supabase CLI and stops the script if it fails. Pass `--yes` in `args` only for a change
 * the person already confirmed.
 */
export function supabase(args, { capture = false } = {}) {
  const result = spawnSync('npx', supabaseArgs(args), { encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' })
  if (result.status !== 0) fail(`supabase ${args[0]} ${args[1] ?? ''} failed${capture ? `:\n${result.stderr || result.stdout}` : ''}`)
  return result.stdout
}

/** Runs the Supabase CLI without stopping on failure: `{ ok, stdout, stderr }`. */
export async function supabaseTry(args) {
  try {
    const { stdout, stderr } = await execFileAsync('npx', supabaseArgs(args), { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    return { ok: true, stdout, stderr }
  } catch (error) {
    return { ok: false, stdout: error.stdout ?? '', stderr: errorMessage(error.stdout) || error.stderr || error.message }
  }
}

/** The message in the CLI's JSON error output (`{"_tag":"Error","error":{"message":...}}`), if any. */
function errorMessage(stdout) {
  try {
    let message = JSON.parse(stdout)?.error?.message
    if (typeof message !== 'string') return ''
    // Database errors wrap the API's own JSON: `unexpected status 400: {"message":"... ERROR: ..."}`.
    const inner = message.indexOf('{')
    if (inner >= 0) {
      try {
        message = JSON.parse(message.slice(inner)).message ?? message
      } catch {
        // keep the outer message
      }
    }
    return message.match(/ERROR:\s+(?:\w+:\s+)?([^\n]+)/)?.[1] ?? message.split('\n')[0]
  } catch {
    return ''
  }
}

/** Runs `supabase <args> --output-format json` and parses it, or returns `undefined` and the error. */
export async function supabaseJson(args) {
  const result = await supabaseTry([...args, '--output-format', 'json'])
  if (!result.ok) return { error: firstLine(result.stderr) }
  try {
    return { data: JSON.parse(result.stdout) }
  } catch {
    return { error: 'the output was not JSON' }
  }
}

export const firstLine = (text) => String(text).trim().split('\n').find((l) => l.trim() && !/^Target:/.test(l))?.trim() || 'failed'

/** Runs `gh` and returns its trimmed output, or '' when it fails. */
export function gh(args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

/** Runs `gh` without blocking: `{ ok, stdout, stderr }`. */
export async function ghTry(args) {
  try {
    const { stdout } = await execFileAsync('gh', args, { encoding: 'utf8' })
    return { ok: true, stdout: stdout.trim(), stderr: '' }
  } catch (error) {
    return { ok: false, stdout: '', stderr: error.stderr || error.message }
  }
}

/** A GitHub variable from an environment (or the repository, with no `env`), or '' if unset. */
export const ghVar = (name, env) => gh(['variable', 'get', name, ...(env ? ['--env', env] : [])])

export function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (hidden) rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? s : '')
    rl.question(question, (answer) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
}

/** Asks a yes/no question and stops the script unless the answer is yes. */
export async function confirmOrStop(question, { yes = false } = {}) {
  if (yes) return
  const answer = await ask(`\n${question} [y/N] `)
  if (!/^y(es)?$/i.test(answer)) fail('Stopped. Nothing was changed.')
}

/** Writes `contents` to a file only this user can read, runs `fn(path)`, then deletes it. */
export function withPrivateFile(name, contents, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ward-desk-'))
  const file = join(dir, name)
  try {
    writeFileSync(file, contents, { mode: 0o600 })
    return fn(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Like `withPrivateFile`, for an async `fn`. */
export async function withPrivateFileAsync(name, contents, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ward-desk-'))
  const file = join(dir, name)
  try {
    writeFileSync(file, contents, { mode: 0o600 })
    return await fn(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const queryArgs = (file, remote, readOnly) => ['db', 'query', ...remote, '--file', file, '--output-format', 'json', ...(readOnly ? ['--read-only'] : ['--yes'])]

// A statement with no rows (DO, a bare function call) prints its command tag, not JSON.
function parseQueryRows(out) {
  try {
    return rowsOf(JSON.parse(out))
  } catch {
    return []
  }
}

/**
 * Runs SQL from a private temp file, so values in it never show in the process list or shell
 * history. `remote` is `[]` for the local stack or `['--remote=<ref>']`. Stops the script on error.
 */
export function runSql(sql, remote, { readOnly = false } = {}) {
  return withPrivateFile('query.sql', sql, (file) => parseQueryRows(supabase(queryArgs(file, remote, readOnly), { capture: true })))
}

/** Read-only `runSql` that doesn't stop the script: `{ rows }` or `{ error }`. */
export async function querySql(sql, remote) {
  return withPrivateFileAsync('query.sql', sql, async (file) => {
    const result = await supabaseTry(queryArgs(file, remote, true))
    return result.ok ? { rows: parseQueryRows(result.stdout) } : { error: firstLine(result.stderr) }
  })
}

/** A SQL string literal. */
export const quote = (s) => `'${String(s).replace(/'/g, "''")}'`
