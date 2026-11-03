import { describe, expect, it } from 'vitest'
import {
  callingsNeeded,
  interviewsOn,
  openItems,
  releasesOn,
  sacramentLine,
  sustainingsOn,
  unsortedSuggestions,
  upcomingMeetings,
  type AgendaItem,
  type CallingNeed,
  type Candidate,
  type Interview,
  type Meeting,
  type ProgramItem,
  type Profile,
} from './agenda'

const profiles: Profile[] = [
  { id: 'b', display_name: 'Bishop Avery', short_name: 'Bishop' },
  { id: 'o', display_name: 'Brother Ortiz', short_name: 'Ortiz' },
  { id: 'n', display_name: 'No Short Name', short_name: null },
]

const meeting = (date: string, extra: Partial<Meeting> = {}): Meeting => ({
  id: date,
  meeting_date: date,
  meeting_type: 'regular',
  title: null,
  conducting_id: 'o',
  ...extra,
})

describe('sacramentLine', () => {
  const items: ProgramItem[] = [
    { meeting_id: '2026-11-08', position: 2, kind: 'talk', person_name: 'Sister Diaz', note: null },
    { meeting_id: '2026-11-08', position: 1, kind: 'talk', person_name: 'Brother Cole', note: 'Stake' },
    { meeting_id: '2026-11-08', position: 3, kind: 'musical_number', person_name: 'Primary choir', note: null },
  ]

  it('lists speakers in program order with notes, skipping non-talk items', () => {
    expect(sacramentLine(meeting('2026-11-08'), items, profiles)).toBe('11/8 (Ortiz) - Brother Cole (Stake), Sister Diaz')
  })

  it('labels fast Sundays and conferences instead of speakers', () => {
    expect(sacramentLine(meeting('2026-11-01', { meeting_type: 'fast_sunday' }), items, profiles)).toBe('11/1 (Ortiz) - FAST SUNDAY')
    expect(sacramentLine(meeting('2027-03-07', { meeting_type: 'stake_conference', conducting_id: null }), [], profiles)).toBe(
      '3/7 - STAKE CONFERENCE',
    )
  })

  it('uses the program title for special programs', () => {
    expect(
      sacramentLine(meeting('2026-12-20', { meeting_type: 'special_program', title: 'Christmas Program', conducting_id: 'b' }), [], profiles),
    ).toBe('12/20 (Bishop) - Christmas Program')
  })

  it('calls out a Sunday with no speakers yet', () => {
    expect(sacramentLine(meeting('2026-11-29', { conducting_id: 'n' }), [], profiles)).toBe('11/29 (No Short Name) - Speakers needed')
  })
})

describe('upcomingMeetings', () => {
  it('returns meetings in the window, in date order', () => {
    const list = [meeting('2026-11-15'), meeting('2026-10-25'), meeting('2026-11-01'), meeting('2027-06-01')]
    expect(upcomingMeetings('2026-11-01', list).map((m) => m.meeting_date)).toEqual(['2026-11-01', '2026-11-15'])
  })
})

describe('openItems', () => {
  const discussion = { id: 'talk', kind: 'items' as const }
  const calendar = { id: 'cal', kind: 'calendar' as const }
  const items: AgendaItem[] = [
    { id: '1', section_id: 'talk', body: 'Old, resolved', event_date: null, resolved_on: '2026-10-25', created_at: '2026-10-01T00:00:00Z' },
    { id: '2', section_id: 'talk', body: 'Carried over', event_date: null, resolved_on: null, created_at: '2026-10-11T00:00:00Z' },
    { id: '3', section_id: 'talk', body: 'Added later', event_date: null, resolved_on: null, created_at: '2026-11-05T00:00:00Z' },
    { id: '4', section_id: 'talk', body: 'Resolved this week', event_date: null, resolved_on: '2026-11-01', created_at: '2026-10-18T00:00:00Z' },
    { id: '5', section_id: 'cal', body: 'Past event', event_date: '2026-10-30', resolved_on: null, created_at: '2026-10-01T00:00:00Z' },
    { id: '6', section_id: 'cal', body: 'Christmas party', event_date: '2026-12-04', resolved_on: null, created_at: '2026-10-01T00:00:00Z' },
    { id: '7', section_id: 'other', body: 'Another section', event_date: null, resolved_on: null, created_at: '2026-10-01T00:00:00Z' },
  ]

  it('carries unresolved items forward until resolved', () => {
    expect(openItems('2026-11-01', items, discussion).map((i) => i.body)).toEqual(['Carried over', 'Resolved this week'])
    expect(openItems('2026-11-08', items, discussion).map((i) => i.body)).toEqual(['Carried over', 'Added later'])
  })

  it('drops calendar items whose date has passed', () => {
    expect(openItems('2026-11-01', items, calendar).map((i) => i.body)).toEqual(['Christmas party'])
  })
})

