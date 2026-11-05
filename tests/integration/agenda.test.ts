import { afterAll, describe, expect, it } from 'vitest'
import { openItems, releasesOn, sacramentLine, sustainingsOn, upcomingMeetings } from '../../src/lib/agenda'
import {
  addAgendaItem,
  addPrayerName,
  loadAgenda,
  loadAgendaTemplates,
  loadOpenAgendaItems,
  loadSundays,
  removePrayerName,
  resolveAgendaItem,
  saveAgendaHeader,
  type AgendaTemplate,
} from '../../src/lib/queries'
import { eventsOn } from '../../src/lib/schedule'
import { signIn } from './helpers'

const TAG = `it-${Date.now()}`
const SEED_SUNDAY = '2026-11-01'

const sectionOf = (template: AgendaTemplate, title: string) => template.sections.find((s) => s.title === title)!

describe('weekly agenda from seed data', () => {
  it('assembles the 11/1 agenda the way the sheet tab read', async () => {
    const bishop = await signIn('bishop')
    const [bishopric] = await loadAgendaTemplates(bishop)
    expect(bishopric.slug).toBe('bishopric')
    const data = await loadAgenda(bishop, bishopric, SEED_SUNDAY)

    expect(data.agenda).toMatchObject({ opening_prayer: 'Brother Ortiz', closing_prayer: 'Brother Lane' })
    expect(eventsOn(SEED_SUNDAY, data.events).map((e) => e.title)).toEqual(['Bishopric meeting', 'Welfare meeting (RS, EQ)'])

    const lines = upcomingMeetings(SEED_SUNDAY, data.meetings).map((m) => sacramentLine(m, data.items, data.profiles))
    expect(lines.slice(0, 3)).toEqual([
      '11/1 (Ortiz) - FAST SUNDAY',
      '11/8 (Ortiz) - Brother Cole (Stake), Sister Diaz',
      '11/15 (Bishop) - Brother Ellis, Sister Fry',
    ])

    expect(bishopric.sections.map((s) => s.kind)).not.toContain('interviews')

    expect(sustainingsOn(SEED_SUNDAY, data.needs, data.candidates)).toContainEqual(expect.objectContaining({ name: 'Sister Moss', calling: 'Relief Society Teacher' }))
    expect(releasesOn('2026-11-08', data.needs).map((n) => n.release_name)).toEqual(['Sister Kemp'])
    expect(data.bishopric).toHaveLength(3)
    // Ward council items stay on the ward council agenda.
    expect(data.agendaItems.map((i) => i.body)).not.toContain('Summer camp planning')
  })
})

afterAll(async () => {
  const bishop = await signIn('bishop')
  await bishop.from('agenda_items').delete().like('body', `${TAG}%`)
  await bishop.from('prayer_roll').delete().like('name', `${TAG}%`)
  await bishop.from('agendas').delete().in('meeting_date', ['2030-06-02', '2030-06-09'])
})

describe('editing the agenda', () => {
  const DATE = '2030-06-02'

  it('saves assignments and keeps items open until resolved', async () => {
    const bishop = await signIn('bishop')
    const [bishopric] = await loadAgendaTemplates(bishop)
    const discussion = sectionOf(bishopric, 'Action / discussion items')
    await saveAgendaHeader(bishop, bishopric.id, DATE, { opening_prayer: 'Brother Lane', spiritual_thought: null, closing_prayer: null, notes: null })
    await addAgendaItem(bishop, discussion, `${TAG} Fifth Sunday plan`)

    let data = await loadAgenda(bishop, bishopric, DATE)
    expect(data.agenda?.opening_prayer).toBe('Brother Lane')
    const item = openItems(DATE, data.agendaItems, discussion).find((i) => i.body === `${TAG} Fifth Sunday plan`)!
    expect(item).toBeDefined()

    await resolveAgendaItem(bishop, item.id, DATE)
    data = await loadAgenda(bishop, bishopric, '2030-06-09')
    expect(openItems('2030-06-09', data.agendaItems, discussion).map((i) => i.id)).not.toContain(item.id)
  })

  it('records prayer roll names for the bishopric only', async () => {
    const second = await signIn('second')
    const [bishopric] = await loadAgendaTemplates(second)
    await addPrayerName(second, `${TAG} Example family`)

    const data = await loadAgenda(second, bishopric, DATE)
    const name = data.prayerRoll.find((p) => p.name === `${TAG} Example family`)!
    expect(name).toBeDefined()

    await removePrayerName(second, name.id, DATE)
    expect((await loadAgenda(second, bishopric, DATE)).prayerRoll.map((p) => p.id)).not.toContain(name.id)

    const leader = await signIn('leader')
    await expect(addPrayerName(leader, `${TAG} Not allowed`)).rejects.toThrow(/row-level security/)
  })
})

