// Turning an error the app hit into a report for client_errors, and deciding which to send.
// The hourly health check (supabase/migrations/*_health_checks.sql) emails a count of them.
//
// A report holds the page path, the error and where in the code it happened, whether someone was
// signed in (not who), and the browser family, version and system. Never the query string or page
// contents, since those could name someone. Anything quoted, email addresses and long runs of
// digits are taken out of the message and stack before sending; report_client_error does the
// same again, so an older app version can't send them.

export type ErrorSource = 'render' | 'error' | 'promise' | 'load'

export type ErrorReport = {
  source: ErrorSource
  message: string
  stack: string | null
  route: string
  app_version: string
  /** Browser family, major version and system, like "Safari 18 iOS". Sent as user_agent. */
  user_agent: string
}

export type ErrorContext = { path: string; version: string; userAgent: string; online: boolean }

/** What the text says without anything that could name someone or hold their details. Kept in step with public.scrub_error_text(). */
export function scrubText(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '…')
    .replace(/"[^"\n]*"|`[^`\n]*`|“[^”\n]*”|‘[^’\n]*’/g, '…')
    // A single quote after a letter is an apostrophe ("can't"), not the start of a quote.
    .replace(/(^|[^A-Za-z])'[^'\n]*'/g, '$1…')
    .replace(/\(?\d(?:[ ().-]{0,2}\d){6,}/g, '…')
}

const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
  [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/OPR\/(\d+)/, 'Opera'],
  [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
  [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'],
  [/Version\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari\//, 'Safari'],
]

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/Macintosh|Mac OS X/, 'macOS'],
  [/Linux/, 'Linux'],
]

/**
 * The browser family, major version and system from a user agent, like "Safari 18 iOS" or
 * "Chrome 131 Android". Nothing finer, so a report can't single out one phone. Kept in step with
 * public.browser_family().
 */
export function browserFamily(userAgent: string): string {
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1]
  let browser = 'Other'
  for (const [pattern, name] of BROWSERS) {
    const match = pattern.exec(userAgent)
    if (match) {
      browser = `${name} ${match[1]}`
      break
    }
  }
  // An app added to the Home Screen on iOS says only which iOS it runs on.
  const ios = /OS (\d+)_\d+(?:_\d+)? like Mac OS X/.exec(userAgent)
  if (browser === 'Other' && system === 'iOS' && ios) browser = `Safari ${ios[1]}`
  return system ? `${browser} ${system}` : browser
}

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
    message: scrubText(message).slice(0, 500),
    stack: stack ? scrubText(stack).slice(0, 4000) : null,
    route: context.path.split(/[?#]/)[0].slice(0, 200) || '/',
    app_version: context.version.slice(0, 40),
    user_agent: browserFamily(context.userAgent),
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
