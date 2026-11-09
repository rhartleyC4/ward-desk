import { describe, expect, it } from 'vitest'
import {
  agendaDate,
  calendarDate,
  cutoffDate,
  explainMatch,
  hymnNumber,
  latestAgendaTab,
  matchPerson,
  matchSection,
  nameReport,
  parseAgendaTab,
  parseMonthDay,
  parseSacrament,
  parseTravel,
  withYear,
  type Cell,
  type CellValue,
  type PersonRow,
  type Sheet,
} from './parse'

// Every name here is invented.

type In = CellValue | Cell | undefined

const GRAY = 'FFCCCCCC'
const YELLOW = 'FFFFFF00'

function sheet(name: string, rows: In[][], hidden = false): Sheet {
  const columnCount = Math.max(...rows.map((r) => r.length))
  return {
    name,
    hidden,
    rowCount: rows.length,
    columnCount,
    cell(row, col) {
      const v = rows[row - 1]?.[col - 1]
      if (v === undefined || v === null) return { value: null }
      if (typeof v === 'object' && !(v instanceof Date)) return v
      return { value: v }
    },
  }
}

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)
const h = (value: string, fill = YELLOW): Cell => ({ value, fill, bold: true })

describe('dates', () => {
  it('reads month and day the ways the sheet writes them', () => {
    expect(parseMonthDay('November 8th')).toEqual({ month: 11, day: 8 })
    expect(parseMonthDay('Dec. 4 - Ward party')).toEqual({ month: 12, day: 4 })
    expect(parseMonthDay('11/3 Tuesday - Youth activity')).toEqual({ month: 11, day: 3 })
    expect(parseMonthDay('Through Nov. 22 - drive')).toBeNull()
    expect(parseMonthDay('Primary Teacher')).toBeNull()
  })

  it('picks the year nearest the agenda date', () => {
    expect(withYear(1, 3, '2026-11-08')).toBe('2027-01-03')
    expect(withYear(11, 1, '2026-11-08')).toBe('2026-11-01')
    expect(withYear(2, 30, '2026-11-08')).toBeNull()
  })

  it('dates calendar lines from the agenda date', () => {
    expect(calendarDate('Dec. 4 - Ward Christmas party', '2026-11-08')).toBe('2026-12-04')
    expect(calendarDate('Through Nov. 22 - food drive', '2026-11-08')).toBeNull()
  })
})

describe('cutoffDate', () => {
  it('defaults to two months back', () => {
    expect(cutoffDate('2026-11-05', {})).toBe('2026-09-05')
    expect(cutoffDate('2026-05-31', { months: '3' })).toBe('2026-02-28')
    expect(cutoffDate('2026-11-05', { months: '0' })).toBe('2026-11-05')
  })

  it('takes an exact date, or no limit', () => {
    expect(cutoffDate('2026-11-05', { since: '2026-01-01', months: '6' })).toBe('2026-01-01')
    expect(cutoffDate('2026-11-05', { all: true, since: '2026-01-01' })).toBeNull()
  })

  it('rejects input it cannot read', () => {
    expect(() => cutoffDate('2026-11-05', { since: 'last fall' })).toThrow(/--since/)
    expect(() => cutoffDate('2026-11-05', { months: 'two' })).toThrow(/--months/)
  })
})

describe('hymnNumber', () => {
  it('takes the number from "41 - Title"', () => {
    expect(hymnNumber('41 - Let Zion in Her Beauty Rise')).toBe(41)
    expect(hymnNumber(193)).toBe(193)
    expect(hymnNumber(null)).toBeNull()
    expect(hymnNumber('Choir')).toBe('unreadable')
  })
})

const HEADER = ['Date', 'Presiding', 'Conducting', 'Opening Hymn', 'Invocation', 'Sacrament Hymn',
  'Speaker 1', 'Speaker 2', 'Speaker 3', 'Speaker 4', 'Speaker 5', 'Speaker 6', 'Closing Hymn', 'Benediction']

