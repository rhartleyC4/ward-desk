// The command-line sender. It does its work on import, so each test sets the arguments first.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ postgres: vi.fn(), setVapidDetails: vi.fn(), sendNotification: vi.fn(), sendDaySummaries: vi.fn(), tick: vi.fn(), describeTick: vi.fn() }))

vi.mock('node:fs', () => ({ existsSync: () => false }))
vi.mock('postgres', () => ({ default: mocks.postgres }))
vi.mock('web-push', () => ({ default: { setVapidDetails: mocks.setVapidDetails, sendNotification: mocks.sendNotification } }))
vi.mock('./daySummaries', () => ({ sendDaySummaries: mocks.sendDaySummaries }))
vi.mock('./tick', () => ({ tick: mocks.tick, describeTick: mocks.describeTick }))

type SendFn = (device: { endpoint: string; p256dh: string; auth: string }, message: { tag: string }) => Promise<string>

const emptyTick = { summaries: [], notices: [], followUps: [], daily: [] }
const device = { endpoint: 'https://push.test/1', p256dh: 'k', auth: 'a' }
const sql = Object.assign(vi.fn(), { end: vi.fn() })
const savedArgv = process.argv
let log: ReturnType<typeof vi.spyOn>
let errors: ReturnType<typeof vi.spyOn>

const run = (...args: string[]) => {
  process.argv = ['node', 'send.ts', ...args]
  return import('./send')
}
const printed = () => log.mock.calls.map((c: unknown[]) => c[0])

beforeEach(() => {
  vi.resetModules()
  Object.values(mocks).forEach((m) => m.mockReset())
  sql.mockReset()
  sql.end.mockReset()
  sql.mockImplementation((first: unknown) => first)
  process.exitCode = undefined
  vi.stubEnv('SUPABASE_DB_URL', 'postgres://db.test')
  vi.stubEnv('WARD_TIME_ZONE', 'America/Denver')
  vi.stubEnv('VITE_WARD_TIME_ZONE', '')
  vi.stubEnv('VAPID_SUBJECT', 'mailto:ward@test')
  vi.stubEnv('VAPID_PUBLIC_KEY', 'pub')
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'priv')
  mocks.postgres.mockReturnValue(sql)
  mocks.sendDaySummaries.mockResolvedValue([])
  mocks.tick.mockResolvedValue(emptyTick)
  mocks.describeTick.mockReturnValue([])
  mocks.sendNotification.mockResolvedValue({})
  log = vi.spyOn(console, 'log').mockImplementation(() => {})
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  process.argv = savedArgv
  process.exitCode = undefined
  vi.unstubAllEnvs()
  log.mockRestore()
  errors.mockRestore()
})

describe('its arguments', () => {
  it('refuses a --now that is not a date', async () => {
    await expect(run('--now', 'soon')).rejects.toThrow('--now must be a date and time')
  })

  it('refuses a --date in the wrong shape', async () => {
    await expect(run('--date', '11/08/2026')).rejects.toThrow('--date must look like 2026-11-08')
  })

  it('needs a database', async () => {
    vi.stubEnv('SUPABASE_DB_URL', '')
    await expect(run('--dry-run')).rejects.toThrow('SUPABASE_DB_URL is not set.')
  })

  it('needs the private key to really send', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    await expect(run()).rejects.toThrow('VAPID_PRIVATE_KEY is not set.')
  })

  it('defaults to tomorrow in the ward', async () => {
    await run('--dry-run', '--now', '2026-11-08T11:00:00-07:00')
    expect(mocks.sendDaySummaries).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-11-09', timeZone: 'America/Denver' }))
  })

  it('falls back to the app\'s time zone setting', async () => {
    vi.stubEnv('WARD_TIME_ZONE', '')
    vi.stubEnv('VITE_WARD_TIME_ZONE', 'America/Phoenix')
    await run('--dry-run', '--date', '2026-11-08')
    expect(mocks.sendDaySummaries).toHaveBeenCalledWith(expect.objectContaining({ timeZone: 'America/Phoenix' }))
  })

  it('narrows to the people named by --only', async () => {
    sql.mockImplementation((first: unknown) => (Array.isArray(first) && 'raw' in first ? Promise.resolve([{ id: 'u1' }]) : first))
    await run('--dry-run', '--date', '2026-11-08', '--only', 'a@ward.test')
    expect(mocks.sendDaySummaries).toHaveBeenCalledWith(expect.objectContaining({ only: ['u1'] }))
  })

  it('stops, and closes the database, when --only matches no one', async () => {
    sql.mockImplementation((first: unknown) => (Array.isArray(first) && 'raw' in first ? Promise.resolve([]) : first))
    await expect(run('--dry-run', '--only', 'x@ward.test')).rejects.toThrow('--only matched no one.')
    expect(sql.end).toHaveBeenCalledOnce()
  })
})

