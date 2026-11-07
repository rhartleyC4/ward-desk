import { describe, expect, it } from 'vitest'
import {
  awaitingSettingApart,
  callingDone,
  callingsNeeded,
  needsToDiscuss,
  moveId,
  slugFor,
  openItems,
  releasesOn,
  sacramentLine,
  sustainingsOn,
  unsortedSuggestions,
  upcomingMeetings,
  type AgendaItem,
  type CallingNeed,
  type Candidate,
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
    { id: 'n1', calling_title: 'Primary Teacher', release_name: 'Brother Ivey', release_on: null, release_only: false, status: 'open' },
    { id: 'n2', calling_title: 'RS Teacher', release_name: null, release_on: null, release_only: false, status: 'open' },
    { id: 'n3', calling_title: 'Sunday School', release_name: 'Sister Kemp', release_on: '2026-11-08', release_only: false, status: 'open' },
    { id: 'n4', calling_title: 'No longer needed', release_name: null, release_on: null, release_only: false, status: 'cancelled' },
  ]
  const candidates: Candidate[] = [
    { id: 'c1', need_id: 'n1', calling_title: null, person_name: 'Declined person', status: 'declined', sustain_on: null, set_apart_on: null },
    { id: 'c2', need_id: 'n1', calling_title: null, person_name: 'Under discussion', status: 'discussing', sustain_on: null, set_apart_on: null },
    { id: 'c3', need_id: 'n2', calling_title: null, person_name: 'Sister Moss', status: 'accepted', sustain_on: '2026-11-01', set_apart_on: null },
    { id: 'c4', need_id: null, calling_title: 'Primary Teacher', person_name: 'From a leader', status: 'suggested', sustain_on: null, set_apart_on: null },
  ]

  it('builds the Callings Needed table from open needs, hiding declined names', () => {
    const rows = callingsNeeded('2026-10-25', needs, candidates)
    expect(rows.map((r) => r.need.calling_title)).toEqual(['Primary Teacher', 'RS Teacher', 'Sunday School'])
    expect(rows[0].candidates.map((c) => c.person_name)).toEqual(['Under discussion'])
    expect(rows[0].approved).toBe(false)
    expect(rows[1].approved).toBe(true)
  })

  it('drops a calling from discussion on the Sunday its accepted name is sustained', () => {
    expect(needsToDiscuss('2026-10-25', needs, candidates).map((n) => n.id)).toEqual(['n1', 'n2', 'n3'])
    expect(needsToDiscuss('2026-11-01', needs, candidates).map((n) => n.id)).toEqual(['n1', 'n3'])
    // Accepted but no date yet: stays so someone sets one.
    const undated = candidates.map((c) => (c.id === 'c3' ? { ...c, sustain_on: null } : c))
    expect(needsToDiscuss('2026-11-08', needs, undated).map((n) => n.id)).toEqual(['n1', 'n2', 'n3'])
  })

  it('keeps a sustained name waiting to be set apart until it is', () => {
    expect(awaitingSettingApart('2026-10-25', needs, candidates)).toEqual([])
    expect(awaitingSettingApart('2026-11-01', needs, candidates).map((w) => [w.candidate.person_name, w.calling])).toEqual([['Sister Moss', 'RS Teacher']])

    const setApart = candidates.map((c) => (c.id === 'c3' ? { ...c, status: 'set_apart' as const, set_apart_on: '2026-11-04' } : c))
    // A past agenda still shows it waiting; from the day it happened the calling is done.
    expect(awaitingSettingApart('2026-11-03', needs, setApart).map((w) => w.candidate.id)).toEqual(['c3'])
    expect(awaitingSettingApart('2026-11-04', needs, setApart)).toEqual([])
    expect(callingDone('2026-11-03', needs[1], setApart)).toBe(false)
    expect(callingDone('2026-11-04', needs[1], setApart)).toBe(true)

    // Set apart before this was tracked: done whatever the day.
    const undated = setApart.map((c) => (c.id === 'c3' ? { ...c, set_apart_on: null } : c))
    expect(callingDone('2026-10-25', needs[1], undated)).toBe(true)
  })

  it('finishes a release with no one new on its release date', () => {
    const releaseOnly = needs.map((n) => (n.id === 'n3' ? { ...n, release_only: true } : n))
    expect(needsToDiscuss('2026-11-01', releaseOnly, candidates).map((n) => n.id)).toContain('n3')
    expect(needsToDiscuss('2026-11-08', releaseOnly, candidates).map((n) => n.id)).not.toContain('n3')
    // A calling with a release and someone new waits for them instead.
    expect(needsToDiscuss('2026-11-08', needs, candidates).map((n) => n.id)).toContain('n3')
  })

  it('lists leader submissions that are not yet attached to a need', () => {
    expect(unsortedSuggestions(candidates).map((c) => c.person_name)).toEqual(['From a leader'])
  })

  it('produces Releases Today and Sustainings Today', () => {
    expect(releasesOn('2026-11-08', needs).map((n) => n.release_name)).toEqual(['Sister Kemp'])
    expect(sustainingsOn('2026-11-01', needs, candidates)).toEqual([{ id: 'c3', name: 'Sister Moss', calling: 'RS Teacher' }])
    expect(sustainingsOn('2026-11-08', needs, candidates)).toEqual([])
  })
})

describe('slugFor', () => {
  it('makes a URL-safe slug that is not already taken', () => {
    expect(slugFor('Youth Council', [])).toBe('youth-council')
    expect(slugFor('  PEC / Welfare!  ', [])).toBe('pec-welfare')
    expect(slugFor('Ward Council', ['ward-council'])).toBe('ward-council-2')
    expect(slugFor('***', [])).toBe('meeting')
  })
})

describe('moveId', () => {
  it('swaps with the neighbor and ignores moves past either end', () => {
    expect(moveId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(moveId(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
    expect(moveId(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
    expect(moveId(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c'])
  })
})
