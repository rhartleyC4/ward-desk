import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { busyPhase, MIN_SHOWN_MS, onBusyChange, SHOW_AFTER_MS, trackBusy } from './busy'

function deferred() {
  let resolve!: () => void
  let reject!: (e: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Let settled promises run their handlers, then any timers they started at 0ms.
const flush = () => vi.advanceTimersByTimeAsync(0)

describe('busy overlay timing', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(async () => {
    await vi.runAllTimersAsync()
    vi.useRealTimers()
  })

  it('blocks taps at once but holds the spinner back for a quick save', async () => {
    const save = deferred()
    void trackBusy(save.promise)
    expect(busyPhase()).toBe('waiting')
    await vi.advanceTimersByTimeAsync(SHOW_AFTER_MS - 50)
    save.resolve()
    await flush()
    expect(busyPhase()).toBe('idle')
  })

  it('shows the spinner for a slow save and keeps it up long enough to see', async () => {
    const save = deferred()
    void trackBusy(save.promise)
    await vi.advanceTimersByTimeAsync(SHOW_AFTER_MS)
    expect(busyPhase()).toBe('shown')
    save.resolve()
    await flush()
    expect(busyPhase()).toBe('shown')
    await vi.advanceTimersByTimeAsync(MIN_SHOWN_MS)
    expect(busyPhase()).toBe('idle')
  })

  it('treats a save and the reload after it as one wait', async () => {
    const save = deferred()
    const reload = deferred()
    void trackBusy(save.promise).then(() => trackBusy(reload.promise))
    await vi.advanceTimersByTimeAsync(SHOW_AFTER_MS - 100)
    save.resolve()
    await flush()
    expect(busyPhase()).toBe('waiting')
    // The clock didn't restart at the handover, so the spinner arrives on time.
    await vi.advanceTimersByTimeAsync(100)
    expect(busyPhase()).toBe('shown')
    reload.resolve()
    await vi.advanceTimersByTimeAsync(MIN_SHOWN_MS)
    expect(busyPhase()).toBe('idle')
  })

  it('clears after a failed save and passes the error on', async () => {
    const save = deferred()
    const tracked = trackBusy(save.promise)
    save.reject(new Error('offline'))
    await expect(tracked).rejects.toThrow('offline')
    await flush()
    expect(busyPhase()).toBe('idle')
  })

  it('tells listeners when the phase changes', async () => {
    const changed = vi.fn()
    const stop = onBusyChange(changed)
    const save = deferred()
    void trackBusy(save.promise)
    save.resolve()
    await flush()
    stop()
    expect(changed).toHaveBeenCalledTimes(2)
  })
})
