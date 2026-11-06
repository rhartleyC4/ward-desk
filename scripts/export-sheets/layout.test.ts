import { describe, expect, it } from 'vitest'
import { parseAgendaTab, parseSacrament, parseTravel, type Sheet } from '../import-sheets/parse'
import { agendaDates, agendaTab, agendaTitle, buildWorkbooks, sacramentTab, scheduleTab, travelTab, type ExportData, type Tab } from './layout'

// Every name here is invented.

const today = '2026-11-04'
const range = { from: '2026-10-01', today }

/** A tab as the import's parser sees a sheet, so each test checks the export reads back. */
function asSheet(tab: Tab): Sheet {
  return {
    name: tab.name,
    hidden: false,
    rowCount: tab.rows.length,
    columnCount: Math.max(...tab.rows.map((r) => r.length)),
    cell: (row, col) => tab.rows[row - 1]?.[col - 1] ?? { value: null },
  }
}

const cellText = (tab: Tab) => tab.rows.map((r) => r.map((c) => (c.value instanceof Date ? c.value.toISOString().slice(0, 10) : (c.value ?? ''))).join('|').replace(/\|+$/, ''))

function data(): ExportData {
  return {
    profiles: [
      { id: 'c1', display_name: 'Brother Lane', short_name: 'Lane', office: 'first_counselor' },
      { id: 'es', display_name: 'Brother Ortiz', short_name: 'Ortiz', office: 'executive_secretary' },
      { id: 'b', display_name: 'Bishop Avery', short_name: 'Bishop', office: 'bishop' },
      { id: 'p', display_name: 'Sister Reyes', short_name: null, office: null },
    ],
    bishopricIds: ['b', 'c1', 'es'],
    meetings: [
      { id: 'm0', meeting_date: '2025-10-12', meeting_type: 'regular', title: null, presiding: 'Bishop', conducting_id: 'b', opening_hymn: null, sacrament_hymn: null, closing_hymn: null, invocation: null, benediction: null },
      { id: 'm1', meeting_date: '2026-10-04', meeting_type: 'general_conference', title: null, presiding: null, conducting_id: null, opening_hymn: null, sacrament_hymn: null, closing_hymn: null, invocation: null, benediction: null },
      { id: 'm2', meeting_date: '2026-10-11', meeting_type: 'regular', title: null, presiding: 'Bishop', conducting_id: 'c1', opening_hymn: 1, sacrament_hymn: 169, closing_hymn: 2, invocation: 'Sister Ames', benediction: 'Brother Cole' },
      { id: 'm3', meeting_date: '2026-11-01', meeting_type: 'fast_sunday', title: null, presiding: 'Bishop', conducting_id: 'b', opening_hymn: null, sacrament_hymn: null, closing_hymn: null, invocation: null, benediction: null },
      { id: 'm4', meeting_date: '2026-11-15', meeting_type: 'special_program', title: 'Primary Program', presiding: 'Bishop', conducting_id: 'es', opening_hymn: null, sacrament_hymn: null, closing_hymn: null, invocation: null, benediction: null },
    ],
    programItems: [
      { meeting_id: 'm2', position: 2, kind: 'talk', person_name: 'Brother Ellis', note: null },
      { meeting_id: 'm2', position: 1, kind: 'talk', person_name: 'Sister Diaz', note: 'youth' },
      { meeting_id: 'm2', position: 3, kind: 'musical_number', person_name: 'Sister Fry', note: null },
    ],
    absences: [
      { user_id: 'c1', starts_on: '2026-10-20', ends_on: '2026-10-22', location: 'St. George' },
      { user_id: 'es', starts_on: '2026-11-02', ends_on: '2026-11-02', location: null },
      { user_id: 'c1', starts_on: '2026-01-05', ends_on: '2026-01-06', location: 'Moab' },
    ],
    templates: [
      {
        id: 't-b', slug: 'bishopric', name: 'Bishopric Meeting', weekday: 0, weeks_of_month: null, start_time: '08:30:00',
        sections: [
          { id: 's-items', position: 1, kind: 'items', title: 'Action / discussion items' },
          { id: 's-int', position: 2, kind: 'interviews', title: 'Interviews' },
          { id: 's-sac', position: 3, kind: 'sacrament', title: 'Upcoming sacrament meetings' },
          { id: 's-cal', position: 4, kind: 'calendar', title: 'Calendar' },
          { id: 's-call', position: 5, kind: 'callings', title: 'Callings needed (to discuss)' },
          { id: 's-rel', position: 6, kind: 'releases', title: 'Releases today' },
          { id: 's-sus', position: 7, kind: 'sustainings', title: 'Sustainings today' },
          { id: 's-close', position: 8, kind: 'closing_prayer', title: 'Closing prayer' },
          { id: 's-roll', position: 9, kind: 'prayer_roll', title: 'Prayer roll' },
        ],
      },
      {
        id: 't-w', slug: 'ward-council', name: 'Ward Council', weekday: 0, weeks_of_month: [2, 4], start_time: '09:15:00',
        sections: [
          { id: 'w-roll', position: 1, kind: 'prayer_roll', title: 'Prayer roll' },
          { id: 'w-gen', position: 2, kind: 'items', title: 'General business' },
          { id: 'w-rot', position: 3, kind: 'assignments', title: 'Upcoming assignments' },
          { id: 'w-pri', position: 4, kind: 'items', title: 'Primary' },
          { id: 'w-close', position: 5, kind: 'closing_prayer', title: 'Closing prayer' },
        ],
      },
    ],
    agendas: [{ template_id: 't-b', meeting_date: '2026-11-08', start_time: null, opening_prayer: 'Brother Lane', spiritual_thought: null, closing_prayer: 'Bishop Avery' }],
    agendaItems: [
      { id: 'i1', section_id: 's-items', body: 'Plan the youth temple trip', event_date: null, resolved_on: null, created_at: '2026-10-20 15:00:00+00' },
      { id: 'i2', section_id: 's-items', body: 'Order new hymnbooks', event_date: null, resolved_on: '2026-10-12', created_at: '2026-10-01 15:00:00+00' },
      { id: 'i3', section_id: 's-cal', body: 'Ward Christmas party', event_date: '2026-12-04', resolved_on: null, created_at: '2026-10-01 15:00:00+00' },
      { id: 'i4', section_id: 's-cal', body: 'Dec. 12 - Choir practice', event_date: '2026-12-12', resolved_on: null, created_at: '2026-10-01 15:00:00+00' },
      { id: 'i5', section_id: 'w-pri', body: 'Nursery needs helpers', event_date: null, resolved_on: null, created_at: '2026-10-30 15:00:00+00' },
    ],
    needs: [
      { id: 'n1', calling_title: 'Primary Teacher', release_name: 'Sister Hale', release_on: null, status: 'open', notes: 'Sunbeams' },
      { id: 'n2', calling_title: 'Ward Librarian', release_name: 'Brother Pike', release_on: '2026-11-15', status: 'open', notes: null },
      { id: 'n3', calling_title: 'Choir Director', release_name: null, release_on: null, status: 'filled', notes: null },
    ],
    candidates: [
      { id: 'k1', need_id: 'n1', calling_title: null, person_name: 'Sister Nash', status: 'approved', sustain_on: null, notes: null },
      { id: 'k2', need_id: 'n1', calling_title: null, person_name: 'Sister Moss', status: 'discussing', sustain_on: null, notes: 'Ask in December' },
      { id: 'k3', need_id: 'n2', calling_title: null, person_name: 'Brother Vale', status: 'accepted', sustain_on: '2026-11-15', notes: null },
      { id: 'k4', need_id: 'n2', calling_title: null, person_name: 'Brother Hale', status: 'declined', sustain_on: null, notes: null },
    ],
    prayerRoll: [
      { name: 'Fern family', added_on: '2026-09-01', removed_on: null },
      { name: 'Gray family', added_on: '2026-10-15', removed_on: '2026-11-01' },
    ],
    rotations: [
      { title: 'PPIs', months: [11], assignee_id: 'b', assignee_label: null, weekday: null, week_of_month: null },
      { title: 'PPI: Relief Society President', months: [8, 1, 4], assignee_id: null, assignee_label: 'RS President', weekday: null, week_of_month: null },
      { title: 'Primary message', months: [1, 4, 7, 10], assignee_id: 'b', assignee_label: null, weekday: 0, week_of_month: 3 },
      { title: 'Primary message', months: [2, 5, 8, 11], assignee_id: 'c1', assignee_label: null, weekday: 0, week_of_month: 3 },
    ],
    recurringEvents: [
      { title: 'Welfare meeting', weekday: 0, week_of_month: 1, start_time: '09:15:00' },
      { title: 'Bishopric meeting', weekday: 0, week_of_month: null, start_time: '08:30:00' },
      { title: 'Ward Council', weekday: 0, week_of_month: 2, start_time: '09:15:00' },
      { title: 'Youth activities', weekday: 2, week_of_month: null, start_time: null },
    ],
    stewardships: [
      { user_id: 'c1', area: 'Sunday School', notes: null },
      { user_id: 'b', area: 'Relief Society', notes: null },
      { user_id: 'b', area: 'Young Women', notes: 'with the YW president' },
    ],
    requests: [],
  }
}

