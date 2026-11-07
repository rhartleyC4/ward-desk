import { afterAll, describe, expect, it } from 'vitest'
import { assignmentChanges } from '../../src/lib/assignments'
import { answerAssignment, countWaiting, loadAgenda, loadAgendaTemplates, loadAssignees, loadMyAssignments, saveAssignments } from '../../src/lib/queries'
import { signIn } from './helpers'

// A Sunday far from the seed's, so nothing else touches it.
const DATE = '2031-06-08'

describe('meeting assignments', () => {
  afterAll(async () => {
    const bishop = await signIn('bishop')
    await bishop.from('agenda_assignments').delete().eq('meeting_date', DATE)
    await bishop.from('agendas').delete().eq('meeting_date', DATE)
  })

  it('goes from the agenda to the person asked and back', async () => {
    const bishop = await signIn('bishop')
    const rs = await signIn('rspres')
    const council = (await loadAgendaTemplates(bishop)).find((t) => t.slug === 'ward-council')!

    const people = await loadAssignees(bishop)
    expect(people.map((p) => p.id)).toEqual(expect.arrayContaining([bishop.userId, rs.userId]))

    const before = await countWaiting(rs, rs.userId, false, '2031-01-01')
    const asked = await saveAssignments(bishop, council.id, DATE, assignmentChanges([], { opening_prayer: rs.userId, closing_prayer: bishop.userId }))
    // The bishop took the closing prayer himself, so only the opening prayer waits on an answer.
    expect(asked).toHaveLength(1)
    expect(await countWaiting(rs, rs.userId, false, '2031-01-01')).toBe(before + 1)

    const [mine] = (await loadMyAssignments(rs)).filter((a) => a.meeting_date === DATE)
    expect(mine).toMatchObject({ id: asked[0], meeting_name: 'Ward Council', part: 'opening_prayer', status: 'asked', assigned_by: bishop.userId })

    await answerAssignment(rs, mine.id, 'declined', '  Out of town ')
    expect(await countWaiting(rs, rs.userId, false, '2031-01-01')).toBe(before)

    const data = await loadAgenda(bishop, council, DATE)
    expect(data.assignments.find((a) => a.part === 'opening_prayer')).toMatchObject({ status: 'declined', reply: 'Out of town' })
    expect(data.agenda).toMatchObject({ opening_prayer: null, closing_prayer: 'Bishop Avery' })

    // Handing it to someone else asks them fresh; the closing prayer is left alone.
    const eq = await signIn('eqpres')
    const again = await saveAssignments(bishop, council.id, DATE, assignmentChanges(data.assignments, { opening_prayer: eq.userId, closing_prayer: bishop.userId }))
    expect(again).toEqual([asked[0]])
    expect((await loadMyAssignments(rs)).filter((a) => a.meeting_date === DATE)).toEqual([])
    expect((await loadAgenda(bishop, council, DATE)).agenda?.opening_prayer).toBe('Brother Hollis')
  })

  it('lets the secretary record the answer for someone who doesn’t use the app', async () => {
    const bishop = await signIn('bishop')
    const secretary = await signIn('secretary')
    const leader = await signIn('leader')
    const bishopric = (await loadAgendaTemplates(bishop)).find((t) => t.slug === 'bishopric')!

    const [id] = await saveAssignments(bishop, bishopric.id, DATE, [{ part: 'spiritual_thought', to: leader.userId }])
    await answerAssignment(secretary, id, 'accepted')

    const row = (await loadAgenda(bishop, bishopric, DATE)).assignments.find((a) => a.id === id)
    expect(row).toMatchObject({ status: 'accepted', answered_by: secretary.userId })
    expect((await loadMyAssignments(leader)).find((a) => a.id === id)?.status).toBe('accepted')
  })

  it('gives a ward leader who attends no meeting nothing to pick from', async () => {
    const leader = await signIn('leader')
    expect(await loadAssignees(leader)).toEqual([])
  })
})
