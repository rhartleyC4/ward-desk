// The push function's request handling, with the database and push service faked. What each event
// announces, and to whom, is plan.ts's job (plan.test.ts).

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), setVapidDetails: vi.fn(), sendNotification: vi.fn(), planPush: vi.fn() }))

vi.mock('npm:@supabase/supabase-js@2.118.0', () => ({ createClient: mocks.createClient }))
vi.mock('npm:web-push@3.6.7', () => ({ default: { setVapidDetails: mocks.setVapidDetails, sendNotification: mocks.sendNotification } }))
vi.mock('./plan.ts', async (original) => ({ ...(await original<object>()), planPush: mocks.planPush }))

type Op = [string, ...unknown[]]
type Result = { data?: unknown; error?: unknown }

const message = { title: 'New request', body: 'Open the app', url: '/requests', tag: 'request:r1' }
const device = { id: 'd1', endpoint: 'https://push.test/1', p256dh: 'k', auth: 'a' }

let env: Record<string, string>
let handler: (req: Request) => Promise<Response>
let user: { id: string } | null
/** What each table answers. A function sees the calls made on that query. */
let tables: Record<string, Result | ((ops: Op[]) => Result)>
/** Every query made through the service-role client, as [table, ...calls]. */
let queries: { table: string; ops: Op[] }[]

function admin() {
  return {
    from(table: string) {
      const ops: Op[] = []
      queries.push({ table, ops })
      const answer = () => {
        const t = tables[table]
        return Promise.resolve(typeof t === 'function' ? t(ops) : (t ?? {}))
      }
      const query: Record<string, unknown> = {
        then: (ok: (r: Result) => unknown, no: (e: unknown) => unknown) => answer().then(ok, no),
        maybeSingle: answer,
      }
      for (const m of ['select', 'eq', 'in', 'is', 'lte', 'gt', 'delete', 'insert']) {
        query[m] = (...args: unknown[]) => {
          ops.push([m, ...args])
          return query
        }
      }
      return query
    },
  }
}

const inserted = (table: string) => queries.filter((q) => q.table === table).flatMap((q) => q.ops.filter((o) => o[0] === 'insert').map((o) => o[1]))
const queried = (table: string) => queries.filter((q) => q.table === table)

