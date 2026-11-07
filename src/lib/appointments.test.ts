import { describe, expect, it } from 'vitest'
import type { CallingNeed, Candidate } from './agenda'
import { appointmentFor, appointmentPurpose, defaultSecretaryFor, leadersScheduledBy, schedulersFrom, soleScheduler, splitAppointments, toInputs, toTimestamp, whenLabel, withDefaultSecretary, type Appointment } from './appointments'

const appt = (id: string, extra: Partial<Appointment> = {}): Appointment => ({
  id,
  interviewer_id: 'l',
  scheduled_at: null,
  person_name: `Person ${id}`,
  purpose: 'other',
  candidate_id: null,
  status: 'scheduled',
  created_at: '2026-10-01T00:00:00Z',
  ...extra,
})

const needs: CallingNeed[] = [{ id: 'n1', calling_title: 'Primary Teacher', release_name: null, release_on: null, release_only: false, status: 'open' }]
const candidates: Candidate[] = [
  { id: 'c1', need_id: 'n1', calling_title: null, person_name: 'Sister Nash', status: 'approved', sustain_on: null, set_apart_on: null },
  { id: 'c2', need_id: null, calling_title: 'Ward Missionary', person_name: 'Brother Vale', status: 'approved', sustain_on: null, set_apart_on: null },
]

describe('appointmentFor', () => {
  it('prefers the open calling appointment, then the latest one met', () => {
    const done = appt('a1', { candidate_id: 'c1', purpose: 'calling', status: 'completed', created_at: '2026-10-02T00:00:00Z' })
    const older = appt('a0', { candidate_id: 'c1', purpose: 'calling', status: 'completed' })
    const cancelled = appt('a2', { candidate_id: 'c1', purpose: 'calling', status: 'cancelled' })
    expect(appointmentFor('c1', [older, done, cancelled])?.id).toBe('a1')

    const open = appt('a3', { candidate_id: 'c1', purpose: 'calling' })
    expect(appointmentFor('c1', [done, open])?.id).toBe('a3')
    expect(appointmentFor('c2', [done, open])).toBeUndefined()
  })
})

describe('leadersScheduledBy', () => {
  it('lists the leaders a secretary schedules for', () => {
    const assignments = [
      { leader_id: 'b', secretary_id: 'exec' },
      { leader_id: 'l', secretary_id: 'asst' },
      { leader_id: 'o', secretary_id: 'asst' },
    ]
    expect(leadersScheduledBy('asst', assignments)).toEqual(['l', 'o'])
    expect(leadersScheduledBy('clerk', assignments)).toEqual([])
  })
})

describe('splitAppointments', () => {
  const list = [
    appt('later', { scheduled_at: '2026-11-08T18:00:00Z' }),
    appt('sooner', { scheduled_at: '2026-11-08T17:00:00Z', interviewer_id: 'b' }),
    appt('waiting2', { created_at: '2026-10-03T00:00:00Z' }),
    appt('waiting1', { created_at: '2026-10-02T00:00:00Z', interviewer_id: 'b' }),
    appt('met', { scheduled_at: '2026-11-01T17:00:00Z', status: 'completed' }),
  ]

  it('puts the ones without a time first, oldest first, then the booked ones soonest first', () => {
    const { toSchedule, scheduled } = splitAppointments(list)
    expect(toSchedule.map((a) => a.id)).toEqual(['waiting1', 'waiting2'])
    expect(scheduled.map((a) => a.id)).toEqual(['sooner', 'later'])
  })

  it('keeps only the given leaders when asked', () => {
    const { toSchedule, scheduled } = splitAppointments(list, ['l'])
    expect(toSchedule.map((a) => a.id)).toEqual(['waiting2'])
    expect(scheduled.map((a) => a.id)).toEqual(['later'])
  })
})

