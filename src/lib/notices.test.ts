import { describe, expect, it } from 'vitest'
import { bookersFor, planNotices, progressMessage, requestsDueMessage, toRecordMessage, whenLabel, type NoticeContext, type OutboxRow } from './notices'

const TZ = 'America/Denver'
// Friday, November 6th 2026, 2 PM in Denver (UTC-7).
const NOW = new Date('2026-11-06T14:00:00-07:00')
const iso = (date: string, time: string) => new Date(`${date}T${time}:00-07:00`).toISOString()

const people: NoticeContext['people'] = [
  { id: 'bishop', office: 'bishop' },
  { id: 'first', office: 'first_counselor' },
  { id: 'exec', office: 'executive_secretary' },
  { id: 'asst', office: 'assistant_executive_secretary' },
  { id: 'clerk', office: 'ward_clerk' },
]

const ctx = (more: Partial<NoticeContext> = {}): NoticeContext => ({
  people,
  assignments: [],
  appointments: [],
  absences: [],
  summarized: new Set(),
  now: NOW,
  timeZone: TZ,
  ...more,
})

let nextId = 1
const row = (event: OutboxRow['event'], more: Partial<OutboxRow> = {}): OutboxRow => ({
  id: nextId++,
  event,
  actor_id: 'bishop',
  interview_id: 'a1',
  absence_id: null,
  leader_id: 'bishop',
  old_leader_id: null,
  scheduled_at: null,
  old_scheduled_at: null,
  ...more,
})

const appt = (more: Partial<NoticeContext['appointments'][number]> = {}) => ({ id: 'a1', interviewer_id: 'bishop', scheduled_at: null, status: 'scheduled' as const, ...more })

describe('whenLabel', () => {
  it('says today, tomorrow, or the day', () => {
    expect(whenLabel(iso('2026-11-06', '15:00'), NOW, TZ)).toBe('today at 3 PM')
    expect(whenLabel(iso('2026-11-07', '09:30'), NOW, TZ)).toBe('tomorrow at 9:30 AM')
    expect(whenLabel(iso('2026-11-10', '19:00'), NOW, TZ)).toBe('Tue, Nov 10 at 7 PM')
  })
})

describe('bookersFor', () => {
  it('uses who books for whom', () => {
    expect(bookersFor('bishop', people, [{ leader_id: 'bishop', secretary_id: 'asst' }])).toEqual(['asst'])
  })
  it('falls back to the one executive secretary', () => {
    expect(bookersFor('first', people, [{ leader_id: 'bishop', secretary_id: 'asst' }])).toEqual(['exec'])
  })
  it('tells every secretary when there is no one executive secretary', () => {
    const two = [...people, { id: 'exec2', office: 'executive_secretary' as const }]
    expect(bookersFor('first', two, []).sort()).toEqual(['asst', 'exec', 'exec2'])
  })
})

