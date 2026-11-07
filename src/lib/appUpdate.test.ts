import { describe, expect, it, vi } from 'vitest'
import { FRESH_MS, keepUpToDate } from './appUpdate'

function fakeEnv({ controller = true } = {}) {
  const docListeners = new Map<string, () => void>()
  const swListeners = new Map<string, () => void>()
  const update = vi.fn(() => Promise.resolve())
  let time = 0
  const env = {
    doc: {
      visibilityState: 'visible' as DocumentVisibilityState,
      addEventListener: (type: string, fn: () => void) => docListeners.set(type, fn),
      removeEventListener: (type: string) => docListeners.delete(type),
    },
    sw: {
      controller: controller ? ({} as ServiceWorker) : null,
      getRegistration: vi.fn(() => Promise.resolve({ update } as unknown as ServiceWorkerRegistration)),
      addEventListener: (type: string, fn: () => void) => swListeners.set(type, fn),
      removeEventListener: (type: string) => swListeners.delete(type),
    },
    reload: vi.fn(),
    now: () => time,
  }
  const show = () => {
    env.doc.visibilityState = 'visible'
    docListeners.get('visibilitychange')?.()
  }
  const hide = () => {
    env.doc.visibilityState = 'hidden'
    docListeners.get('visibilitychange')?.()
  }
  const takeover = () => swListeners.get('controllerchange')?.()
  const wait = (ms: number) => (time += ms)
  return { env: env as unknown as Parameters<typeof keepUpToDate>[0], update, reload: env.reload, show, hide, takeover, wait, docListeners, swListeners }
}

describe('keepUpToDate', () => {
  it('looks for a new build each time the app comes back to the front', async () => {
    const f = fakeEnv()
    keepUpToDate(f.env)
    f.hide()
    expect(f.update).not.toHaveBeenCalled()
    f.show()
    await Promise.resolve()
    await Promise.resolve()
    expect(f.update).toHaveBeenCalledTimes(1)
  })

  it('reloads when the new build takes over right after coming back', () => {
    const f = fakeEnv()
    keepUpToDate(f.env)
    f.hide()
    f.wait(60_000)
    f.show()
    f.wait(2_000)
    f.takeover()
    expect(f.reload).toHaveBeenCalledTimes(1)
  })

  it('waits for the next return when the person has been using the app a while', () => {
    const f = fakeEnv()
    keepUpToDate(f.env)
    f.wait(FRESH_MS + 1)
    f.takeover()
    expect(f.reload).not.toHaveBeenCalled()
    f.hide()
    expect(f.reload).not.toHaveBeenCalled()
    f.show()
    expect(f.reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload on the first visit, when the service worker takes control for the first time', () => {
    const f = fakeEnv({ controller: false })
    keepUpToDate(f.env)
    f.takeover()
    f.hide()
    f.show()
    expect(f.reload).not.toHaveBeenCalled()
  })

  it('keeps the current build when the check fails', async () => {
    const f = fakeEnv()
    f.update.mockRejectedValueOnce(new Error('offline'))
    keepUpToDate(f.env)
    f.show()
    await new Promise((r) => setTimeout(r, 0))
    expect(f.reload).not.toHaveBeenCalled()
  })

  it('stops listening when stopped', () => {
    const f = fakeEnv()
    const stop = keepUpToDate(f.env)
    stop()
    expect(f.docListeners.size).toBe(0)
    expect(f.swListeners.size).toBe(0)
  })

  it('does nothing without service workers', () => {
    expect(() => keepUpToDate({})()).not.toThrow()
  })
})
