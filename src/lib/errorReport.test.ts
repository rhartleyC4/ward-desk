import { describe, expect, it, vi } from 'vitest'
import { createReporter, describeError, type ErrorReport } from './errorReport'

const context = { path: '/agenda/bishopric?date=2026-11-08#top', version: 'abc1234', userAgent: 'Test browser', online: true }

describe('describeError', () => {
  it('keeps the message, stack and path without the query string', () => {
    const error = new Error('Could not load the agenda')
    const report = describeError('load', error, context)
    expect(report).toMatchObject({ source: 'load', message: 'Could not load the agenda', route: '/agenda/bishopric', app_version: 'abc1234', user_agent: 'Test browser' })
    expect(report?.stack).toContain('Could not load the agenda')
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
