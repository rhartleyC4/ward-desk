import { describe, expect, it } from 'vitest'
import { appointmentsOn, meetingsToRemind, meetingWhen, remindersMessage, remindersWindow, reportDue, reportMessage, toConfirm, toReport, type FollowUpAppointment } from './followUp'

const TZ = 'America/Denver'
const appt = (id: string, extra: Partial<FollowUpAppointment> = {}): FollowUpAppointment => ({
  id,
  interviewer_id: 'b',
  scheduled_at: null,
  duration_minutes: 10,
  status: 'scheduled',
  confirmed_at: null,
  reminded_at: null,
  ...extra,
})

// Sunday, November 8th 2026 in Denver (UTC-7).
const at = (time: string) => new Date(`2026-11-08T${time}:00-07:00`)
const iso = (time: string) => at(time).toISOString()

describe('toReport', () => {
  const list = [
    appt('late', { scheduled_at: iso('10:00') }),
    appt('early', { scheduled_at: iso('09:00') }),
    appt('other', { scheduled_at: iso('09:00'), interviewer_id: 'l' }),
    appt('waiting'),
    appt('done', { scheduled_at: iso('08:00'), status: 'completed' }),
  ]
  it('lists my appointments that are over, oldest first', () => {
    expect(toReport('b', list, at('10:15')).map((a) => a.id)).toEqual(['early', 'late'])
  })
  it('waits until one has ended', () => {
    expect(toReport('b', list, at('10:05')).map((a) => a.id)).toEqual(['early'])
  })
})

describe('toConfirm', () => {
  it('lists booked, unconfirmed, upcoming times for my leaders', () => {
    const list = [
      appt('soon', { scheduled_at: iso('11:00') }),
      appt('told', { scheduled_at: iso('11:00'), confirmed_at: iso('08:00') }),
      appt('past', { scheduled_at: iso('08:00') }),
      appt('theirs', { scheduled_at: iso('11:00'), interviewer_id: 'o' }),
      appt('unbooked'),
    ]
    expect(toConfirm(list, ['b'], at('09:00')).map((a) => a.id)).toEqual(['soon'])
  })
})

describe('appointmentsOn', () => {
  it('uses the ward date, not UTC', () => {
    // 8 PM Sunday in Denver is Monday in UTC.
    const list = [appt('evening', { scheduled_at: iso('20:00') }), appt('morning', { scheduled_at: iso('09:00') })]
    expect(appointmentsOn(list, ['b'], '2026-11-08', TZ).map((a) => a.id)).toEqual(['morning', 'evening'])
    expect(appointmentsOn(list, ['b'], '2026-11-09', TZ)).toEqual([])
  })
})

describe('meetingsToRemind', () => {
  const events = [
    { id: 'wc', title: 'Ward Council', weekday: 0, week_of_month: 2, start_time: '09:15:00', reminder_by: 'exec', agenda_template_id: null },
    { id: 'bm', title: 'Bishopric meeting', weekday: 0, week_of_month: null, start_time: '08:30:00', reminder_by: null, agenda_template_id: null },
    { id: 'yc', title: 'Youth council', weekday: 0, week_of_month: 3, start_time: '09:30:00', reminder_by: 'exec', agenda_template_id: null },
  ]
  it('finds the meetings that day this secretary reminds people about', () => {
    expect(meetingsToRemind('exec', '2026-11-08', events).map((e) => e.id)).toEqual(['wc'])
    expect(meetingsToRemind('assistant', '2026-11-08', events)).toEqual([])
  })
  it('says when, with or without a time', () => {
    expect(meetingWhen('2026-11-08', '09:15:00')).toBe('Sunday, November 8th at 9:15 AM')
    expect(meetingWhen('2026-11-08', null)).toBe('Sunday, November 8th')
  })
})

describe('reportDue', () => {
  const day = [appt('a', { scheduled_at: iso('09:00') }), appt('b', { scheduled_at: iso('10:00'), duration_minutes: 20 })]

  it('asks half an hour after the last appointment of the day ends', () => {
    expect(reportDue('b', day, at('10:49'), TZ)).toBe(0)
    expect(reportDue('b', day, at('10:50'), TZ)).toBe(2)
  })

  it('counts only what is still unreported, and never asks when everything is', () => {
    const reported = [{ ...day[0], status: 'completed' as const }, day[1]]
    expect(reportDue('b', reported, at('11:00'), TZ)).toBe(1)
    expect(reportDue('b', day.map((a) => ({ ...a, status: 'completed' as const })), at('11:00'), TZ)).toBe(0)
  })

  it("waits for a later appointment even if it's already reported", () => {
    const list = [day[0], { ...day[1], status: 'completed' as const }]
    expect(reportDue('b', list, at('10:30'), TZ)).toBe(0)
  })

  it('ignores other days, other leaders and cancelled ones', () => {
    expect(reportDue('l', day, at('12:00'), TZ)).toBe(0)
    expect(reportDue('b', [appt('x', { scheduled_at: '2026-11-07T16:00:00Z' })], at('12:00'), TZ)).toBe(0)
    expect(reportDue('b', [day[0], { ...day[1], status: 'cancelled' as const }], at('09:40'), TZ)).toBe(1)
  })
})

describe('remindersWindow', () => {
  it("asks for tomorrow's reminders between 10 AM and 8 PM", () => {
    expect(remindersWindow(at('09:59'), TZ)).toBeNull()
    expect(remindersWindow(at('10:00'), TZ)).toBe('2026-11-09')
    expect(remindersWindow(at('19:59'), TZ)).toBe('2026-11-09')
    expect(remindersWindow(at('20:00'), TZ)).toBeNull()
  })
})

describe('notification text', () => {
  it('never names anyone', () => {
    expect(reportMessage('2026-11-08', 1)).toEqual({ title: 'How did your appointments go?', body: '1 appointment today is ready to mark done or missed.', url: '/home', tag: 'report-2026-11-08' })
    expect(reportMessage('2026-11-08', 3).body).toBe('3 appointments today are ready to mark done or missed.')
  })
  it('lists reminders to send and opens the day', () => {
    expect(remindersMessage('2026-11-09', 2, ['Ward Council'])).toEqual({
      title: 'Reminders for tomorrow',
      body: '2 appointment reminders to send\nWard Council: reminder to send',
      url: '/reminders?date=2026-11-09',
      tag: 'reminders-2026-11-09',
    })
    expect(remindersMessage('2026-11-09', 0, ['Ward Council']).body).toBe('Ward Council: reminder to send')
  })
})
