import { describe, expect, it } from 'vitest'
import {
  asStage,
  callingRequestSummary,
  followUps,
  isOverdue,
  isOverlooked,
  requestStatusLine,
  sentBy,
  unreceived,
  waitingOn,
  type Request,
} from './requests'

const base: Request = {
  id: 'r',
  from_id: 'bishop',
  to_id: 'secretary',
  title: 'Call the Lees',
  details: null,
  due_on: null,
  status: 'sent',
  reply: null,
  agenda_item_id: null,
  seen_at: null,
  closed_at: null,
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
}
const req = (over: Partial<Request>): Request => ({ ...base, ...over })

describe('waitingOn', () => {
  it('lists open requests to the person, unread first, then soonest due', () => {
    const rows = [
      req({ id: 'seen-due-late', status: 'seen', due_on: '2026-11-20' }),
      req({ id: 'done', status: 'done' }),
      req({ id: 'someone-else', to_id: 'clerk' }),
      req({ id: 'seen-due-soon', status: 'seen', due_on: '2026-11-05' }),
      req({ id: 'seen-no-date', status: 'seen' }),
      req({ id: 'unread', status: 'sent' }),
    ]
    expect(waitingOn('secretary', rows).map((r) => r.id)).toEqual(['unread', 'seen-due-soon', 'seen-due-late', 'seen-no-date'])
  })
})

describe('sentBy', () => {
  it('puts the sender’s open requests before closed ones', () => {
    const rows = [req({ id: 'closed', status: 'done' }), req({ id: 'open', status: 'seen' }), req({ id: 'not-mine', from_id: 'first' })]
    expect(sentBy('bishop', rows).map((r) => r.id)).toEqual(['open', 'closed'])
  })
})

describe('flags', () => {
  it('flags a request still unread two days on', () => {
    // Late on the 2nd and early on the 3rd on this device: today and dayOf() share its calendar.
    expect(isOverlooked(req({ created_at: new Date(2026, 10, 2, 23).toISOString() }), '2026-11-04')).toBe(true)
    expect(isOverlooked(req({ created_at: new Date(2026, 10, 3, 1).toISOString() }), '2026-11-04')).toBe(false)
    expect(isOverlooked(req({ status: 'seen', created_at: '2026-10-01T09:00:00Z' }), '2026-11-04')).toBe(false)
  })

  it('calls an open request past its date overdue', () => {
    expect(isOverdue(req({ due_on: '2026-11-03' }), '2026-11-04')).toBe(true)
    expect(isOverdue(req({ due_on: '2026-11-04' }), '2026-11-04')).toBe(false)
    expect(isOverdue(req({ due_on: '2026-11-03', status: 'done' }), '2026-11-04')).toBe(false)
  })

  it('says where a request stands', () => {
    expect(requestStatusLine(req({ status: 'seen', due_on: '2026-11-12' }), '2026-11-04')).toBe('Seen · due November 12th')
    expect(requestStatusLine(req({ due_on: '2026-11-01' }), '2026-11-04')).toBe('Not seen yet · was due November 1st')
    expect(requestStatusLine(req({ status: 'done', due_on: '2026-11-01' }), '2026-11-04')).toBe('Done')
  })
})

describe('followUps', () => {
  it('shows open requests and those closed in the week before the meeting', () => {
    const rows = [
      req({ id: 'closed-last-week', status: 'done', closed_at: '2026-11-03T12:00:00Z' }),
      req({ id: 'closed-long-ago', status: 'done', closed_at: '2026-10-20T12:00:00Z' }),
      req({ id: 'open', status: 'seen' }),
      req({ id: 'closed-after', status: 'declined', closed_at: '2026-11-09T12:00:00Z' }),
    ]
    expect(followUps('2026-11-08', rows).map((r) => r.id)).toEqual(['open', 'closed-last-week'])
  })
})

describe('calling requests', () => {
  it('summarizes each kind', () => {
    expect(callingRequestSummary({ kind: 'fill', calling_title: 'Primary Teacher', release_name: null })).toBe('Fill Primary Teacher')
    expect(callingRequestSummary({ kind: 'release', calling_title: 'Primary Pianist', release_name: 'Brother Hale' })).toBe('Release Brother Hale as Primary Pianist')
    expect(callingRequestSummary({ kind: 'replace', calling_title: 'Primary Pianist', release_name: 'Brother Hale' })).toBe(
      'Release Brother Hale and call someone new as Primary Pianist',
    )
    expect(callingRequestSummary({ kind: 'suggest', calling_title: 'Primary Pianist', release_name: null })).toBe('Names for Primary Pianist')
  })

  it('lists requests not yet received, for the people they went to', () => {
    const rows = [
      { id: 'b', received_at: null, routed_to: ['second'], created_at: '2026-11-02' },
      { id: 'a', received_at: null, routed_to: ['first', 'second'], created_at: '2026-11-01' },
      { id: 'done', received_at: '2026-11-03', routed_to: ['second'], created_at: '2026-11-01' },
    ]
    expect(unreceived(rows, 'second').map((r) => r.id)).toEqual(['a', 'b'])
    expect(unreceived(rows, 'first').map((r) => r.id)).toEqual(['a'])
    expect(unreceived(rows).map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('treats a stage it doesn’t know as sent', () => {
    expect(asStage('in_progress')).toBe('in_progress')
    expect(asStage('something new')).toBe('sent')
  })
})