describe('parseSacrament', () => {
  it('reads a regular Sunday with hymns, prayers and speakers', () => {
    const { meetings, problems } = parseSacrament(sheet('Sacrament', [
      HEADER,
      [d('2026-11-15'), 'Bishop', 'Fenwick', '41 - Let Zion', 'Wren Calder', 193, 'Sister Lark (stake)', 'Milo Brandt', null, null, null, null, '86 - How Great Thou Art', 'Brother Pell'],
    ]))
    expect(problems).toEqual([])
    expect(meetings).toEqual([{
      row: 2, date: '2026-11-15', type: 'regular', title: null, presiding: 'Bishop', conducting: 'Fenwick',
      openingHymn: 41, sacramentHymn: 193, closingHymn: 86, invocation: 'Wren Calder', benediction: 'Brother Pell',
      program: [
        { kind: 'talk', personName: 'Sister Lark', note: 'stake' },
        { kind: 'talk', personName: 'Milo Brandt', note: null },
      ],
    }])
  })

  it('reads conference rows, fast Sundays and programs', () => {
    const { meetings, emptySundays } = parseSacrament(sheet('Sacrament', [
      HEADER,
      [d('2026-10-04'), { value: 'General Conference', fill: GRAY }],
      [d('2026-10-11'), 'Bishop', 'Fenwick', null, null, null, { value: 'Fast Sunday', fill: GRAY }],
      [d('2026-10-18'), 'Bishop', 'Fenwick', null, null, null, { value: 'Primary Program', fill: GRAY }],
      [d('2026-10-25'), { value: 'STAKE CONFERENCE', fill: GRAY }],
      [d('2026-11-01'), 'Bishop', 'Fenwick', null, null, null, 'Testimony Meeting'],
      [d('2026-11-08')],
      [d('2026-11-22'), 'Bishop', 'Fenwick', null, null, null, 'Milo Brandt', null, { value: 'Ward Conference', fill: 'FFFFF2CC' }],
    ]))
    expect(meetings.map((m) => [m.date, m.type, m.title, m.program.map((p) => p.kind)])).toEqual([
      ['2026-10-04', 'general_conference', null, []],
      ['2026-10-11', 'fast_sunday', null, ['testimonies']],
      ['2026-10-18', 'special_program', 'Primary Program', []],
      ['2026-10-25', 'stake_conference', null, []],
      ['2026-11-01', 'fast_sunday', null, ['testimonies']],
      ['2026-11-22', 'ward_conference', null, ['talk']],
    ])
    expect(emptySundays).toBe(1)
  })

  it('reports hymns it cannot read, by cell only', () => {
    const { problems } = parseSacrament(sheet('Sacrament', [
      HEADER,
      [d('2026-11-15'), 'Bishop', 'Fenwick', 'Choir number'],
    ]))
    expect(problems).toEqual([{ tab: 'Sacrament', cell: 'D2', reason: 'hymn without a number' }])
  })
})

describe('parseTravel', () => {
  it('turns runs of days into absences per person', () => {
    const { absences } = parseTravel(sheet('Travel', [
      [null, 'Event', 'Fenwick', 'Pell'],
      [d('2026-01-01'), 'New Year’s Day'],
      [d('2026-01-02'), null, 'Moab', 'X'],
      [d('2026-01-03'), null, 'Moab'],
      [d('2026-01-04'), { value: 'Sunday', fill: 'FFFFF2CC' }, 'Moab'],
      [d('2026-01-05'), null, 'St. George'],
      [d('2026-01-06')],
      [d('2026-01-07'), null, 'St. George'],
    ]))
    expect(absences).toEqual([
      { person: 'Fenwick', column: 'C', startsOn: '2026-01-02', endsOn: '2026-01-04', location: 'Moab' },
      { person: 'Fenwick', column: 'C', startsOn: '2026-01-05', endsOn: '2026-01-05', location: 'St. George' },
      { person: 'Fenwick', column: 'C', startsOn: '2026-01-07', endsOn: '2026-01-07', location: 'St. George' },
      { person: 'Pell', column: 'D', startsOn: '2026-01-02', endsOn: '2026-01-02', location: null },
    ])
  })
})

