import { describe, expect, it } from 'vitest'
import { planPush, type CallingRequestRow, type RequestRow } from './plan.ts'

const now = new Date('2026-11-04T18:00:00Z')
const justNow = '2026-11-04T17:58:00Z'
const longAgo = '2026-11-04T16:00:00Z'

const request = (over: Partial<RequestRow> = {}): RequestRow => ({ id: 'r1', from_id: 'bishop', to_id: 'sec', status: 'sent', updated_at: justNow, ...over })
const calling = (over: Partial<CallingRequestRow> = {}): CallingRequestRow => ({ id: 'c1', requested_by: 'leader', routed_to: ['second'], received_by: null, received_at: null, created_at: justNow, ...over })

describe('planPush', () => {
  it('tells the person asked, without saying what about', () => {
    expect(planPush('request_sent', request(), 'bishop', 'bishop', now)).toEqual({
      key: 'request:r1:sent:sec',
      to: ['sec'],
      message: { title: 'New request', body: 'The bishop asked you to do something. Open Ward Desk to see it.', url: '/requests', tag: 'request-r1' },
    })
  })

  it('tells the sender when it’s seen, done, or can’t be done', () => {
    expect(planPush('request_answered', request({ status: 'seen' }), 'sec', 'executive_secretary', now)).toMatchObject({ key: 'request:r1:seen', to: ['bishop'], message: { body: 'Your request was seen.' } })
    expect(planPush('request_answered', request({ status: 'done' }), 'sec', null, now)).toMatchObject({ key: 'request:r1:done', message: { body: 'Your request is done.' } })
    expect(planPush('request_answered', request({ status: 'declined' }), 'sec', null, now)).toMatchObject({ key: 'request:r1:declined' })
  })

  it('only lets the person who made the change announce it', () => {
    expect(planPush('request_sent', request(), 'first', 'first_counselor', now)).toHaveProperty('skip')
    expect(planPush('request_answered', request({ status: 'done' }), 'bishop', 'bishop', now)).toHaveProperty('skip')
    expect(planPush('calling_request_sent', calling(), 'rspres', null, now)).toHaveProperty('skip')
    expect(planPush('calling_request_received', calling({ received_by: 'second', received_at: justNow }), 'first', 'first_counselor', now)).toHaveProperty('skip')
  })

  it('ignores old changes and the wrong status', () => {
    expect(planPush('request_sent', request({ updated_at: longAgo }), 'bishop', 'bishop', now)).toHaveProperty('skip')
    expect(planPush('request_sent', request({ status: 'seen' }), 'bishop', 'bishop', now)).toHaveProperty('skip')
    expect(planPush('request_answered', request(), 'sec', null, now)).toHaveProperty('skip')
    expect(planPush('calling_request_received', calling({ received_by: 'second', received_at: longAgo }), 'second', null, now)).toHaveProperty('skip')
  })

  it('sends a calling request to the bishopric members it was routed to, and the receipt to the leader', () => {
    expect(planPush('calling_request_sent', calling({ routed_to: ['first', 'second'] }), 'leader', null, now)).toMatchObject({ key: 'calling:c1:sent', to: ['first', 'second'], message: { title: 'New calling request' } })
    expect(planPush('calling_request_received', calling({ received_by: 'second', received_at: justNow }), 'second', 'second_counselor', now)).toMatchObject({
      key: 'calling:c1:received',
      to: ['leader'],
      message: { body: 'The bishopric has your calling request.' },
    })
  })

  it('names the sender by office, never by name', () => {
    expect(planPush('request_sent', request(), 'bishop', null, now)).toMatchObject({ message: { body: expect.stringMatching(/^A member of the bishopric asked/) } })
  })
})
