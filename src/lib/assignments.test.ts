import { describe, expect, it } from 'vitest'
import { assignmentChanges, assignmentMessage, assignmentSubject, upcomingForMe, waitingAnswer } from './assignments'
import { emailLink } from './messages'

describe('assignmentChanges', () => {
  const current = [
    { part: 'opening_prayer' as const, assignee_id: 'young' },
    { part: 'closing_prayer' as const, assignee_id: 'lane' },
  ]

  it('leaves a part with the same person alone, so their answer stands', () => {
    expect(assignmentChanges(current, { opening_prayer: 'young', closing_prayer: 'lane' })).toEqual([])
  })

  it('gives a part to someone new and takes one away', () => {
    expect(assignmentChanges(current, { opening_prayer: 'hollis', spiritual_thought: 'vance', closing_prayer: '' })).toEqual([
      { part: 'opening_prayer', to: 'hollis' },
      { part: 'spiritual_thought', to: 'vance' },
      { part: 'closing_prayer', to: null },
    ])
  })

  it('ignores parts the form didn’t send', () => {
    expect(assignmentChanges(current, { spiritual_thought: null })).toEqual([])
  })
})

describe('upcomingForMe', () => {
  const mine = [
    { id: 'past', meeting_date: '2026-11-01', status: 'asked' as const },
    { id: 'accepted', meeting_date: '2026-11-08', status: 'accepted' as const },
    { id: 'declined', meeting_date: '2026-11-08', status: 'declined' as const },
    { id: 'later', meeting_date: '2026-11-22', status: 'asked' as const },
    { id: 'today', meeting_date: '2026-11-06', status: 'accepted' as const },
  ]

  it('shows what’s still to come, unanswered first, without the declined ones', () => {
    expect(upcomingForMe(mine, '2026-11-06').map((a) => a.id)).toEqual(['later', 'today', 'accepted'])
  })

  it('counts only the unanswered ones as waiting', () => {
    expect(waitingAnswer(mine, '2026-11-06').map((a) => a.id)).toEqual(['later'])
  })
})

describe('assignmentMessage', () => {
  it('asks by name for the part, meeting and time, signed by whoever sends it', () => {
    expect(assignmentMessage({ name: 'Sister Young', part: 'opening_prayer', meeting: 'Ward Council', date: '2026-11-08', startTime: '09:15:00', myName: 'Brother Quinn' })).toBe(
      "Hi Sister Young, would you be willing to give the opening prayer in Ward Council on Sunday, November 8th at 9:15 AM? Please let me know either way, or if you'll be away that day.\n\nThanks!\nBrother Quinn",
    )
  })

  it('reads fine without a name or a time', () => {
    expect(assignmentMessage({ name: '', part: 'spiritual_thought', meeting: 'Bishopric Meeting', date: '2026-11-08', startTime: null, myName: '' })).toBe(
      "Hi, would you be willing to share the spiritual thought in Bishopric Meeting on Sunday, November 8th? Please let me know either way, or if you'll be away that day.\n\nThanks!",
    )
  })

  it('emails the person straight away', () => {
    expect(emailLink(assignmentSubject('Ward Council', '2026-11-08'), 'Hi', 'rspres@ward.test')).toBe('mailto:rspres@ward.test?subject=Ward%20Council%2C%20November%208th&body=Hi')
  })
})