const BISHOPRIC_TAB = [
  [{ value: 'Ward Bishopric Meeting Agenda', bold: true }],
  [{ value: 'Date: November 8th - 8:30am', bold: true }],
  [],
  [{ value: 'Opening Prayer: Brother Pell', bold: true }],
  [{ value: 'Spiritual Thought and Handbook Review:', bold: true }],
  [],
  [h("Bishop Fenwick's Sunday & Week Schedule:")],
  ['11/3 Tuesday - youth activity'],
  [h('Callings & Temple Recommend Interviews')],
  ['10 a.m.', 'Wren Calder'],
  [h('Action/Discussion Items')],
  ['Fifth Sunday lesson - who teaches?'],
  ['Building cleaning', null, null, 'Pell'],
  [h('Upcoming Sacrament Meetings:')],
  ['11/15 (Bishop) - Milo Brandt'],
  [h('Calendar:')],
  ['Dec. 4 - Ward Christmas party'],
  ['Through Nov. 22 - food drive'],
  [h('Ward Ordinations & Advancements:', 'FF00FF00')],
  ['Interviews for deacons in December'],
  [h('Ward Missionary Opportunities:', 'FF00FF00')],
  [],
  [h('Callings Needed (to discuss):', 'FF00FF00')],
  [],
  [{ value: 'Calling', bold: true }, 'Release', 'Names to Consider', 'Appr?', 'Called?', 'Sust?', 'Notes'],
  [{ value: 'Primary Teacher', fill: 'theme' }, 'Jules Ambry', null, null, null, null, 'Ask Primary first'],
  ['Ward Missionaries', 'NA', 'Tamsin & Odo Fairweather', 'Y', 'Y'],
  [null, null, 'Hale Quist (other: two more)', 'N', null, null, 'Second choice'],
  [null, null, null, null, null, null, 'Waiting on stake'],
  ['Activity Days Leader'],
  ['Librarian', null, 'Bea Corran', 'Y', 'Y', 'Y'],
  ['Choir Director', null, 'Rufus Penn', 'Y'],
  [h('Releases Today (11/8)')],
  ['Jules Ambry as Primary Teacher'],
  [{ value: 'Closing Prayer: Brother Pell', bold: true }],
  [],
  [{ value: 'Prayer Roll Names:', bold: true }],
  ['Brandt family'],
  ['Sister Lark'],
]

describe('parseAgendaTab (bishopric)', () => {
  const { agenda, problems } = parseAgendaTab(sheet('November 8th', BISHOPRIC_TAB), 'bishopric', '2026-11-05')

  it('reads the date and the prayer fields', () => {
    expect(problems).toEqual([])
    expect(agenda).toMatchObject({ date: '2026-11-08', openingPrayer: 'Brother Pell', spiritualThought: null, closingPrayer: 'Brother Pell' })
  })

  it('keeps open items, skips what the app builds itself', () => {
    const summary = agenda!.sections.map((s) => [s.header, s.role, s.itemKind, s.items.length, s.skippedLines])
    expect(summary).toEqual([
      ["Bishop Fenwick's Sunday & Week Schedule", 'skip', 'discussion', 0, 1],
      ['Callings & Temple Recommend Interviews', 'skip', 'discussion', 0, 1],
      ['Action/Discussion Items', 'items', 'discussion', 2, 0],
      ['Upcoming Sacrament Meetings', 'skip', 'discussion', 0, 1],
      ['Calendar', 'items', 'calendar', 2, 0],
      ['Ward Ordinations & Advancements', 'items', 'ordination', 1, 0],
      ['Ward Missionary Opportunities', 'items', 'missionary', 0, 0],
      ['Callings Needed (to discuss)', 'callings', 'discussion', 0, 0],
      ['Releases Today (11/8)', 'skip', 'discussion', 0, 1],
      ['Prayer Roll Names', 'prayer_roll', 'discussion', 0, 0],
    ])
    const items = agenda!.sections.flatMap((s) => s.items)
    expect(items.find((i) => i.body.startsWith('Building'))?.body).toBe('Building cleaning — Pell')
    expect(items.filter((i) => i.kind === 'calendar').map((i) => i.eventDate)).toEqual(['2026-12-04', null])
  })

  it('reads the callings table, with names on following rows', () => {
    expect(agenda!.callings).toEqual([
      { row: 26, callingTitle: 'Primary Teacher', releaseName: 'Jules Ambry', notes: 'Ask Primary first', candidates: [] },
      {
        row: 27, callingTitle: 'Ward Missionaries', releaseName: null, notes: 'Waiting on stake',
        candidates: [
          { personName: 'Tamsin & Odo Fairweather', status: 'accepted', notes: null },
          { personName: 'Hale Quist', status: 'discussing', notes: 'other: two more\nSecond choice' },
        ],
      },
      { row: 30, callingTitle: 'Activity Days Leader', releaseName: null, notes: null, candidates: [] },
      { row: 31, callingTitle: 'Librarian', releaseName: null, notes: null, candidates: [{ personName: 'Bea Corran', status: 'sustained', notes: null }] },
      { row: 32, callingTitle: 'Choir Director', releaseName: null, notes: null, candidates: [{ personName: 'Rufus Penn', status: 'approved', notes: null }] },
    ])
  })

  it('reads the prayer roll', () => {
    expect(agenda!.prayerRoll).toEqual(['Brandt family', 'Sister Lark'])
  })
})