describe('Sacrament tab', () => {
  it('writes one row per Sunday that reads back as the same meetings', () => {
    const tab = sacramentTab(data(), range)
    const { meetings, emptySundays, problems } = parseSacrament(asSheet(tab))
    expect(problems).toEqual([])
    expect(meetings.map((m) => [m.date, m.type])).toEqual([
      ['2026-10-04', 'general_conference'],
      ['2026-10-11', 'regular'],
      ['2026-11-01', 'fast_sunday'],
      ['2026-11-15', 'special_program'],
    ])
    const regular = meetings[1]
    expect(regular).toMatchObject({ presiding: 'Bishop', conducting: 'Lane', openingHymn: 1, sacramentHymn: 169, closingHymn: 2, invocation: 'Sister Ames', benediction: 'Brother Cole' })
    expect(regular.program).toEqual([
      { kind: 'talk', personName: 'Sister Diaz', note: 'youth' },
      { kind: 'talk', personName: 'Brother Ellis', note: null },
    ])
    expect(meetings[3].title).toBe('Primary Program')
    // Oct 4 through nine weeks past today: 14 Sundays, 4 with meetings.
    expect(tab.rows.length - 1).toBe(14)
    expect(emptySundays).toBe(10)
  })

  it('spreads a conference across the row', () => {
    expect(sacramentTab(data(), range).merges).toEqual(['B2:N2'])
  })
})

