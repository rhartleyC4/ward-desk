/**
 * Tracks work the user is waiting on (a save, the reload after it, signing in) so one overlay
 * can cover the app while it runs. Taps are blocked straight away, so nothing gets sent twice,
 * but the spinner only appears once the wait passes SHOW_AFTER_MS: anything quicker feels
 * instant, and a spinner that flashes up and away reads as a glitch. Once it's shown it stays
 * at least MIN_SHOWN_MS for the same reason.
 */

export const SHOW_AFTER_MS = 250
export const MIN_SHOWN_MS = 500

/** idle: nothing running. waiting: running, taps blocked, no spinner yet. shown: spinner up. */
export type BusyPhase = 'idle' | 'waiting' | 'shown'

let running = 0
let phase: BusyPhase = 'idle'
let shownAt = 0
let showTimer: ReturnType<typeof setTimeout> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function set(next: BusyPhase) {
  if (next === phase) return
  phase = next
  listeners.forEach((l) => l())
}

function start() {
  running++
  clearTimeout(hideTimer)
  hideTimer = undefined
  if (phase !== 'idle') return
  set('waiting')
  showTimer = setTimeout(() => {
    shownAt = Date.now()
    set('shown')
  }, SHOW_AFTER_MS)
}

function settle() {
  if (running > 0) return
  if (phase === 'waiting') {
    clearTimeout(showTimer)
    set('idle')
  } else if (phase === 'shown' && hideTimer === undefined) {
    hideTimer = setTimeout(
      () => {
        hideTimer = undefined
        if (running === 0) set('idle')
      },
      Math.max(0, MIN_SHOWN_MS - (Date.now() - shownAt)),
    )
  }
}

function finish() {
  running--
  // A save is usually followed straight away by the reload it triggers; wait a tick so that
  // handover doesn't count as finishing and restart the clock.
  if (running === 0) setTimeout(settle, 0)
}

/** Covers the app while `work` runs and passes its result (or error) through. */
export function trackBusy<T>(work: PromiseLike<T> | T): Promise<Awaited<T>> {
  start()
  return Promise.resolve(work).finally(finish)
}

export function busyPhase(): BusyPhase {
  return phase
}

export function onBusyChange(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
