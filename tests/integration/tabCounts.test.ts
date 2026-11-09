import { afterAll, describe, expect, it } from 'vitest'
import { todayIso } from '../../src/lib/dates'
import { addAppointment, countWaiting, loadTabCounts, submitSuggestion, type TabCountsFor } from '../../src/lib/queries'
import { signIn } from './helpers'

const TAG = `it-tabs-${Date.now()}`

const bishopTabs = (userId: string): TabCountsFor => ({ userId, bishopric: true, home: 'leader', callings: true, sacrament: true, today: todayIso(), now: new Date() })

describe('tab counts', () => {
  afterAll(async () => {
    const bishop = await signIn('bishop')
    await bishop.from('interviews').delete().like('person_name', `${TAG}%`)
    await bishop.from('calling_candidates').delete().like('person_name', `${TAG}%`)
  })

  it('counts an appointment that is over on the leader Home', async () => {
    const bishop = await signIn('bishop')
    const before = await loadTabCounts(bishop, bishopTabs(bishop.userId))
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    await addAppointment(bishop, { interviewer_id: bishop.userId, person_name: `${TAG} Over`, purpose: 'ppi', scheduled_at: twoHoursAgo })
    const after = await loadTabCounts(bishop, bishopTabs(bishop.userId))
    expect(after['/home']).toBe((before['/home'] ?? 0) + 1)
    expect(after['/requests']).toBe(await countWaiting(bishop, bishop.userId, true, todayIso()))
    expect([0, 1]).toContain(after['/sacrament'])
  })

  it("counts a leader's suggestion on the bishopric's Meetings tab", async () => {
    const bishop = await signIn('bishop')
    const leader = await signIn('leader')
    const before = await loadTabCounts(bishop, bishopTabs(bishop.userId))
    await submitSuggestion(leader, { calling_title: 'Primary Teacher', person_name: `${TAG} Sister Vale` })
    const after = await loadTabCounts(bishop, bishopTabs(bishop.userId))
    expect(after['/agenda']).toBe((before['/agenda'] ?? 0) + 1)
  })

  it('counts a request for the secretary on their Home', async () => {
    const secretary = await signIn('secretary')
    const bishop = await signIn('bishop')
    const tabs: TabCountsFor = { userId: secretary.userId, bishopric: true, home: 'secretary', callings: false, sacrament: false, today: todayIso(), now: new Date() }
    const before = await loadTabCounts(secretary, tabs)
    // Which leaders this secretary books for depends on the seed, so ask for a time with each one.
    const leaders = (await secretary.from('profiles').select('id').in('office', ['bishop', 'first_counselor', 'second_counselor'])).data ?? []
    for (const l of leaders) await addAppointment(bishop, { interviewer_id: l.id, person_name: `${TAG} Needs a time`, purpose: 'ppi' })
    const after = await loadTabCounts(secretary, tabs)
    expect(after['/home']).toBeGreaterThan(before['/home'] ?? 0)
    expect(after).not.toHaveProperty('/agenda')
    expect(after).not.toHaveProperty('/sacrament')
  })

  it('gives a ward leader only the Requests count', async () => {
    const leader = await signIn('leader')
    const counts = await loadTabCounts(leader, { userId: leader.userId, bishopric: false, home: null, callings: false, sacrament: false, today: todayIso(), now: new Date() })
    expect(Object.keys(counts)).toEqual(['/requests'])
  })
})