function post(body: unknown = { event: 'request_sent', id: 'r1' }, headers: Record<string, string> = {}) {
  return handler(new Request('https://fn.test/push', { method: 'POST', headers: { Authorization: 'Bearer t', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }))
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
  env = { SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:ward@test' }
  user = { id: 'bishop' }
  queries = []
  tables = {
    requests: { data: { id: 'r1' } },
    profiles: { data: { office: 'bishop' } },
    notification_mutes: { data: [] },
    push_events: { error: null },
    push_subscriptions: { data: [device] },
  }
  mocks.createClient.mockImplementation((_url: string, key: string) => (key === 'anon' ? { auth: { getUser: async () => ({ data: { user } }) } } : admin()))
  mocks.planPush.mockReturnValue({ key: 'request:r1:sent:sec', to: ['sec'], message })
  mocks.sendNotification.mockResolvedValue({})
})

describe('who may call it', () => {
  it('answers the browser preflight, allowing the acting-as header', async () => {
    const res = await handler(new Request('https://fn.test/push', { method: 'OPTIONS' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('x-acting-as')
  })

  it('only takes POST', async () => {
    const res = await handler(new Request('https://fn.test/push'))
    expect(res.status).toBe(405)
  })

  it('turns away anyone not signed in, and checks with the token they sent', async () => {
    user = null
    const res = await post()
    expect(res.status).toBe(401)
    expect(mocks.createClient).toHaveBeenCalledWith('https://db.test', 'anon', { global: { headers: { Authorization: 'Bearer t' } } })
    expect(mocks.sendNotification).not.toHaveBeenCalled()
  })

  it.each([
    ['a body that is not JSON', 'nope', 'Send JSON with event and id'],
    ['an event it does not know', { event: 'launch', id: 'r1' }, 'Unknown event'],
    ['an id that is not text', { event: 'request_sent', id: 7 }, 'Unknown event'],
  ])('refuses %s', async (_name, body, error) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error })
  })
})

describe('deciding whether to send', () => {
  it.each(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'])('does nothing where %s is missing', async (name) => {
    delete env[name]
    expect(await (await post()).json()).toEqual({ sent: 0, skipped: 'notifications are not set up here' })
    expect(queries).toEqual([])
  })

  it('says so when the record is gone', async () => {
    tables.requests = { data: null }
    expect((await post()).status).toBe(404)
  })

  it('reads the table the event belongs to', async () => {
    tables.calling_requests = { data: { id: 'c1' } }
    await post({ event: 'calling_request_sent', id: 'c1' })
    expect(queried('calling_requests')).toHaveLength(1)
    expect(queried('requests')).toHaveLength(0)
  })

  it('passes the record, the caller and their office to the plan', async () => {
    await post()
    expect(mocks.planPush).toHaveBeenCalledWith('request_sent', { id: 'r1' }, 'bishop', 'bishop', expect.any(Date))
  })

  it('treats a caller with no profile as having no office', async () => {
    tables.profiles = { data: null }
    await post()
    expect(mocks.planPush).toHaveBeenCalledWith('request_sent', { id: 'r1' }, 'bishop', null, expect.any(Date))
  })

  it('reports why when the plan says to skip, and claims nothing', async () => {
    mocks.planPush.mockReturnValue({ skip: 'too old' })
    expect(await (await post()).json()).toEqual({ sent: 0, skipped: 'too old' })
    expect(inserted('push_events')).toEqual([])
  })

  it('leaves out people who turned this kind off', async () => {
    mocks.planPush.mockReturnValue({ key: 'k', to: ['sec', 'clerk'], message })
    tables.notification_mutes = { data: [{ user_id: 'clerk' }] }
    await post()
    expect(queried('notification_mutes')[0].ops).toContainEqual(['eq', 'kind', 'request_sent'])
    expect(queried('push_subscriptions')[0].ops).toContainEqual(['in', 'user_id', ['sec']])
  })

  it('sends nothing when everyone turned it off, and claims nothing', async () => {
    tables.notification_mutes = { data: [{ user_id: 'sec' }] }
    expect(await (await post()).json()).toEqual({ sent: 0, skipped: 'turned off' })
    expect(inserted('push_events')).toEqual([])
  })

  it('sends nothing the second time', async () => {
    tables.push_events = { error: { code: '23505', message: 'duplicate' } }
    expect(await (await post()).json()).toEqual({ sent: 0, skipped: 'already sent' })
    expect(mocks.sendNotification).not.toHaveBeenCalled()
  })

  it('reports any other failure to claim it, and sends nothing', async () => {
    tables.push_events = { error: { code: '42501', message: 'denied' } }
    expect(await (await post()).json()).toEqual({ sent: 0, skipped: 'denied' })
    expect(mocks.sendNotification).not.toHaveBeenCalled()
  })
})