describe('planNotices', () => {
  it('tells the secretary about a new appointment to book, never naming who', () => {
    const [n, ...rest] = planNotices([row('added')], ctx({ appointments: [appt()] }))
    expect(rest).toEqual([])
    expect(n.to).toBe('exec')
    expect(n.kind).toBe('appointment_to_book')
    expect(n.message.body).toBe('The bishop has a new appointment to book.')
    expect(n.message.tag.length).toBeLessThanOrEqual(32)
  })

  it('says nothing once the appointment is booked or gone', () => {
    expect(planNotices([row('added')], ctx({ appointments: [appt({ scheduled_at: iso('2026-11-09', '10:00') })] }))).toEqual([])
    expect(planNotices([row('added')], ctx())).toEqual([])
  })

  it('never tells whoever made the change', () => {
    expect(planNotices([row('added', { actor_id: 'exec' })], ctx({ appointments: [appt()] }))).toEqual([])
  })

  it('tells the secretary when a missed appointment is sent back', () => {
    const [n] = planNotices([row('sent_back', { old_scheduled_at: iso('2026-11-06', '10:00') })], ctx({ appointments: [appt()] }))
    expect(n).toMatchObject({ to: 'exec', kind: 'appointment_sent_back', message: { title: 'Appointment to rebook', body: 'The bishop sent back a missed appointment to find a new time.' } })
  })

  it('tells a leader about a booking today', () => {
    const at = iso('2026-11-06', '16:00')
    const [n] = planNotices([row('booked', { actor_id: 'exec', scheduled_at: at })], ctx({ appointments: [appt({ scheduled_at: at })] }))
    expect(n).toMatchObject({ to: 'bishop', kind: 'appointment_booked', message: { body: 'An appointment was booked for you today at 4 PM.' } })
  })

  it('tells about tomorrow only once the summary has gone', () => {
    const at = iso('2026-11-07', '10:00')
    const rows = [row('booked', { actor_id: 'exec', scheduled_at: at })]
    const appointments = [appt({ scheduled_at: at })]
    expect(planNotices(rows, ctx({ appointments }))).toEqual([])
    expect(planNotices(rows, ctx({ appointments, summarized: new Set(['bishop:2026-11-07']) }))).toHaveLength(1)
  })

  it('leaves bookings further out to the summary', () => {
    const at = iso('2026-11-12', '10:00')
    expect(planNotices([row('booked', { actor_id: 'exec', scheduled_at: at })], ctx({ appointments: [appt({ scheduled_at: at })] }))).toEqual([])
  })

  it('tells a leader when a time moves, only about the latest one', () => {
    const from = iso('2026-11-10', '19:00')
    const to = iso('2026-11-11', '19:30')
    const later = iso('2026-11-12', '19:00')
    const rows = [row('moved', { actor_id: 'exec', scheduled_at: to, old_scheduled_at: from }), row('moved', { actor_id: 'exec', scheduled_at: later, old_scheduled_at: to })]
    const notices = planNotices(rows, ctx({ appointments: [appt({ scheduled_at: later })] }))
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ kind: 'appointment_changed', message: { body: 'Your appointment Wed, Nov 11 at 7:30 PM moved to Thu, Nov 12 at 7 PM.' } })
  })

  it('tells a leader about a cancelled appointment still to come, not one already past', () => {
    const coming = row('cancelled', { actor_id: 'exec', old_scheduled_at: iso('2026-11-10', '19:00') })
    const past = row('cancelled', { actor_id: 'exec', old_scheduled_at: iso('2026-11-05', '19:00') })
    const notices = planNotices([coming, past], ctx({ appointments: [appt({ status: 'cancelled' })] }))
    expect(notices.map((n) => n.message.body)).toEqual(['Your appointment Tue, Nov 10 at 7 PM was cancelled.'])
  })

  it('tells the new leader, their secretary and the old leader when an appointment is handed over', () => {
    const at = iso('2026-11-10', '19:00')
    const notices = planNotices(
      [row('handed_over', { actor_id: 'clerk', leader_id: 'first', old_leader_id: 'bishop', scheduled_at: at, old_scheduled_at: at })],
      ctx({ appointments: [appt({ interviewer_id: 'first', scheduled_at: at })] }),
    )
    expect(notices.map((n) => [n.to, n.kind, n.message.body])).toEqual([
      ['first', 'appointment_handed_over', 'You were given an appointment Tue, Nov 10 at 7 PM.'],
      ['exec', 'appointment_to_book', 'An appointment Tue, Nov 10 at 7 PM was handed to the first counselor. Check that the time still works.'],
      ['bishop', 'appointment_changed', 'Your appointment Tue, Nov 10 at 7 PM was handed to the first counselor.'],
    ])
  })

  it('tells the secretary when away dates cover booked appointments', () => {
    const appointments = [
      appt({ id: 'x', scheduled_at: iso('2026-11-10', '19:00') }),
      appt({ id: 'y', scheduled_at: iso('2026-11-12', '19:00') }),
      appt({ id: 'z', scheduled_at: iso('2026-11-20', '19:00') }),
    ]
    const absences = [{ id: 'away1', user_id: 'bishop', starts_on: '2026-11-10', ends_on: '2026-11-12' }]
    const [n] = planNotices([row('away', { interview_id: null, absence_id: 'away1' })], ctx({ appointments, absences }))
    expect(n).toMatchObject({ to: 'exec', kind: 'away_conflict', message: { body: 'The bishop will be away Nov 10–12, when 2 appointments are booked.' } })
  })

  it('says nothing about away dates that cover nothing, or were removed', () => {
    const appointments = [appt({ scheduled_at: iso('2026-11-20', '19:00') })]
    const absences = [{ id: 'away1', user_id: 'bishop', starts_on: '2026-11-10', ends_on: '2026-11-12' }]
    expect(planNotices([row('away', { absence_id: 'away1' })], ctx({ appointments, absences }))).toEqual([])
    expect(planNotices([row('away', { absence_id: 'gone' })], ctx({ appointments }))).toEqual([])
  })

  it('ignores secretaries’ and others’ away dates', () => {
    const absences = [{ id: 'away1', user_id: 'exec', starts_on: '2026-11-10', ends_on: '2026-11-12' }]
    expect(planNotices([row('away', { leader_id: 'exec', absence_id: 'away1' })], ctx({ absences }))).toEqual([])
  })

  describe('short-handed Sundays', () => {
    const bishopric = [...people, { id: 'second', office: 'second_counselor' as const }]
    const away = (id: string, user_id: string, starts_on: string, ends_on = starts_on) => ({ id, user_id, starts_on, ends_on })
    const short = (notices: ReturnType<typeof planNotices>) => notices.filter((n) => n.kind === 'short_sunday')

    it('warns the rest of the bishopric when no one will be there', () => {
      // Sunday the 15th: the bishop's new dates join both counselors'.
      const absences = [away('b', 'bishop', '2026-11-13', '2026-11-16'), away('f', 'first', '2026-11-15'), away('s', 'second', '2026-11-14', '2026-11-15')]
      const notices = short(planNotices([row('away', { interview_id: null, absence_id: 'b' })], ctx({ people: bishopric, absences })))
      expect(notices.map((n) => n.to).sort()).toEqual(['asst', 'clerk', 'exec', 'first', 'second'])
      expect(notices[0].message).toMatchObject({
        title: 'No bishopric on Sunday',
        body: 'No one in the bishopric will be at church Sun, Nov 15. Someone will need to preside.',
        url: '/away',
      })
    })

    it('warns more mildly when only one will be there, naming them by office', () => {
      const absences = [away('f', 'first', '2026-11-15'), away('s', 'second', '2026-11-15')]
      const [n] = short(planNotices([row('away', { interview_id: null, leader_id: 'second', actor_id: 'second', absence_id: 's' })], ctx({ people: bishopric, absences })))
      expect(n.message).toMatchObject({ title: 'Short-handed Sunday', body: 'Only the bishop will be at church Sun, Nov 15.' })
    })

    it('says each Sunday once, titled by the worst', () => {
      const absences = [
        away('b', 'bishop', '2026-11-08', '2026-11-22'),
        away('f', 'first', '2026-11-08', '2026-11-22'),
        away('s', 'second', '2026-11-15'),
      ]
      const rows = [row('away', { interview_id: null, absence_id: 'b' }), row('away', { interview_id: null, leader_id: 'first', actor_id: 'first', absence_id: 'f' })]
      const mine = short(planNotices(rows, ctx({ people: bishopric, absences }))).filter((n) => n.to === 'exec')
      expect(mine).toHaveLength(1)
      expect(mine[0].message.title).toBe('No bishopric on Sundays')
      expect(mine[0].message.body.split('\n')).toEqual([
        'Only the second counselor will be at church Sun, Nov 8.',
        'No one in the bishopric will be at church Sun, Nov 15. Someone will need to preside.',
        'Only the second counselor will be at church Sun, Nov 22.',
      ])
    })

    it('says nothing when two are there, the Sunday has passed, or it isn’t a leader’s away dates', () => {
      expect(short(planNotices([row('away', { interview_id: null, absence_id: 'b' })], ctx({ people: bishopric, absences: [away('b', 'bishop', '2026-11-15')] })))).toEqual([])
      const past = [away('b', 'bishop', '2026-11-01'), away('f', 'first', '2026-11-01'), away('s', 'second', '2026-11-01')]
      expect(short(planNotices([row('away', { interview_id: null, absence_id: 'b' })], ctx({ people: bishopric, absences: past })))).toEqual([])
      const clerkAway = [away('c', 'clerk', '2026-11-15'), away('f', 'first', '2026-11-15'), away('s', 'second', '2026-11-15')]
      expect(short(planNotices([row('away', { interview_id: null, leader_id: 'clerk', actor_id: 'clerk', absence_id: 'c' })], ctx({ people: bishopric, absences: clerkAway })))).toEqual([])
    })
  })

  it('makes one notification per person and kind, counting past three', () => {
    const rows = [1, 2, 3, 4].map((i) => row('added', { interview_id: `a${i}` }))
    const appointments = [1, 2, 3, 4].map((i) => appt({ id: `a${i}` }))
    const notices = planNotices(rows, ctx({ appointments }))
    expect(notices).toHaveLength(1)
    // The same sentence four times is one line, not four.
    expect(notices[0].message).toMatchObject({ title: 'Appointment to book', body: 'The bishop has a new appointment to book.' })

    const leaders = planNotices(
      [row('added', { interview_id: 'a1' }), row('added', { interview_id: 'a2', leader_id: 'first', actor_id: 'first' })],
      ctx({ appointments: [appt({ id: 'a1' }), appt({ id: 'a2', interviewer_id: 'first' })] }),
    )
    expect(leaders[0].message).toMatchObject({ title: 'Appointments to book', body: 'The bishop has a new appointment to book.\nThe first counselor has a new appointment to book.' })
  })
})

describe('scheduled messages', () => {
  it('counts requests due', () => {
    expect(requestsDueMessage('2026-11-07', 1).body).toBe('1 request you were asked to do is due tomorrow.')
    expect(requestsDueMessage('2026-11-07', 2).title).toBe('Requests due tomorrow')
  })
  it('counts callings to record, never naming anyone', () => {
    expect(toRecordMessage('2026-11-08', 2, 1).body).toBe('Today: 2 callings sustained and 1 release. You can update the church’s records.')
    expect(toRecordMessage('2026-11-08', 0, 1).body).toBe('Today: 1 release. You can update the church’s records.')
  })
  it('keeps progress tags short enough to be push topics', () => {
    expect(progressMessage('00000000-0000-0000-0000-000000000000', 'finished').tag.length).toBeLessThanOrEqual(32)
  })
})
