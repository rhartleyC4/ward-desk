// Minimal rows for component tests. Invented names only.
import type { AgendaData, AgendaSection, AgendaTemplate, Meeting, ProgramItem, Profile } from '../lib/queries'

export const profiles: Profile[] = [
  { id: 'b', email: 'bishop@ward.test', display_name: 'Bishop Avery', short_name: 'Bishop' },
  { id: 'l', email: 'first@ward.test', display_name: 'Brother Lane', short_name: 'Lane' },
  { id: 'o', email: 'second@ward.test', display_name: 'Brother Ortiz', short_name: 'Ortiz' },
]

export function meeting(date: string, extra: Partial<Meeting> = {}): Meeting {
  return {
    id: `m-${date}`,
    meeting_date: date,
    meeting_type: 'regular',
    title: null,
    presiding: 'Bishop Avery',
    conducting_id: 'o',
    opening_hymn: 85,
    sacrament_hymn: 173,
    closing_hymn: 301,
    invocation: null,
    benediction: null,
    notes: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...extra,
  }
}

export function programItem(meetingId: string, position: number, extra: Partial<ProgramItem> = {}): ProgramItem {
  return {
    id: `${meetingId}-${position}`,
    meeting_id: meetingId,
    position,
    kind: 'talk',
    person_name: `Speaker ${position}`,
    topic: null,
    hymn_number: null,
    note: null,
    status: 'confirmed',
    created_at: '2026-10-01T00:00:00Z',
    ...extra,
  }
}

const ts = '2026-10-01T00:00:00Z'

function template(id: string, slug: string, name: string, weeks: number[] | null, sections: [AgendaSection['kind'], string][]): AgendaTemplate {
  return {
    id, slug, name, position: 0, weekday: 0, weeks_of_month: weeks, start_time: null, created_at: ts,
    sections: sections.map(([kind, title], i) => ({ id: `${id}-s${i + 1}`, template_id: id, position: i + 1, kind, title })),
  }
}

/** Mirrors the bishopric template seeded in the migrations. Section ids are `bishopric-s<position>`. */
export const bishopricTemplate = template('bishopric', 'bishopric', 'Bishopric Meeting', null, [
  ['items', 'Action / discussion items'],
  ['sacrament', 'Upcoming sacrament meetings'],
  ['calendar', 'Calendar'],
  ['items', 'Ward ordinations & advancements'],
  ['items', 'Ward missionary opportunities'],
  ['callings', 'Callings needed (to discuss)'],
  ['releases', 'Releases today'],
  ['sustainings', 'Sustainings today'],
  ['closing_prayer', 'Closing prayer'],
  ['prayer_roll', 'Prayer roll'],
])

export const wardCouncilTemplate = template('council', 'ward-council', 'Ward Council', [2, 4], [
  ['prayer_roll', 'Prayer roll'],
  ['items', 'General business'],
  ['assignments', 'Upcoming assignments'],
  ['items', 'Relief Society'],
  ['closing_prayer', 'Closing prayer'],
])

export function agendaData(overrides: Partial<AgendaData> = {}): AgendaData {
  const m1 = meeting('2026-11-01', { meeting_type: 'fast_sunday' })
  const m2 = meeting('2026-11-08')
  return {
    agenda: {
      id: 'a1', template_id: 'bishopric', meeting_date: '2026-11-01', start_time: '08:30:00', opening_prayer: 'Brother Ortiz',
      spiritual_thought: 'Handbook updates', closing_prayer: 'Brother Lane', notes: null, created_at: ts,
    },
    meetings: [m1, m2],
    items: [programItem(m2.id, 1, { person_name: 'Brother Cole', note: 'Stake' }), programItem(m2.id, 2, { person_name: 'Sister Diaz' })],
    absences: [{ id: 'ab1', user_id: 'l', starts_on: '2026-10-30', ends_on: '2026-11-02', location: 'Denver', created_at: ts }],
    needs: [
      { id: 'n1', calling_id: null, calling_title: 'Primary Teacher', release_name: 'Brother Ivey', release_on: null, status: 'open', notes: null, created_at: ts, updated_at: ts },
      { id: 'n2', calling_id: null, calling_title: 'RS Teacher', release_name: null, release_on: null, status: 'open', notes: null, created_at: ts, updated_at: ts },
      { id: 'n3', calling_id: null, calling_title: 'Sunday School', release_name: 'Sister Kemp', release_on: '2026-11-01', status: 'open', notes: null, created_at: ts, updated_at: ts },
    ],
    candidates: [
      { id: 'c1', need_id: 'n2', calling_title: null, person_name: 'Sister Moss', status: 'accepted', sustain_on: '2026-11-01', notes: null, suggested_by: 'b', created_at: ts, updated_at: ts },
      { id: 'c2', need_id: null, calling_title: 'Primary Teacher', person_name: 'Brother Vale', status: 'suggested', sustain_on: null, notes: null, suggested_by: null, created_at: ts, updated_at: ts },
      { id: 'c3', need_id: 'n1', calling_title: null, person_name: 'Sister Nash', status: 'approved', sustain_on: null, notes: null, suggested_by: 'b', created_at: ts, updated_at: ts },
    ],
    callingList: [
      { id: 'l1', title: 'Primary Teacher', organization: 'Primary' },
      { id: 'l2', title: 'Relief Society Teacher', organization: 'Relief Society' },
      { id: 'l3', title: 'RS Teacher', organization: null },
    ],
    appointments: [
      { id: 'ap1', interviewer_id: 'l', scheduled_at: '2026-11-08T17:00:00Z', person_name: 'Sister Nash', purpose: 'calling', candidate_id: 'c3', location: null, status: 'scheduled', notes: null, created_at: ts },
    ],
    agendaItems: [
      { id: 'd1', section_id: 'bishopric-s1', kind: 'discussion', body: 'Fifth Sunday topic', event_date: null, resolved_on: null, created_by: 'b', created_at: ts },
      { id: 'e1', section_id: 'bishopric-s3', kind: 'calendar', body: 'Ward Christmas party', event_date: '2026-12-04', resolved_on: null, created_by: 'b', created_at: ts },
      { id: 'rs1', section_id: 'council-s4', kind: 'discussion', body: 'Room for the combined lesson', event_date: null, resolved_on: null, created_by: 'b', created_at: ts },
    ],
    prayerRoll: [{ id: 'p1', name: 'Example family', added_on: '2026-10-01', removed_on: null }],
    events: [
      { id: 'r1', title: 'Bishopric meeting', weekday: 0, week_of_month: null, start_time: '08:30:00', notes: null, created_at: ts },
      { id: 'r2', title: 'Welfare', weekday: 0, week_of_month: 1, start_time: '09:15:00', notes: null, created_at: ts },
    ],
    rotations: [{ id: 'ro1', title: 'PPI: YW President', assignee_id: null, assignee_label: 'YW President', months: [3, 7, 11], notes: null, created_at: ts }],
    stewardships: [],
    profiles,
    bishopric: profiles,
    ...overrides,
  }
}