describe('ward council agenda', () => {
  const DATE = '2030-06-09'

  it('lets an attendee run their meeting without seeing the bishopric agenda', async () => {
    const rs = await signIn('rspres')
    const templates = await loadAgendaTemplates(rs)
    expect(templates.map((t) => t.slug)).toEqual(['ward-council'])
    const [council] = templates
    expect(council.sections.map((s) => s.title).slice(0, 4)).toEqual(['Prayer roll', 'General business', 'Upcoming assignments', 'Elders Quorum'])

    const reliefSociety = sectionOf(council, 'Relief Society')
    await saveAgendaHeader(rs, council.id, DATE, { opening_prayer: 'Sister Young', spiritual_thought: null, closing_prayer: null, notes: null })
    await addAgendaItem(rs, reliefSociety, `${TAG} Teacher council room`)
    await addPrayerName(rs, `${TAG} Council family`)

    const data = await loadAgenda(rs, council, DATE)
    expect(data.agenda?.opening_prayer).toBe('Sister Young')
    expect(openItems(DATE, data.agendaItems, reliefSociety).map((i) => i.body)).toContain(`${TAG} Teacher council room`)
    expect(data.prayerRoll.map((p) => p.name)).toContain(`${TAG} Council family`)
    expect(data.appointments).toEqual([])
    expect(data.needs).toEqual([])

    // The bishopric meeting can be held the same day with its own agenda.
    const bishop = await signIn('bishop')
    const [bishopric] = await loadAgendaTemplates(bishop)
    await saveAgendaHeader(bishop, bishopric.id, DATE, { opening_prayer: 'Brother Ortiz', spiritual_thought: null, closing_prayer: null, notes: null })
    expect((await loadAgenda(rs, council, DATE)).agenda?.opening_prayer).toBe('Sister Young')
    expect((await loadAgenda(bishop, bishopric, DATE)).agendaItems.map((i) => i.body)).not.toContain(`${TAG} Teacher council room`)

    await expect(addAgendaItem(rs, sectionOf(bishopric, 'Action / discussion items'), `${TAG} Not allowed`)).rejects.toThrow(/row-level security/)
  })
})

describe('the bishopric home', () => {
  it("counts each meeting's open items and reads who conducts, without programs", async () => {
    const bishop = await signIn('bishop')
    const templates = await loadAgendaTemplates(bishop)
    const [bishopric] = templates
    const discussion = sectionOf(bishopric, 'Action / discussion items')
    await addAgendaItem(bishop, discussion, `${TAG} Home count`)

    const open = await loadOpenAgendaItems(bishop, templates.flatMap((t) => t.sections.map((s) => s.id)))
    expect(open.map((i) => i.body)).toContain(`${TAG} Home count`)
    expect(open.every((i) => i.resolved_on === null)).toBe(true)
    const added = open.find((i) => i.body === `${TAG} Home count`)!
    await resolveAgendaItem(bishop, added.id, '2030-06-02')
    expect((await loadOpenAgendaItems(bishop, [discussion.id])).map((i) => i.body)).not.toContain(`${TAG} Home count`)

    const sundays = await loadSundays(bishop, '2026-11-01', '2026-11-08')
    expect(sundays.map((m) => m.meeting_date)).toEqual(['2026-11-01', '2026-11-08'])
    expect(Object.keys(sundays[0]).sort()).toEqual(['conducting_id', 'meeting_date', 'meeting_type', 'title'])
  })

  it("shows a ward council member only their meeting's items", async () => {
    const rs = await signIn('rspres')
    const bishop = await signIn('bishop')
    const all = (await loadAgendaTemplates(bishop)).flatMap((t) => t.sections.map((s) => s.id))
    const open = await loadOpenAgendaItems(rs, all)
    expect(open.map((i) => i.body)).not.toContain('Ward website / bulletin')
    expect(open.map((i) => i.body)).toContain('Summer camp planning')
  })
})