describe('appointmentPurpose', () => {
  it('names the calling for a calling appointment', () => {
    expect(appointmentPurpose(appt('a', { purpose: 'calling', candidate_id: 'c1' }), needs, candidates)).toBe('Extend call: Primary Teacher')
    expect(appointmentPurpose(appt('a', { purpose: 'calling', candidate_id: 'c2' }), needs, candidates)).toBe('Extend call: Ward Missionary')
  })

  it('falls back to the interview purpose', () => {
    expect(appointmentPurpose(appt('a', { purpose: 'temple_recommend' }), needs, candidates)).toBe('Temple recommend')
    expect(appointmentPurpose(appt('a', { purpose: 'calling' }), needs, candidates)).toBe('Calling')
    expect(appointmentPurpose(appt('a', { purpose: 'other' }), needs, candidates)).toBe('Other')
  })
})

describe('times', () => {
  it('formats in the ward time zone', () => {
    expect(whenLabel('2026-11-08T17:00:00Z', 'America/Denver')).toBe('Sun, Nov 8, 10:00 AM')
  })

  it('round-trips date and time inputs', () => {
    const iso = toTimestamp('2026-11-08', '10:30')
    expect(toInputs(iso)).toEqual({ date: '2026-11-08', time: '10:30' })
    expect(toInputs(null)).toEqual({ date: '', time: '' })
  })
})

describe('withDefaultSecretary', () => {
  const leaders = ['b', 'l', 'o']
  const exec = { id: 'exec', office: 'executive_secretary' as const }
  const asst = { id: 'asst', office: null }

  it('gives the only executive secretary every leader no one was picked for', () => {
    expect(leadersScheduledBy('exec', withDefaultSecretary([], leaders, [exec]))).toEqual(['b', 'l', 'o'])
    expect(leadersScheduledBy('exec', withDefaultSecretary([], leaders, [exec, asst]))).toEqual(['b', 'l', 'o'])
  })

  it('keeps the leaders someone was picked for', () => {
    const picked = [{ leader_id: 'o', secretary_id: 'asst' }]
    const all = withDefaultSecretary(picked, leaders, [exec, asst])
    expect(leadersScheduledBy('exec', all)).toEqual(['b', 'l'])
    expect(leadersScheduledBy('asst', all)).toEqual(['o'])
    expect(defaultSecretaryFor('o', picked, [exec, asst])).toBeUndefined()
    expect(defaultSecretaryFor('b', picked, [exec, asst])).toBe(exec)
  })

  it('picks no default when there are two executive secretaries, or none', () => {
    const second = { id: 'exec2', office: 'executive_secretary' as const }
    expect(withDefaultSecretary([], leaders, [exec, second])).toEqual([])
    expect(withDefaultSecretary([], leaders, [asst])).toEqual([])
  })
})

describe('soleScheduler', () => {
  const exec = { id: 'exec', office: 'executive_secretary' as const }
  const asst = { id: 'asst', office: null }
  it('is true when the only executive secretary does all the scheduling', () => {
    expect(soleScheduler([], [exec, asst])).toBe(true)
    expect(soleScheduler([{ leader_id: 'b', secretary_id: 'exec' }], [exec, asst])).toBe(true)
  })
  it('is false with an assistant to share the leaders, even before any are picked', () => {
    expect(soleScheduler([], [exec, { id: 'tate', office: 'assistant_executive_secretary' as const }])).toBe(false)
  })

  it('is false once someone else schedules for a leader, or with no single executive secretary', () => {
    expect(soleScheduler([{ leader_id: 'o', secretary_id: 'asst' }], [exec, asst])).toBe(false)
    expect(soleScheduler([], [asst])).toBe(false)
    expect(soleScheduler([], [exec, { id: 'exec2', office: 'executive_secretary' as const }])).toBe(false)
  })
})

describe('schedulersFrom', () => {
  it('offers the secretaries and anyone already picked, not the clerk', () => {
    const people = [
      { id: 'exec', office: 'executive_secretary' as const },
      { id: 'tate', office: 'assistant_executive_secretary' as const },
      { id: 'pike', office: 'ward_clerk' as const },
      { id: 'old', office: null },
    ]
    expect(schedulersFrom(people, []).map((p) => p.id)).toEqual(['exec', 'tate'])
    expect(schedulersFrom(people, [{ leader_id: 'b', secretary_id: 'old' }]).map((p) => p.id)).toEqual(['exec', 'tate', 'old'])
  })
})