describe('parseAgendaTab (ward council)', () => {
  const tab = sheet('Nov 8th', [
    [{ value: 'Ward Council Meeting Agenda', bold: true }],
    [{ value: 'Date: November 8th, @9:15am', bold: true }],
    [],
    [{ value: 'Presiding/Conducting:', bold: true }],
    [{ value: 'Opening Prayer: President Wren Calder', bold: true }],
    [{ value: 'Spiritual Thought and Handbook Review: President Pell', bold: true }],
    [{ value: 'Prayer Roll Names:', bold: true }],
    ['Brandt family'],
    [h('General Business:', 'FF999999')],
    ['Prayer roll cleanup?'],
    [h('Elders Quorum:', 'FF999999')],
    ['Temple day - Tuesday'],
    [h('Activities Cmte:', 'FF999999')],
    ['Dec. 4 - Ward Christmas party'],
    [{ value: 'Closing Prayer: Sister Lark', bold: true }],
  ])
  const { agenda } = parseAgendaTab(tab, 'ward-council', '2026-11-05')

  it('reads sections by heading', () => {
    expect(agenda!.spiritualThought).toBe('President Pell')
    expect(agenda!.prayerRoll).toEqual(['Brandt family'])
    expect(agenda!.sections.map((s) => [s.header, s.items.map((i) => i.body)])).toEqual([
      ['Prayer Roll Names', []],
      ['General Business', ['Prayer roll cleanup?']],
      ['Elders Quorum', ['Temple day - Tuesday']],
      ['Activities Cmte', ['Dec. 4 - Ward Christmas party']],
    ])
  })

  it('matches headings to the app’s sections', () => {
    const sections = [
      { id: 'gb', title: 'General business', kind: 'items' },
      { id: 'eq', title: 'Elders Quorum', kind: 'items' },
      { id: 'act', title: 'Activities Committee', kind: 'items' },
      { id: 'ann', title: 'Reminders and announcements', kind: 'items' },
    ]
    expect(matchSection('General Business', 'discussion', sections)).toBe('gb')
    expect(matchSection('Activities Cmte', 'discussion', sections)).toBe('act')
    expect(matchSection('Notes and Announcements', 'discussion', sections)).toBe('ann')
    expect(matchSection('Something Else', 'discussion', sections)).toBeNull()
  })
})

