import { afterAll, describe, expect, it } from 'vitest'
import { interviewsOn, openItems, releasesOn, sacramentLine, sustainingsOn, upcomingMeetings } from '../../src/lib/agenda'
import { addAgendaItem, addInterview, addPrayerName, loadAgenda, removePrayerName, resolveAgendaItem, saveAgendaHeader } from '../../src/lib/queries'
import { eventsOn } from '../../src/lib/schedule'
import { signIn } from './helpers'

const TAG = `it-${Date.now()}`
const SEED_SUNDAY = '2026-11-01'

describe('weekly agenda from seed data', () => {
  it('assembles the 11/1 agenda the way the sheet tab read', async () => {
    const bishop = await signIn('bishop')
    const data = await loadAgenda(bishop, SEED_SUNDAY)

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
  })
})

describe('editing the agenda', () => {
  const DATE = '2030-06-02'

  afterAll(async () => {
    const bishop = await signIn('bishop')
    await bishop.from('agenda_items').delete().like('body', `${TAG}%`)
    await bishop.from('prayer_roll').delete().like('name', `${TAG}%`)
    await bishop.from('interviews').delete().like('person_name', `${TAG}%`)
    await bishop.from('agendas').delete().eq('meeting_date', DATE)
  })

  it('saves assignments and keeps items open until resolved', async () => {
    const bishop = await signIn('bishop')
    await saveAgendaHeader(bishop, DATE, { opening_prayer: 'Brother Lane', spiritual_thought: null, closing_prayer: null, notes: null })
    await addAgendaItem(bishop, { kind: 'discussion', body: `${TAG} Fifth Sunday plan` })

    let data = await loadAgenda(bishop, DATE)
    expect(data.agenda?.opening_prayer).toBe('Brother Lane')
    const item = openItems(DATE, data.agendaItems, 'discussion').find((i) => i.body === `${TAG} Fifth Sunday plan`)!
    expect(item).toBeDefined()

    await resolveAgendaItem(bishop, item.id, DATE)
    data = await loadAgenda(bishop, '2030-06-09')
    expect(openItems('2030-06-09', data.agendaItems, 'discussion').map((i) => i.id)).not.toContain(item.id)
  })

  it('records interviews and prayer roll names for the bishopric only', async () => {
    const second = await signIn('second')
    await addInterview(second, { interviewer_id: second.userId, scheduled_at: '2030-06-02T18:40:00Z', person_name: `${TAG} Sister Reed`, purpose: 'temple_recommend' })
    await addPrayerName(second, `${TAG} Example family`)

    const data = await loadAgenda(second, DATE)
    const slots = interviewsOn(DATE, data.interviews, 'America/Denver').flatMap((g) => g.slots)
    expect(slots).toContainEqual({ time: '12:40 PM', label: `${TAG} Sister Reed (temple recommend)` })
    const name = data.prayerRoll.find((p) => p.name === `${TAG} Example family`)!
    expect(name).toBeDefined()

    await removePrayerName(second, name.id, DATE)
    expect((await loadAgenda(second, DATE)).prayerRoll.map((p) => p.id)).not.toContain(name.id)

    const leader = await signIn('leader')
    await expect(addPrayerName(leader, `${TAG} Not allowed`)).rejects.toThrow(/row-level security/)
  })
})
