// The notify function's request handling, with the database and push service faked. What's due is
// tick.ts's job (scripts/notify/*.test.ts and the integration tests).

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ postgres: vi.fn(), setVapidDetails: vi.fn(), sendNotification: vi.fn(), tick: vi.fn(), describeTick: vi.fn() }))

vi.mock('npm:postgres@3.4.5', () => ({ default: mocks.postgres }))
vi.mock('npm:web-push@3.6.7', () => ({ default: { setVapidDetails: mocks.setVapidDetails, sendNotification: mocks.sendNotification } }))
vi.mock('./tick.bundle.js', () => ({ tick: mocks.tick, describeTick: mocks.describeTick }))

const device = { endpoint: 'https://push.test/abc', p256dh: 'k', auth: 'a' }

let env: Record<string, string>
let handler: (req: Request) => Promise<Response>
const sql = { end: vi.fn() }

const post = (secret: string | null = 's3cret') => handler(new Request('https://fn.test/notify', { method: 'POST', headers: secret === null ? {} : { 'x-notify-secret': secret } }))

/** Runs the handler, then returns the send function it gave tick. */
async function sender() {
  await post()
  return mocks.tick.mock.calls[0][0].send as (d: typeof device, m: { tag: string }) => Promise<string>
}

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => env[name] },
    serve: (h: typeof handler) => {
      handler = h
    },
  })
  await import('./index.ts')
})

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  sql.end.mockReset()
  env = { NOTIFY_SECRET: 's3cret', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:ward@test', WARD_TIME_ZONE: 'America/Phoenix', SUPABASE_DB_URL: 'postgres://db.test' }
  mocks.postgres.mockReturnValue(sql)
  mocks.tick.mockResolvedValue({ report: true })
  mocks.describeTick.mockReturnValue(['bishop: sent'])
  mocks.sendNotification.mockResolvedValue({})
})

describe('who may call it', () => {
  it('only takes POST', async () => {
    expect((await handler(new Request('https://fn.test/notify'))).status).toBe(405)
  })

  it.each([
    ['no secret', null],
    ['the wrong secret of the same length', 's3cres'],
    ['a secret of another length', 's3cret-and-more'],
  ])('refuses %s', async (_name, secret) => {
    expect((await post(secret)).status).toBe(401)
    expect(mocks.tick).not.toHaveBeenCalled()
  })

  it('refuses everyone where no secret is set, even an empty one', async () => {
    env.NOTIFY_SECRET = ''
    expect((await post('')).status).toBe(401)
  })
})

describe('running', () => {
  it.each(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'])('does nothing where %s is missing', async (name) => {
    delete env[name]
    expect(await (await post()).json()).toEqual({ skipped: 'notifications are not set up here' })
    expect(mocks.postgres).not.toHaveBeenCalled()
  })

  it('runs the tick in the ward\'s time zone, reports the lines and closes the database', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sent: ['bishop: sent'] })
    expect(mocks.setVapidDetails).toHaveBeenCalledWith('mailto:ward@test', 'pub', 'priv')
    expect(mocks.postgres).toHaveBeenCalledWith('postgres://db.test', expect.objectContaining({ prepare: false }))
    expect(mocks.tick).toHaveBeenCalledWith(expect.objectContaining({ sql, timeZone: 'America/Phoenix', now: expect.any(Date) }))
    expect(mocks.describeTick).toHaveBeenCalledWith({ report: true })
    expect(log).toHaveBeenCalledWith('bishop: sent')
    expect(sql.end).toHaveBeenCalledOnce()
    log.mockRestore()
  })

  it('falls back to a default subject and time zone', async () => {
    delete env.VAPID_SUBJECT
    delete env.WARD_TIME_ZONE
    await post()
    expect(mocks.setVapidDetails).toHaveBeenCalledWith('mailto:noreply@warddesk.app', 'pub', 'priv')
    expect(mocks.tick).toHaveBeenCalledWith(expect.objectContaining({ timeZone: 'America/Denver' }))
  })

  it('answers 500 without detail when the tick fails, and still closes the database', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.tick.mockRejectedValue(new Error('connection lost'))
    const res = await post()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'notify failed' })
    expect(log).toHaveBeenCalledWith('notify failed: connection lost')
    expect(sql.end).toHaveBeenCalledOnce()
    log.mockRestore()
  })
})

describe('sending to a device', () => {
  it('sends the message, with no topic, and says it went', async () => {
    const send = await sender()
    await expect(send(device, { tag: 't' })).resolves.toBe('sent')
    const [target, payload, options] = mocks.sendNotification.mock.calls[0]
    expect(target).toEqual({ endpoint: device.endpoint, keys: { p256dh: 'k', auth: 'a' } })
    expect(JSON.parse(payload)).toEqual({ tag: 't' })
    expect(options).toEqual(expect.objectContaining({ TTL: 43200 }))
    expect(options).not.toHaveProperty('topic')
  })

  it.each([404, 410])('reports a device gone on %i', async (statusCode) => {
    const send = await sender()
    mocks.sendNotification.mockRejectedValue(Object.assign(new Error('x'), { statusCode }))
    await expect(send(device, { tag: 't' })).resolves.toBe('gone')
  })

  it('logs why the push service refused, naming only its host', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const send = await sender()
    mocks.sendNotification.mockRejectedValue(Object.assign(new Error('x'), { statusCode: 400, body: ' BadWebPushTopic ' }))
    await expect(send(device, { tag: 't' })).resolves.toBe('failed')
    expect(log).toHaveBeenCalledWith('push failed (400) at push.test: BadWebPushTopic')
    log.mockRestore()
  })

  it('falls back to the error message when there is no answer at all', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const send = await sender()
    mocks.sendNotification.mockRejectedValue(new Error('offline'))
    await expect(send(device, { tag: 't' })).resolves.toBe('failed')
    expect(log).toHaveBeenCalledWith('push failed (no status) at push.test: offline')
    log.mockRestore()
  })
})
