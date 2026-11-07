import { describe, expect, it } from 'vitest'
import { PUSH_EVENTS } from '../../supabase/functions/push/plan'
// The latest migration to set which kinds notification_mutes accepts.
import migration from '../../supabase/migrations/20261107145553_meeting_assignments.sql?raw'
import { NOTIFICATIONS, notificationsFor } from './notifications'

const kinds = (roles: Parameters<typeof notificationsFor>[0], office: Parameters<typeof notificationsFor>[1]) =>
  notificationsFor(roles, office).flatMap((g) => g.items.map((i) => i.kind))

describe('notificationsFor', () => {
  it('shows a ward leader only what can reach them', () => {
    expect(kinds(['leader'], null)).toEqual(['request_sent', 'request_due', 'assignment_sent', 'calling_request_received', 'calling_request_progress'])
  })

  it('shows a secretary the booking ones, not the leader ones', () => {
    const mine = kinds(['bishopric'], 'executive_secretary')
    expect(mine).toEqual(expect.arrayContaining(['reminders', 'appointment_to_book', 'appointment_sent_back', 'away_conflict', 'day_summary']))
    expect(mine).not.toContain('appointment_booked')
    expect(mine).not.toContain('report_due')
  })

  it('shows a leader who holds interviews the leader ones', () => {
    const mine = kinds(['bishopric'], 'bishop')
    expect(mine).toEqual(expect.arrayContaining(['report_due', 'appointment_booked', 'appointment_changed', 'appointment_handed_over']))
    expect(mine).not.toContain('appointment_to_book')
  })

  it('tells the whole bishopric about short-handed Sundays, and no one else', () => {
    expect(kinds(['bishopric'], 'bishop')).toContain('short_sunday')
    expect(kinds(['bishopric'], 'executive_secretary')).toContain('short_sunday')
    expect(kinds(['leader'], null)).not.toContain('short_sunday')
  })

  it('gives only the ward clerk the callings to record', () => {
    expect(kinds(['bishopric'], 'ward_clerk')).toContain('callings_to_record')
    expect(kinds(['bishopric'], 'bishop')).not.toContain('callings_to_record')
  })

  it('shows nothing to someone with no role', () => {
    expect(notificationsFor([], null)).toEqual([])
  })
})

describe('the kinds', () => {
  it('name each instant notification after its event, so the push function can check the switch', () => {
    const all = NOTIFICATIONS.map((n) => n.kind)
    for (const e of PUSH_EVENTS) expect(all).toContain(e)
  })

  it('match what the database accepts', () => {
    const check = migration.slice(migration.indexOf('add constraint notification_mutes_kind_check'))
    const accepted = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
    expect(accepted).toEqual(NOTIFICATIONS.map((n) => n.kind).sort())
  })
})
