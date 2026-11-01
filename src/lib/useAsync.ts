import { useCallback, useEffect, useState } from 'react'

/** Runs a loader on mount and whenever deps change; `reload` re-runs it after a save. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const run = useCallback(load, deps)

  useEffect(() => {
    let cancelled = false
    setError(null)
    run()
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [run, version])

  return { data, error, reload: () => setVersion((v) => v + 1) }
}

/** Wraps a save so the button can show progress and the error can be shown inline. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
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
