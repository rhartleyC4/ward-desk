import { afterAll, describe, expect, it } from 'vitest'
import { interviewsOn, openItems, releasesOn, sacramentLine, sustainingsOn, upcomingMeetings } from '../../src/lib/agenda'
import {
  addAgendaItem,
  addInterview,
  addPrayerName,
  loadAgenda,
  loadAgendaTemplates,
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

    const lane = data.profiles.find((p) => p.short_name === 'Lane')!
    const laneSlots = interviewsOn(SEED_SUNDAY, data.interviews, 'America/Denver').find((g) => g.interviewerId === lane.id)
    expect(laneSlots?.slots).toEqual([
      { time: '10:00 AM', label: 'Brother Park (calling)' },
      { time: '12:30 PM', label: 'Sister Park (temple recommend)' },
    ])

    expect(sustainingsOn(SEED_SUNDAY, data.needs, data.candidates)).toContainEqual({ name: 'Sister Moss', calling: 'Relief Society Teacher' })
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
  await bishop.from('interviews').delete().like('person_name', `${TAG}%`)
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

  it('records interviews and prayer roll names for the bishopric only', async () => {
    const second = await signIn('second')
    const [bishopric] = await loadAgendaTemplates(second)
    await addInterview(second, { interviewer_id: second.userId, scheduled_at: '2030-06-02T18:40:00Z', person_name: `${TAG} Sister Reed`, purpose: 'temple_recommend' })
    await addPrayerName(second, `${TAG} Example family`)

    const data = await loadAgenda(second, bishopric, DATE)
    const slots = interviewsOn(DATE, data.interviews, 'America/Denver').flatMap((g) => g.slots)
    expect(slots).toContainEqual({ time: '12:40 PM', label: `${TAG} Sister Reed (temple recommend)` })
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
    expect(data.interviews).toEqual([])
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