describe('day-ahead summaries', () => {
  it('prints each office and its lines, without sending on a dry run', async () => {
    mocks.sendDaySummaries.mockResolvedValue([
      { office: 'bishop', outcome: 'sent', devices: 1, lines: [{ text: 'Sacrament at 9' }] },
      { office: null, outcome: 'sent', devices: 2, lines: [] },
    ])
    await run('--dry-run', '--date', '2026-11-08')
    expect(printed()).toEqual(['Day-ahead summaries for 2026-11-08 (dry run, nothing sent):', '- bishop: sent, 1 device', '    Sacrament at 9', '- bishopric: sent, 2 devices'])
    expect(mocks.setVapidDetails).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
    expect(sql.end).toHaveBeenCalledOnce()
    const { send, dryRun } = mocks.sendDaySummaries.mock.calls[0][0]
    expect(dryRun).toBe(true)
    await expect(send(device, { tag: 't' })).resolves.toBe('failed')
    expect(mocks.sendNotification).not.toHaveBeenCalled()
  })

  it('passes --force along, and exits with an error when one failed', async () => {
    mocks.sendDaySummaries.mockResolvedValue([{ office: 'bishop', outcome: 'failed', devices: 1, lines: [] }])
    await run('--force', '--date', '2026-11-08')
    expect(printed()[0]).toBe('Day-ahead summaries for 2026-11-08:')
    expect(mocks.sendDaySummaries).toHaveBeenCalledWith(expect.objectContaining({ force: true, dryRun: false }))
    expect(process.exitCode).toBe(1)
  })
})

describe('--tick', () => {
  it('says when nothing is due', async () => {
    await run('--tick', '--dry-run', '--now', '2026-11-08T11:00:00-07:00')
    expect(printed()).toEqual(['Due at 11:00 in America/Denver (dry run, nothing sent): nothing'])
    expect(mocks.sendDaySummaries).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })

  it('prints what went, with each follow-up indented', async () => {
    mocks.tick.mockResolvedValue({ ...emptyTick, followUps: [{ outcome: 'sent', body: 'one\ntwo' }] })
    mocks.describeTick.mockReturnValue(['bishop: sent'])
    await run('--tick', '--now', '2026-11-08T11:00:00-07:00')
    expect(printed()).toEqual(['Due at 11:00 in America/Denver: ', '- bishop: sent', '    one\n    two'])
  })

  it.each(['summaries', 'notices', 'followUps', 'daily'])('exits with an error when one of the %s failed', async (kind) => {
    mocks.tick.mockResolvedValue({ ...emptyTick, [kind]: [{ outcome: 'failed', body: '' }] })
    await run('--tick', '--dry-run')
    expect(process.exitCode).toBe(1)
  })
})

describe('sending for real', () => {
  async function realSend() {
    await run('--date', '2026-11-08')
    return mocks.sendDaySummaries.mock.calls[0][0].send as SendFn
  }

  it('sets up the keys and sends without a topic', async () => {
    const send = await realSend()
    expect(mocks.setVapidDetails).toHaveBeenCalledWith('mailto:ward@test', 'pub', 'priv')
    await expect(send(device, { tag: 't' })).resolves.toBe('sent')
    const [target, payload, options] = mocks.sendNotification.mock.calls[0]
    expect(target).toEqual({ endpoint: device.endpoint, keys: { p256dh: 'k', auth: 'a' } })
    expect(JSON.parse(payload)).toEqual({ tag: 't' })
    expect(options).not.toHaveProperty('topic')
  })

  it.each([404, 410])('reports a device gone on %i', async (statusCode) => {
    const send = await realSend()
    mocks.sendNotification.mockRejectedValue(Object.assign(new Error('x'), { statusCode }))
    await expect(send(device, { tag: 't' })).resolves.toBe('gone')
    expect(errors).not.toHaveBeenCalled()
  })

  it('logs anything else as a failure', async () => {
    const send = await realSend()
    mocks.sendNotification.mockRejectedValueOnce(Object.assign(new Error('busy'), { statusCode: 500 })).mockRejectedValueOnce(new Error('offline'))
    await expect(send(device, { tag: 't' })).resolves.toBe('failed')
    await expect(send(device, { tag: 't' })).resolves.toBe('failed')
    expect(errors).toHaveBeenCalledWith('  push failed (500): busy')
    expect(errors).toHaveBeenCalledWith('  push failed (no status): offline')
  })
})