describe('tabs and people', () => {
  it('finds the newest weekly tab and its date', () => {
    const tabs = [sheet('Sacrament', []), sheet('Travel', []), sheet('November 8th', BISHOPRIC_TAB), sheet('November 1st', [])]
    expect(latestAgendaTab(tabs)?.name).toBe('November 8th')
    expect(agendaDate(sheet('January 3rd', []), '2026-12-30')).toBe('2027-01-03')
  })

  it('matches a short label to exactly one person', () => {
    const people = [
      { id: 'b', short_name: 'Bishop', display_name: 'Bishop Fenwick', email: 'bishop@ward.test' },
      { id: 'p', short_name: 'Pell', display_name: 'Brother Pell', email: 'first@ward.test' },
      { id: 'q', short_name: null, display_name: 'Brother Quist', email: 'hale.quist@ward.test' },
    ]
    expect(matchPerson('Bishop', people)).toBe('b')
    expect(matchPerson('Fenwick', people)).toBe('b')
    expect(matchPerson('pell', people)).toBe('p')
    expect(matchPerson('Hale', people)).toBe('q')
    expect(matchPerson('Brother', people)).toBeNull()
    expect(matchPerson('Calder', people)).toBeNull()
  })
})

describe('explainMatch and nameReport', () => {
  const ada: PersonRow = { id: 'a', short_name: 'Fenwick', display_name: 'Ada Fenwick', email: 'ada.fenwick@ward.test' }
  const milo: PersonRow = { id: 'm', short_name: null, display_name: 'Milo Brandt', email: 'mbrandt@ward.test' }
  const wren: PersonRow = { id: 'w', short_name: null, display_name: 'Wren Calder', email: 'wren@ward.test' }
  const june: PersonRow = { id: 'j', short_name: null, display_name: 'June Calder', email: 'jc@ward.test' }
  const quill: PersonRow = { id: 'q', short_name: null, display_name: 'Tess Hale', email: 'quill@ward.test' }
  const people = [ada, milo, wren, june, quill]

  it('trusts a full name, a short name and a last name', () => {
    expect(explainMatch('Ada Fenwick', people)).toEqual({ person: ada, fits: [ada], doubts: [] })
    expect(explainMatch('Fenwick', people).doubts).toEqual([])
    expect(explainMatch('Bishop Brandt', people)).toEqual({ person: milo, fits: [milo], doubts: [] })
  })

  it('doubts a first name alone and a match only through the email address', () => {
    expect(explainMatch('Milo', people)).toMatchObject({ person: milo, doubts: ['one word that is not their last name'] })
    expect(explainMatch('Quill', people)).toMatchObject({ person: quill, doubts: ['matched using their email address, not their name'] })
  })

  it('explains why a label links to no one', () => {
    expect(explainMatch('Calder', people)).toMatchObject({ person: null, fits: [wren, june], doubts: ['fits 2 people, so it links to no one'] })
    expect(explainMatch('Sister', people)).toMatchObject({ person: null, doubts: ['only a title, so it links to no one'] })
    expect(explainMatch('Nobody Known', people)).toMatchObject({ person: null, fits: [], doubts: ['fits no one'] })
  })

  it('lists every mapping and only the doubtful ones as questionable', () => {
    const report = nameReport([
      { label: 'Fenwick', count: 12, match: explainMatch('Fenwick', people) },
      { label: 'Calder', count: 2, column: 'D', match: explainMatch('Calder', people) },
    ])
    expect(report).toEqual([
      'Names (these are real names, so do not share this part):',
      '  Conducting "Fenwick" (12 Sundays) → Ada Fenwick <ada.fenwick@ward.test>',
      '  Travel column D "Calder" (2 trips) → Wren Calder <wren@ward.test>, June Calder <jc@ward.test>',
      '',
      'Questionable (1):',
      '  Travel column D "Calder" → Wren Calder <wren@ward.test>, June Calder <jc@ward.test>: fits 2 people, so it links to no one',
    ])
  })

  it('questions two Travel columns reaching one account, but not a clean report', () => {
    const fenwick = explainMatch('Fenwick', people)
    expect(nameReport([{ label: 'Fenwick', count: 1, match: fenwick }]).at(-1)).toBe('Questionable: none')
    expect(nameReport([
      { label: 'Fenwick', count: 3, column: 'C', match: fenwick },
      { label: 'Ada Fenwick', count: 1, column: 'E', match: explainMatch('Ada Fenwick', people) },
    ]).at(-1)).toBe('  Travel columns C and E all link to Ada Fenwick <ada.fenwick@ward.test>')
  })
})