describe('callings', () => {
  const needs: CallingNeed[] = [
    { id: 'n1', calling_title: 'Primary Teacher', release_name: 'Brother Ivey', release_on: null, status: 'open' },
    { id: 'n2', calling_title: 'RS Teacher', release_name: null, release_on: null, status: 'open' },
    { id: 'n3', calling_title: 'Sunday School', release_name: 'Sister Kemp', release_on: '2026-11-08', status: 'open' },
    { id: 'n4', calling_title: 'Filled already', release_name: null, release_on: null, status: 'filled' },
  ]
  const candidates: Candidate[] = [
    { id: 'c1', need_id: 'n1', calling_title: null, person_name: 'Declined person', status: 'declined', sustain_on: null },
    { id: 'c2', need_id: 'n1', calling_title: null, person_name: 'Under discussion', status: 'discussing', sustain_on: null },
    { id: 'c3', need_id: 'n2', calling_title: null, person_name: 'Sister Moss', status: 'accepted', sustain_on: '2026-11-01' },
    { id: 'c4', need_id: null, calling_title: 'Primary Teacher', person_name: 'From a leader', status: 'suggested', sustain_on: null },
  ]

  it('builds the Callings Needed table from open needs, hiding declined names', () => {
    const rows = callingsNeeded(needs, candidates)
    expect(rows.map((r) => r.need.calling_title)).toEqual(['Primary Teacher', 'RS Teacher', 'Sunday School'])
    expect(rows[0].candidates.map((c) => c.person_name)).toEqual(['Under discussion'])
    expect(rows[0].approved).toBe(false)
    expect(rows[1].approved).toBe(true)
  })

  it('lists leader submissions that are not yet attached to a need', () => {
    expect(unsortedSuggestions(candidates).map((c) => c.person_name)).toEqual(['From a leader'])
  })

  it('produces Releases Today and Sustainings Today', () => {
    expect(releasesOn('2026-11-08', needs).map((n) => n.release_name)).toEqual(['Sister Kemp'])
    expect(sustainingsOn('2026-11-01', needs, candidates)).toEqual([{ name: 'Sister Moss', calling: 'RS Teacher' }])
    expect(sustainingsOn('2026-11-08', needs, candidates)).toEqual([])
  })
})

describe('interviewsOn', () => {
  const interviews: Interview[] = [
    // 12:30 and 10:00 Mountain Standard Time on 2026-11-01 (UTC-7)
    { interviewer_id: 'k', scheduled_at: '2026-11-01T19:30:00Z', person_name: 'Sister Park', purpose: 'temple_recommend', status: 'scheduled' },
    { interviewer_id: 'k', scheduled_at: '2026-11-01T17:00:00Z', person_name: 'Brother Park', purpose: 'calling', status: 'scheduled' },
    { interviewer_id: 'r', scheduled_at: '2026-11-01T19:30:00Z', person_name: 'Cancelled', purpose: 'other', status: 'cancelled' },
    // 8:00pm Saturday local time, which is already Sunday in UTC
    { interviewer_id: 'k', scheduled_at: '2026-11-01T03:00:00Z', person_name: 'Saturday night', purpose: 'other', status: 'scheduled' },
  ]

  it('groups by interviewer in time order, in the ward time zone', () => {
    expect(interviewsOn('2026-11-01', interviews, 'America/Denver')).toEqual([
      {
        interviewerId: 'k',
        slots: [
          { time: '10:00 AM', label: 'Brother Park (calling)' },
          { time: '12:30 PM', label: 'Sister Park (temple recommend)' },
        ],
      },
    ])
  })
})