describe('Travel tab', () => {
  it('writes a column per person that reads back as the same trips', () => {
    const tab = travelTab(data(), range)
    expect(tab.rows[0].map((c) => c.value)).toEqual(['Date', 'Event', 'Bishop', 'Lane', 'Ortiz'])
    expect(parseTravel(asSheet(tab)).absences).toEqual([
      { person: 'Lane', column: 'D', startsOn: '2026-10-20', endsOn: '2026-10-22', location: 'St. George' },
      { person: 'Ortiz', column: 'E', startsOn: '2026-11-02', endsOn: '2026-11-02', location: null },
    ])
    const sunday = tab.rows.find((r) => r[0].value instanceof Date && r[0].value.toISOString().startsWith('2026-10-04'))!
    expect(sunday[1]).toMatchObject({ value: 'Sunday', fill: 'FFFFF2CC' })
  })
})

describe('Bishopric Schedule tab', () => {
  it('lays out standing meetings, rotations and stewardships as the sheet did', () => {
    const tab = scheduleTab(data())
    expect(cellText(tab)).toEqual([
      'First Sunday - 8:30 Bishopric meeting, 9:15 Welfare meeting',
      'Second Sunday - 8:30 Bishopric meeting, 9:15 Ward Council',
      'Third Sunday - 8:30 Bishopric meeting',
      'Fourth Sunday - 8:30 Bishopric meeting',
      'Fifth Sunday - 8:30 Bishopric meeting',
      '',
      'PPIs',
      'Relief Society President - Jan, Apr, Aug',
      'PPIs - Nov',
      '',
      'Tuesday - Youth activities',
      '',
      'Primary message (3rd Sunday)|Bishop|January, April, July, October',
      '|Lane|February, May, August, November',
      '',
      'BISHOPRIC ASSIGNMENTS',
      '',
      'Bishop Avery:',
      '*Relief Society',
      '*Young Women (with the YW president)',
      '',
      'Brother Lane:',
      '*Sunday School',
      '',
    ])
    expect(tab.rows[15][0]).toMatchObject({ bold: true, fill: 'FFB7B7B7' })
  })
})

