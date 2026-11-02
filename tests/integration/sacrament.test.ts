import { afterAll, describe, expect, it } from 'vitest'
import { deleteMeeting, loadBishopric, loadSacrament, saveMeeting } from '../../src/lib/queries'
import { signIn } from './helpers'

// A date far from the seed data so reruns don't collide with it.
const DATE = '2030-06-02'

describe('sacrament planning', () => {
  afterAll(async () => {
    const secretary = await signIn('secretary')
    const { meetings } = await loadSacrament(secretary, DATE, DATE)
    for (const m of meetings) await deleteMeeting(secretary, m.id)
  })

  it('lists the bishopric for the Conducting picker', async () => {
    const secretary = await signIn('secretary')
    const names = (await loadBishopric(secretary)).map((p) => p.display_name).sort()
    expect(names).toEqual(['Bishop Avery', 'Brother Lane', 'Brother Ortiz', 'Brother Pike', 'Brother Quinn'])
  })

  it('lets the executive secretary plan a Sunday and replace its program', async () => {
    const secretary = await signIn('secretary')
    const [lane] = (await loadBishopric(secretary)).filter((p) => p.short_name === 'Lane')

    await saveMeeting(secretary, { meeting_date: DATE, conducting_id: lane.id, opening_hymn: 2 }, [
      { kind: 'talk', person_name: 'Youth speaker', status: 'invited' },
      { kind: 'intermediate_hymn', hymn_number: 98 },
      { kind: 'talk', person_name: 'Concluding speaker', status: 'confirmed' },
    ])

    let { meetings, items } = await loadSacrament(secretary, DATE, DATE)
    expect(meetings).toHaveLength(1)
    expect(meetings[0]).toMatchObject({ conducting_id: lane.id, opening_hymn: 2, meeting_type: 'regular' })
    expect(items.map((i) => [i.position, i.kind, i.person_name ?? i.hymn_number])).toEqual([
      [1, 'talk', 'Youth speaker'],
      [2, 'intermediate_hymn', 98],
      [3, 'talk', 'Concluding speaker'],
    ])

    // Saving again updates the same Sunday rather than adding a second one.
    await saveMeeting(secretary, { meeting_date: DATE, conducting_id: lane.id, closing_hymn: 152 }, [{ kind: 'talk', person_name: 'Only speaker' }])
    ;({ meetings, items } = await loadSacrament(secretary, DATE, DATE))
    expect(meetings).toHaveLength(1)
    expect(meetings[0].closing_hymn).toBe(152)
    expect(items.map((i) => i.person_name)).toEqual(['Only speaker'])
  })

  it('lets the bishop read what the secretary planned', async () => {
    const bishop = await signIn('bishop')
    const { meetings } = await loadSacrament(bishop, DATE, DATE)
    expect(meetings).toHaveLength(1)
  })

  it('refuses meeting changes from a called leader', async () => {
    const leader = await signIn('leader')
    await expect(saveMeeting(leader, { meeting_date: '2030-06-09' }, [])).rejects.toThrow(/row-level security/)
  })
})
