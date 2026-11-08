import { describe, expect, it, vi } from 'vitest'
import { browserFamily, createReporter, describeError, scrubText, type ErrorReport } from './errorReport'

const context = { path: '/agenda/bishopric?date=2026-11-08#top', version: 'abc1234', userAgent: 'Test browser', online: true }

describe('describeError', () => {
  it('keeps the message, stack and path without the query string', () => {
    const error = new Error('Could not load the agenda')
    const report = describeError('load', error, context)
    expect(report).toMatchObject({ source: 'load', message: 'Could not load the agenda', route: '/agenda/bishopric', app_version: 'abc1234', user_agent: 'Other' })
    expect(report?.stack).toContain('Could not load the agenda')
  })

  it('takes names and details out of the message and stack', () => {
    const error = new Error('No request "Visit Sister Ames" for ames@example.com, call 555-123-4567')
    error.stack = `Error: No request "Visit Sister Ames"\n    at load (https://warddesk.app/assets/index-B1x2.js:1:23456)`
    const report = describeError('load', error, context)
    expect(report?.message).toBe('No request … for …, call …')
    expect(report?.stack).toBe('Error: No request …\n    at load (https://warddesk.app/assets/index-B1x2.js:1:23456)')
  })

  it('keeps only the browser family, version and system', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
    expect(describeError('error', new Error('x'), { ...context, userAgent: iphone })?.user_agent).toBe('Safari 18 iOS')
  })

  it('names error types other than plain Error', () => {
    expect(describeError('error', new TypeError('x is undefined'), context)?.message).toBe('TypeError: x is undefined')
  })

  it('adds the component stack after the error stack', () => {
    const error = new Error('boom')
    error.stack = 'Error: boom\n    at Page'
    expect(describeError('render', error, context, '\n    in AgendaPage')?.stack).toBe('Error: boom\n    at Page\n\n    in AgendaPage')
  })

  it('takes things that are not errors', () => {
    expect(describeError('promise', 'rejected', context)).toMatchObject({ message: 'rejected', stack: null })
  })

  it('cuts long text short', () => {
    const report = describeError('error', new Error('x'.repeat(900)), { ...context, path: `/${'p'.repeat(300)}` })
    expect(report?.message).toHaveLength(500)
    expect(report?.route).toHaveLength(200)
  })

  it('skips errors while offline, browser noise and empty messages', () => {
    expect(describeError('load', new Error('Failed to fetch'), { ...context, online: false })).toBeNull()
    expect(describeError('error', new Error('ResizeObserver loop completed with undelivered notifications.'), context)).toBeNull()
    expect(describeError('error', 'Script error.', context)).toBeNull()
    expect(describeError('promise', undefined, context)).toBeNull()
  })
})

describe('createReporter', () => {
  const report = (message: string): ErrorReport => ({ source: 'error', message, stack: null, route: '/', app_version: 'dev', user_agent: '' })

  it('sends each different error once', () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const reportError = createReporter(send)
    reportError(report('a'))
    reportError(report('a'))
    reportError(report('b'))
    reportError(null)
    expect(send.mock.calls.map(([r]) => r.message)).toEqual(['a', 'b'])
  })

  it('stops after the limit', () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const reportError = createReporter(send, 3)
    for (const m of ['a', 'b', 'c', 'd', 'e']) reportError(report(m))
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('never throws when sending fails', async () => {
    const reportError = createReporter(() => Promise.reject(new Error('offline')))
    expect(() => reportError(report('a'))).not.toThrow()
  })
})

describe('scrubText', () => {
  it('replaces quoted text, keeping apostrophes', () => {
    expect(scrubText(`Can't find "Brother Lane" or 'Lane' or \`Lane\` or “Lane”`)).toBe("Can't find … or … or … or …")
    expect(scrubText("Cannot read properties of undefined (reading 'name')")).toBe('Cannot read properties of undefined (reading …)')
  })

  it('replaces email addresses', () => {
    expect(scrubText('Invite failed for first.last+ward@example.co.uk')).toBe('Invite failed for …')
  })

  it('replaces long runs of digits, with or without separators', () => {
    expect(scrubText('Record 000-1234-5678 and (555) 123-4567 and 1234567')).toBe('Record … and … and …')
  })

  it('keeps short numbers like line and column numbers', () => {
    expect(scrubText('at f (index.js:12:345678) status 404')).toBe('at f (index.js:12:345678) status 404')
  })

  it('changes nothing it already scrubbed', () => {
    const once = scrubText('Hi "Sister Ames" at ames@example.com, 5551234567')
    expect(scrubText(once)).toBe(once)
  })
})

describe('browserFamily', () => {
  const agents: [string, string][] = [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', 'Safari 18 iOS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', 'Safari 17 iOS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1', 'Chrome 131 iOS'],
    ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', 'Chrome 131 Android'],
    ['Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36', 'Samsung Internet 26 Android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0', 'Edge 131 Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', 'Safari 18 macOS'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0', 'Firefox 133 Linux'],
    ['Test browser', 'Other'],
  ]
  it.each(agents)('%s', (agent, family) => {
    expect(browserFamily(agent)).toBe(family)
  })
})
