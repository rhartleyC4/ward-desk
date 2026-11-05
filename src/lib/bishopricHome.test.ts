import { describe, expect, it } from 'vitest'
import { bishopricTemplate, wardCouncilTemplate } from '../test/fixtures'
import type { AgendaItem } from './agenda'
import { isEmptyDay, meetingChoices, openItemCount, planDays, schedulersFor, waitingForTime, writableSections, type HomeAppointment, type HomeTemplate } from './bishopricHome'

const TZ = 'America/Denver'
// Wednesday 2026-11-04. The bishopric meets every Sunday; ward council 2nd and 4th Sundays.
const TODAY = '2026-11-04'
const ts = '2026-11-01T12:00:00Z'

const appt = (id: string, extra: Partial<HomeAppointment> = {}): HomeAppointment => ({
  id, interviewer_id: 'b', scheduled_at: null, person_name: `Person ${id}`, purpose: 'other', duration_minutes: 10, is_youth: false, status: 'scheduled', created_at: ts, ...extra,
})
const item = (id: string, section_id: string, extra: Partial<AgendaItem> = {}): AgendaItem => ({ id, section_id, body: id, event_date: null, resolved_on: null, created_at: ts, ...extra })
const evening: HomeTemplate = { ...wardCouncilTemplate, id: 'youth', slug: 'youth', name: 'Youth Council', weekday: 3, weeks_of_month: null, start_time: '19:00:00' }

describe('planDays', () => {
  const plan = (extra: Partial<Parameters<typeof planDays>[0]> = {}) =>
    planDays({ userId: 'b', from: TODAY, days: 5, appointments: [], templates: [bishopricTemplate], agendaItems: [], sacrament: [], timeZone: TZ, ...extra })

  it("puts this leader's booked appointments on their ward date, earliest first", () => {
    const days = plan({
      appointments: [
        appt('late', { scheduled_at: '2026-11-05T02:00:00Z' }), // 7 PM Wednesday in Denver
        appt('early', { scheduled_at: '2026-11-04T15:30:00Z' }), // 8:30 AM Wednesday
        appt('other leader', { interviewer_id: 'l', scheduled_at: '2026-11-04T16:00:00Z' }),
        appt('done', { status: 'completed', scheduled_at: '2026-11-04T16:00:00Z' }),
        appt('unbooked'),
      ],
    })
    expect(days[0].appointments.map((a) => [a.id, a.time])).toEqual([
      ['early', '08:30'],
      ['late', '19:00'],
    ])
    expect(days.slice(1).every((d) => !d.appointments.length)).toBe(true)
  })

  it('lists the meetings on each day, earliest first, with their open items', () => {
    const days = plan({
      templates: [bishopricTemplate, evening],
      agendaItems: [item('open', 'bishopric-s1'), item('closed', 'bishopric-s1', { resolved_on: '2026-11-01' }), item('roll', 'bishopric-s10')],
    })
    expect(days[0].meetings.map((m) => m.template.name)).toEqual(['Youth Council'])
    const sunday = days.find((d) => d.date === '2026-11-08')!
    expect(sunday.meetings).toEqual([{ template: bishopricTemplate, openItems: 1 }])
    expect(days.filter(isEmptyDay).map((d) => d.date)).toEqual(['2026-11-05', '2026-11-06', '2026-11-07'])
  })

  it('says when this leader is conducting sacrament meeting', () => {
    const sacrament = [{ meeting_date: '2026-11-08', meeting_type: 'regular' as const, title: null, conducting_id: 'b' }]
    expect(plan({ sacrament }).find((d) => d.date === '2026-11-08')!.sacrament?.conducting).toBe(true)
    expect(plan({ sacrament, userId: 'l' }).find((d) => d.date === '2026-11-08')!.sacrament?.conducting).toBe(false)
  })
})

describe('waitingForTime', () => {
  it("returns this leader's open requests with no time, oldest first", () => {
    const list = waitingForTime('b', [
      appt('newer', { created_at: '2026-11-03T00:00:00Z' }),
      appt('older', { created_at: '2026-11-02T00:00:00Z' }),
      appt('booked', { scheduled_at: '2026-11-08T16:00:00Z' }),
      appt('someone else', { interviewer_id: 'l' }),
      appt('cancelled', { status: 'cancelled' }),
    ])
    expect(list.map((a) => a.id)).toEqual(['older', 'newer'])
  })
})

describe('meetingChoices', () => {
  it('offers the meetings with somewhere to write, soonest first, with the date the item shows', () => {
    const onlyRoll: HomeTemplate = { ...bishopricTemplate, id: 'roll', name: 'Roll only', sections: [{ id: 'r', kind: 'prayer_roll', title: 'Prayer roll', position: 1 }] }
    const choices = meetingChoices([bishopricTemplate, wardCouncilTemplate, evening, onlyRoll], TODAY)
    expect(choices.map((c) => [c.template.name, c.date])).toEqual([
      ['Youth Council', '2026-11-04'],
      ['Bishopric Meeting', '2026-11-08'],
      ['Ward Council', '2026-11-08'],
    ])
  })
})

describe('writableSections', () => {
  it('keeps only the item and calendar sections, in agenda order', () => {
    expect(writableSections(bishopricTemplate).map((s) => s.title)).toEqual(['Action / discussion items', 'Calendar', 'Ward ordinations & advancements', 'Ward missionary opportunities'])
  })

  it('counts open items across those sections only', () => {
    expect(openItemCount(bishopricTemplate, '2026-11-08', [item('a', 'bishopric-s1'), item('b', 'bishopric-s3', { event_date: '2026-11-20' }), item('past event', 'bishopric-s3', { event_date: '2026-11-01' })])).toBe(2)
  })
})

describe('schedulersFor', () => {
  const secretaries = [
    { id: 'exec', office: 'executive_secretary' as const, display_name: 'Brother Quinn' },
    { id: 'asst', office: 'assistant_executive_secretary' as const, display_name: 'Brother Tate' },
  ]

  it('names the secretary picked for the leader', () => {
    expect(schedulersFor('o', [{ leader_id: 'o', secretary_id: 'asst' }], secretaries).map((s) => s.id)).toEqual(['asst'])
  })

  it('falls back to the only executive secretary', () => {
    expect(schedulersFor('b', [], secretaries).map((s) => s.id)).toEqual(['exec'])
  })
})
