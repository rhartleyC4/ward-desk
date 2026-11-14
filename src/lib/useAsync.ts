import { useCallback, useEffect, useRef, useState } from 'react'
import { trackBusy } from './busy'
import { reportError } from './errorReport'
import { onWardChange } from './liveUpdates'

/**
 * Runs a loader on mount and whenever deps change; `reload` re-runs it after a save. It also
 * re-runs when someone else changes ward data, keeping what's shown until the new data arrives.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  // Reloads waiting for the next load to land, so the busy overlay covers the refresh too.
  const waiting = useRef<(() => void)[]>([])

  const run = useCallback(load, deps)

  useEffect(() => {
    let cancelled = false
    setError(null)
    run()
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => {
        if (cancelled) return
        setError(e.message)
        // The page shows it too, but a load that fails is worth knowing about.
        reportError('load', e)
      })
      .finally(() => {
        if (cancelled) return
        waiting.current.splice(0).forEach((done) => done())
      })
    return () => {
      cancelled = true
    }
  }, [run, version])

  useEffect(() => onWardChange(() => setVersion((v) => v + 1)), [])
  // Leaving the page mid-reload must not leave the overlay up.
  useEffect(() => () => waiting.current.splice(0).forEach((done) => done()), [])

  // Callers don't wait for this; the overlay does, so the old data isn't left looking current.
  const reload = () => {
    void trackBusy(new Promise<void>((done) => waiting.current.push(done)))
    setVersion((v) => v + 1)
  }

  return { data, error, reload }
}

/** Wraps a save so the button can show progress and the error can be shown inline. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await trackBusy(fn())
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, act }
}
