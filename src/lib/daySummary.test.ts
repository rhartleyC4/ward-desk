import { describe, expect, it } from 'vitest'
import { daySummary, pushMessage, type DaySummaryInput } from './daySummary'
import type { Booked } from './slots'

const TZ = 'America/Denver'
const BISHOP = 'bishop'
const LANE = 'lane'
const SECRETARY = 'secretary'
const SUNDAY = '2026-11-08' // 2nd Sunday

let n = 0
const booked = (interviewer_id: string, scheduled_at: string, duration_minutes = 10, status: Booked['status'] = 'scheduled'): Booked => ({
  id: `a${n++}`,
  interviewer_id,
  scheduled_at,
  duration_minutes,
  status,
})

const base = (over: Partial<DaySummaryInput> = {}): DaySummaryInput => ({
  date: SUNDAY,
  timeZone: TZ,
  person: { id: BISHOP, office: 'bishop' },
  events: [
    { title: 'Ward Council', weekday: 0, week_of_month: 2, start_time: '09:15:00' },
    { title: 'Bishopric meeting', weekday: 0, week_of_month: null, start_time: '08:30:00' },
    { title: 'Interviews', weekday: 4, week_of_month: null, start_time: null },
  ],
  meetings: [{ meeting_date: SUNDAY, meeting_type: 'regular', title: null, conducting_id: LANE }],
  appointments: [],
  assignments: [],
  needs: [],
  candidates: [],
  absences: [],
  ...over,
})

const texts = (input: DaySummaryInput) => daySummary(input).map((l) => l.text)

describe('daySummary', () => {
  it('lists the standing meetings for that day in time order', () => {
    expect(texts(base())).toEqual(['8:30 AM Bishopric meeting', '9:15 AM Ward Council'])
  })

  it('lists untimed events after the timed ones', () => {
    expect(texts(base({ date: '2026-11-05' }))).toEqual(['Interviews'])
  })

  it('is empty on a day with nothing on it', () => {
    expect(daySummary(base({ date: '2026-11-07' }))).toEqual([])
  })

  it('says when this person is conducting, with the releases and sustainings to read', () => {
    const input = base({
      person: { id: LANE, office: 'first_counselor' },
      needs: [{ id: 'n1', calling_title: 'Primary Teacher', release_name: 'Brother Ivey', release_on: SUNDAY, status: 'open' }],
      candidates: [
        { id: 'c1', need_id: 'n1', calling_title: null, person_name: 'Sister Nash', status: 'accepted', sustain_on: SUNDAY },
        { id: 'c2', need_id: null, calling_title: 'Clerk', person_name: 'Brother Bell', status: 'accepted', sustain_on: SUNDAY },
      ],
    })
    expect(texts(input)).toContain('Conducting sacrament meeting, with 1 release and 2 sustainings')
    expect(texts(input).join(' ')).not.toMatch(/Ivey|Nash|Bell|Primary/)
  })

  it('names a fast Sunday and a special program', () => {
    const conducting = { person: { id: LANE, office: 'first_counselor' as const } }
    expect(texts(base({ ...conducting, meetings: [{ meeting_date: SUNDAY, meeting_type: 'fast_sunday', title: null, conducting_id: LANE }] }))).toContain(
      'Conducting fast and testimony meeting',
    )
    expect(
      texts(base({ ...conducting, meetings: [{ meeting_date: SUNDAY, meeting_type: 'special_program', title: 'Christmas Program', conducting_id: LANE }] })),
    ).toContain('Conducting sacrament meeting (Christmas Program)')
  })

  it("leaves out conducting when someone else is", () => {
    expect(texts(base()).some((t) => t.startsWith('Conducting'))).toBe(false)
  })

  it('counts this leader’s appointments that day, first start to last end, in ward time', () => {
    const input = base({
      appointments: [
        booked(BISHOP, '2026-11-08T17:00:00Z'), // 10:00 MST
        booked(BISHOP, '2026-11-08T17:50:00Z', 25), // 10:50–11:15
        booked(BISHOP, '2026-11-08T17:20:00Z', 10, 'cancelled'),
        booked(LANE, '2026-11-08T17:00:00Z'),
        booked(BISHOP, '2026-11-09T17:00:00Z'), // Monday
        booked(BISHOP, '2026-11-09T06:30:00Z'), // 11:30 PM Sunday night in Denver
      ],
    })
    expect(texts(input)).toEqual(['8:30 AM Bishopric meeting', '9:15 AM Ward Council', '3 appointments, 10 AM–11:40 PM'])
  })

  it('places appointments among the meetings by start time', () => {
    const lines = texts(base({ appointments: [booked(BISHOP, '2026-11-08T16:00:00Z')] })) // 9:00
    expect(lines).toEqual(['8:30 AM Bishopric meeting', '1 appointment, 9–9:10 AM', '9:15 AM Ward Council'])
  })

  it('tells a secretary about the appointments booked for the leaders they schedule for', () => {
    const input = base({
      person: { id: SECRETARY, office: 'executive_secretary' },
      assignments: [{ leader_id: BISHOP, secretary_id: SECRETARY }],
      appointments: [booked(BISHOP, '2026-11-08T17:00:00Z'), booked(BISHOP, '2026-11-08T17:10:00Z'), booked(LANE, '2026-11-08T17:00:00Z')],
    })
    expect(texts(input)).toContain('2 appointments you scheduled, 10–10:20 AM')
  })

  it('flags a day this person is marked away, but only when something is on it', () => {
    const absences = [{ user_id: BISHOP, starts_on: '2026-11-06', ends_on: '2026-11-08', location: 'Denver' }]
    expect(texts(base({ absences }))[0]).toBe("You're marked away this day")
    expect(daySummary(base({ absences, date: '2026-11-07' }))).toEqual([])
  })
})

describe('pushMessage', () => {
  it('heads the lines with the day and tags it so a resend replaces it', () => {
    expect(pushMessage(SUNDAY, [{ text: 'a' }, { text: 'b' }])).toEqual({
      title: 'Tomorrow: Sunday, November 8th',
      body: 'a\nb',
      url: '/',
      tag: 'day-summary-2026-11-08',
    })
  })
})
