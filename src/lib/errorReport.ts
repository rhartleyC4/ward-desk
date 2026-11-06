// Turning an error the app hit into a report for client_errors, and deciding which to send.
// The hourly health check (supabase/migrations/*_health_checks.sql) emails a count of them.
//
// A report holds the page path, the error and where in the code it happened. Never the query
// string or page contents, since those could name someone.

export type ErrorSource = 'render' | 'error' | 'promise' | 'load'

export type ErrorReport = {
  source: ErrorSource
  message: string
  stack: string | null
  route: string
  app_version: string
  user_agent: string
}

export type ErrorContext = { path: string; version: string; userAgent: string; online: boolean }

/** Noise that says nothing about the app: a browser quirk, or a script from another site. */
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/]

export function describeError(source: ErrorSource, error: unknown, context: ErrorContext, extraStack?: string | null): ErrorReport | null {
  // Offline, every request fails. That is the phone, not the app.
  if (!context.online) return null
  const message = (error instanceof Error ? `${error.name === 'Error' ? '' : `${error.name}: `}${error.message}` : String(error ?? '')).trim()
  if (!message || IGNORED.some((p) => p.test(message))) return null
  const stack = [error instanceof Error ? error.stack : undefined, extraStack].filter(Boolean).join('\n').trim()
  return {
    source,
    message: message.slice(0, 500),
    stack: stack ? stack.slice(0, 4000) : null,
    route: context.path.split(/[?#]/)[0].slice(0, 200) || '/',
    app_version: context.version.slice(0, 40),
    user_agent: context.userAgent.slice(0, 300),
  }
}

/**
 * Sends each different error once per page load, and at most `max` in all, so a render loop on
 * one phone can't send hundreds. A report that can't be sent is dropped: the app must never fail
 * because reporting a failure did.
 */
export function createReporter(send: (report: ErrorReport) => Promise<unknown>, max = 10) {
  const seen = new Set<string>()
  return (report: ErrorReport | null) => {
    if (!report || seen.size >= max) return
    const key = `${report.source}:${report.message}`
    if (seen.has(key)) return
    seen.add(key)
    try {
      send(report).catch(() => {})
    } catch {
      // Dropped, as above.
    }
  }
}

let reporter: ((report: ErrorReport | null) => void) | null = null

/** Starts sending reports. main.tsx calls it once; until then (and in tests) reportError does nothing. */
export function startReporting(send: (report: ErrorReport) => Promise<unknown>) {
  reporter = createReporter(send)
  window.addEventListener('error', (e) => reportError('error', e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportError('promise', e.reason))
}

/** Reports an error from anywhere in the app, if reporting has started. */
export function reportError(source: ErrorSource, error: unknown, extraStack?: string | null) {
  if (!reporter) return
  reporter(describeError(source, error, { path: location.pathname, version: __APP_VERSION__, userAgent: navigator.userAgent, online: navigator.onLine }, extraStack))
}