describe('meeting tabs', () => {
  it('lists the meetings in range, newest first, through the next one', () => {
    const [bishopric, council] = data().templates
    expect(agendaDates(bishopric, data(), range)).toEqual(['2026-11-08', '2026-11-01', '2026-10-25', '2026-10-18', '2026-10-11', '2026-10-04'])
    expect(agendaDates(council, data(), range)).toEqual(['2026-11-08', '2026-10-25', '2026-10-11'])
  })

  it('writes a bishopric agenda that reads back the same', () => {
    const tab = agendaTab(data().templates[0], '2026-11-08', data())
    expect(tab.name).toBe('November 8th')
    expect(cellText(tab).slice(0, 2)).toEqual(['Ward Bishopric Meeting Agenda', 'Date: November 8th - 8:30'])

    const { agenda, problems } = parseAgendaTab(asSheet(tab), 'bishopric', today)
    expect(problems).toEqual([])
    expect(agenda).toMatchObject({ date: '2026-11-08', openingPrayer: 'Brother Lane', closingPrayer: 'Bishop Avery', prayerRoll: ['Fern family'] })
    const items = agenda!.sections.filter((s) => s.role === 'items')
    expect(items.map((s) => [s.header, s.items.map((i) => [i.body, i.eventDate])])).toEqual([
      ['Action / discussion items', [['Plan the youth temple trip', null]]],
      ['Calendar', [['12/4 - Ward Christmas party', '2026-12-04'], ['Dec. 12 - Choir practice', '2026-12-12']]],
    ])
    expect(agenda!.callings).toEqual([
      expect.objectContaining({
        callingTitle: 'Primary Teacher', releaseName: 'Sister Hale', notes: 'Sunbeams',
        candidates: [
          { personName: 'Sister Nash', status: 'approved', notes: null },
          { personName: 'Sister Moss', status: 'discussing', notes: 'Ask in December' },
        ],
      }),
      expect.objectContaining({ callingTitle: 'Ward Librarian', candidates: [{ personName: 'Brother Vale', status: 'accepted', notes: null }] }),
    ])
  })

  it('shows each date as it stood then', () => {
    const oct11 = cellText(agendaTab(data().templates[0], '2026-10-11', data()))
    expect(oct11).toContain('Order new hymnbooks')
    expect(oct11).not.toContain('Gray family')
    const oct25 = cellText(agendaTab(data().templates[0], '2026-10-25', data()))
    expect(oct25).toContain('Gray family')
    expect(oct25).not.toContain('Order new hymnbooks')
  })

  it('moves an accepted name to Sustainings on their Sunday', () => {
    const lines = cellText(agendaTab(data().templates[0], '2026-11-15', data()))
    expect(lines).toContain('Releases today (11/15):')
    expect(lines).toContain('Brother Pike, Ward Librarian')
    expect(lines).toContain('Sustainings today (11/15):')
    expect(lines).toContain('Brother Vale, Ward Librarian')
    expect(lines.some((l) => l.startsWith('Ward Librarian|'))).toBe(false)
  })

  it('writes a ward council agenda with gray headings and no callings', () => {
    const tab = agendaTab(data().templates[1], '2026-11-08', data())
    const lines = cellText(tab)
    expect(lines[0]).toBe('Ward Council Meeting Agenda')
    expect(lines).toContain('PPIs — Bishop')
    expect(lines.join('\n')).not.toMatch(/Nash|Vale|Calling/)
    const heading = tab.rows.find((r) => r[0]?.value === 'Primary:')!
    expect(heading[0]).toMatchObject({ bold: true, fill: 'FF999999' })

    const { agenda } = parseAgendaTab(asSheet(tab), 'ward-council', today)
    expect(agenda!.prayerRoll).toEqual(['Fern family'])
    expect(agenda!.sections.find((s) => s.header === 'Primary')!.items.map((i) => i.body)).toEqual(['Nursery needs helpers'])
  })
})

describe('workbooks', () => {
  it('puts Sacrament, Bishopric Schedule and Travel first in the bishopric workbook', () => {
    const [bishopric, council] = buildWorkbooks(data(), range)
    expect(bishopric.title).toBe('Bishopric Agendas')
    expect(bishopric.tabs.slice(0, 4).map((t) => t.name)).toEqual(['Sacrament', 'Bishopric Schedule', 'Travel', 'November 8th'])
    expect(council.title).toBe('Ward Council Agenda')
    expect(council.tabs.map((t) => t.name)).toEqual(['November 8th', 'October 25th', 'October 11th'])
  })

  it('adds the year to tab names only when a longer export repeats a date', () => {
    const d = data()
    d.agendas.push({ template_id: 't-w', meeting_date: '2025-11-08', start_time: null, opening_prayer: null, spiritual_thought: null, closing_prayer: null })
    const council = buildWorkbooks(d, { from: null, today })[1]
    const names = council.tabs.map((t) => t.name)
    expect(names).toContain('November 8th 2026')
    expect(names).toContain('November 8th 2025')
    expect(names).toContain('October 25th')
    expect(new Set(names).size).toBe(names.length)
  })

  it('names meetings the way the sheets did', () => {
    expect(agendaTitle('Bishopric Meeting')).toBe('Ward Bishopric Meeting Agenda')
    expect(agendaTitle('Ward Council')).toBe('Ward Council Meeting Agenda')
    expect(agendaTitle('Youth Council')).toBe('Ward Youth Council Meeting Agenda')
  })
})
