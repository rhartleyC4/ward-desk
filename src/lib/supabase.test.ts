import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.hoisted(() => vi.fn(() => ({ client: true })))
vi.mock('@supabase/supabase-js', () => ({ createClient }))

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** Loads the module fresh and returns it, with the fetch it gave Supabase. */
async function load() {
  vi.resetModules()
  createClient.mockClear()
  const mod = await import('./supabase')
  const options = (createClient.mock.calls[0] as unknown[])[2] as { global: { fetch: Fetcher } }
  return { ...mod, wrapped: options.global.fetch }
}

const sent = vi.fn(async () => new Response('ok'))
const headersOf = () => (sent.mock.calls.at(-1) as unknown as [unknown, RequestInit])[1].headers as Headers

beforeEach(() => {
  sent.mockClear()
  vi.stubGlobal('fetch', sent)
  vi.stubEnv('VITE_SUPABASE_URL', 'https://db.test')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('acting for someone', () => {
  it('passes requests through untouched as yourself', async () => {
    const { wrapped } = await load()
    const init = { method: 'POST' }
    await wrapped('https://db.test/x', init)
    expect(sent).toHaveBeenCalledWith('https://db.test/x', init)
  })

  it('remembers who for, and can stop', async () => {
    const { setActingFor, getActingFor } = await load()
    expect(getActingFor()).toBeNull()
    setActingFor('bishop')
    expect(getActingFor()).toBe('bishop')
    setActingFor(null)
    expect(getActingFor()).toBeNull()
  })

  it('adds the header, keeping the ones already set', async () => {
    const { wrapped, setActingFor } = await load()
    setActingFor('bishop')
    await wrapped('https://db.test/x', { headers: { apikey: 'k' } })
    expect(headersOf().get('x-acting-as')).toBe('bishop')
    expect(headersOf().get('apikey')).toBe('k')
  })

  it('keeps the headers of a Request passed in', async () => {
    const { wrapped, setActingFor } = await load()
    setActingFor('bishop')
    await wrapped(new Request('https://db.test/x', { headers: { apikey: 'k' } }))
    expect(headersOf().get('apikey')).toBe('k')
    expect(headersOf().get('x-acting-as')).toBe('bishop')
  })

  it('copes with a bare URL', async () => {
    const { wrapped, setActingFor } = await load()
    setActingFor('bishop')
    await wrapped('https://db.test/x')
    expect(headersOf().get('x-acting-as')).toBe('bishop')
  })
})

describe('the ward time zone', () => {
  it('comes from the environment', async () => {
    vi.stubEnv('VITE_WARD_TIME_ZONE', 'America/Phoenix')
    expect((await load()).WARD_TIME_ZONE).toBe('America/Phoenix')
  })

  it('defaults to Denver', async () => {
    vi.stubEnv('VITE_WARD_TIME_ZONE', '')
    expect((await load()).WARD_TIME_ZONE).toBe('America/Denver')
  })
})
