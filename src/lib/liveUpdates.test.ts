import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listenForWardChanges, onWardChange, settle, SETTLE_MS, announceWardChange } from './liveUpdates'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function fakeEnv({ auth = Promise.resolve() } = {}) {
  const docListeners = new Map<string, () => void>()
  let onChanged: () => void = () => {}
  let onStatus: (status: string) => void = () => {}
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, fn: () => void) => ((onChanged = fn), channel)),
    subscribe: vi.fn((fn: (status: string) => void) => ((onStatus = fn), channel)),
  }
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(() => Promise.resolve('ok')),
    realtime: { setAuth: vi.fn(() => auth) },
  }
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (type: string, fn: () => void) => docListeners.set(type, fn),
    removeEventListener: (type: string) => docListeners.delete(type),
  }
  const announce = vi.fn()
  const env = { client, doc, announce } as unknown as Parameters<typeof listenForWardChanges>[0]
  const setVisibility = (state: DocumentVisibilityState) => {
    doc.visibilityState = state
    docListeners.get('visibilitychange')?.()
  }
  return { env, client, channel, announce, docListeners, setVisibility, changed: () => onChanged(), status: (s: string) => onStatus(s) }
}

describe('settle', () => {
  it('calls once after a burst has finished', () => {
    const fn = vi.fn()
    const trigger = settle(fn, 100)
    trigger()
    vi.advanceTimersByTime(60)
    trigger()
    trigger()
    vi.advanceTimersByTime(99)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledOnce()
  })
})

describe('onWardChange', () => {
  it('tells every listener once a change settles, until it stops', () => {
    const a = vi.fn()
    const b = vi.fn()
    const stopA = onWardChange(a)
    const stopB = onWardChange(b)
    announceWardChange()
    announceWardChange()
    vi.advanceTimersByTime(SETTLE_MS)
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
    stopA()
    announceWardChange()
    vi.advanceTimersByTime(SETTLE_MS)
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledTimes(2)
    stopB()
  })
})

describe('listenForWardChanges', () => {
  it('joins the private ward channel once signed in', async () => {
    const f = fakeEnv()
    listenForWardChanges(f.env)
    expect(f.client.channel).toHaveBeenCalledWith('ward', { config: { private: true } })
    expect(f.channel.on).toHaveBeenCalledWith('broadcast', { event: 'changed' }, expect.any(Function))
    await vi.waitFor(() => expect(f.channel.subscribe).toHaveBeenCalled())
    expect(f.client.realtime.setAuth).toHaveBeenCalled()
  })

  it('announces each change someone makes', () => {
    const f = fakeEnv()
    listenForWardChanges(f.env)
    f.changed()
    expect(f.announce).toHaveBeenCalledOnce()
  })

  it('catches up on rejoining after a dropped connection, but not on the first join', async () => {
    const f = fakeEnv()
    listenForWardChanges(f.env)
    await vi.waitFor(() => expect(f.channel.subscribe).toHaveBeenCalled())
    f.status('SUBSCRIBED')
    expect(f.announce).not.toHaveBeenCalled()
    f.status('CHANNEL_ERROR')
    f.status('SUBSCRIBED')
    expect(f.announce).toHaveBeenCalledOnce()
  })

  it('catches up when the app comes back to the front, not when it leaves', () => {
    const f = fakeEnv()
    listenForWardChanges(f.env)
    f.setVisibility('hidden')
    expect(f.announce).not.toHaveBeenCalled()
    f.setVisibility('visible')
    expect(f.announce).toHaveBeenCalledOnce()
  })

  it('leaves the channel and stops watching when it stops', () => {
    const f = fakeEnv()
    const stop = listenForWardChanges(f.env)
    stop()
    expect(f.client.removeChannel).toHaveBeenCalledWith(f.channel)
    expect(f.docListeners.size).toBe(0)
  })

  it('does not join if it stopped before the token was ready', async () => {
    let ready = () => {}
    const f = fakeEnv({ auth: new Promise<void>((r) => (ready = r)) })
    const stop = listenForWardChanges(f.env)
    stop()
    ready()
    await Promise.resolve()
    await Promise.resolve()
    expect(f.channel.subscribe).not.toHaveBeenCalled()
  })

  it('keeps working without live updates when the token fails', async () => {
    const f = fakeEnv({ auth: Promise.reject(new Error('offline')) })
    listenForWardChanges(f.env)
    await Promise.resolve()
    expect(f.channel.subscribe).not.toHaveBeenCalled()
    f.setVisibility('visible')
    expect(f.announce).toHaveBeenCalledOnce()
  })
})