describe('sending', () => {
  it('claims the key, then sends to each device without a topic', async () => {
    expect(await (await post()).json()).toEqual({ sent: 1, devices: 1 })
    expect(inserted('push_events')).toEqual([{ key: 'request:r1:sent:sec' }])
    expect(mocks.setVapidDetails).toHaveBeenCalledWith('mailto:ward@test', 'pub', 'priv')
    const [target, payload, options] = mocks.sendNotification.mock.calls[0]
    expect(target).toEqual({ endpoint: device.endpoint, keys: { p256dh: 'k', auth: 'a' } })
    expect(JSON.parse(payload)).toEqual(message)
    expect(options).not.toHaveProperty('topic')
  })

  it('falls back to a default VAPID subject', async () => {
    delete env.VAPID_SUBJECT
    await post()
    expect(mocks.setVapidDetails).toHaveBeenCalledWith('mailto:noreply@warddesk.app', 'pub', 'priv')
  })

  it('copes with someone who has no devices', async () => {
    tables.push_subscriptions = { data: null }
    expect(await (await post()).json()).toEqual({ sent: 0, devices: 0 })
  })

  it.each([404, 410])('forgets a device the push service answers %i for', async (statusCode) => {
    mocks.sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode }))
    expect(await (await post()).json()).toEqual({ sent: 0, devices: 1 })
    const deleted = queried('push_subscriptions').find((q) => q.ops.some((o) => o[0] === 'delete'))
    expect(deleted?.ops).toContainEqual(['eq', 'id', 'd1'])
  })

  it('keeps a device on any other failure, logs it, and carries on to the next', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    tables.push_subscriptions = { data: [device, { ...device, id: 'd2', endpoint: 'https://push.test/2' }] }
    mocks.sendNotification.mockRejectedValueOnce(Object.assign(new Error('busy'), { statusCode: 500 })).mockRejectedValueOnce(new Error('offline'))
    expect(await (await post()).json()).toEqual({ sent: 0, devices: 2 })
    expect(queried('push_subscriptions').some((q) => q.ops.some((o) => o[0] === 'delete'))).toBe(false)
    expect(log).toHaveBeenCalledWith('push failed (500): busy')
    expect(log).toHaveBeenCalledWith('push failed (no status): offline')
    log.mockRestore()
  })
})

describe('a mentor acting for the new bishop', () => {
  const asBishop = { 'x-acting-as': 'new-bishop' }

  beforeEach(() => {
    user = { id: 'mentor' }
    tables.delegations = { data: { id: 'del1' } }
    tables.roles = { data: { role: 'bishopric' } }
  })

  it('announces the change as the bishop\'s, and tells the bishop once', async () => {
    tables.push_subscriptions = (ops) => ({ data: ops.some((o) => o[0] === 'in' && (o[2] as string[]).includes('new-bishop')) ? [{ ...device, id: 'd9', endpoint: 'https://push.test/bishop' }] : [device] })
    const res = await post(undefined, asBishop)
    expect(await res.json()).toEqual({ sent: 1, devices: 1 })
    expect(mocks.planPush).toHaveBeenCalledWith('request_sent', { id: 'r1' }, 'new-bishop', 'bishop', expect.any(Date))
    expect(inserted('push_events')).toEqual([{ key: 'request:r1:sent:sec' }, { key: 'request:r1:sent:sec:mentor' }])
    expect(mocks.sendNotification.mock.calls.map((c) => c[0].endpoint)).toEqual(['https://push.test/1', 'https://push.test/bishop'])
  })

  it('does not tell the bishop twice', async () => {
    tables.push_events = (ops) => ({ error: (ops[0][1] as { key: string }).key.endsWith(':mentor') ? { code: '23505', message: 'dup' } : null })
    await post(undefined, asBishop)
    expect(mocks.sendNotification).toHaveBeenCalledOnce()
  })

  it.each([
    ['the delegation is not open', 'delegations'],
    ['the person named is not in the bishopric', 'roles'],
  ])('counts as the caller when %s', async (_name, table) => {
    tables[table] = { data: null }
    await post(undefined, asBishop)
    expect(mocks.planPush).toHaveBeenCalledWith('request_sent', { id: 'r1' }, 'mentor', 'bishop', expect.any(Date))
    expect(inserted('push_events')).toEqual([{ key: 'request:r1:sent:sec' }])
  })

  it('only looks at delegations given to this caller for that person', async () => {
    await post(undefined, asBishop)
    const { ops } = queried('delegations')[0]
    expect(ops).toContainEqual(['eq', 'mentor_id', 'mentor'])
    expect(ops).toContainEqual(['eq', 'for_id', 'new-bishop'])
    expect(ops).toContainEqual(['is', 'ended_at', null])
  })

  it('needs no delegation to act as yourself', async () => {
    await post(undefined, { 'x-acting-as': 'mentor' })
    expect(queried('delegations')).toEqual([])
  })
})
