import { afterAll, describe, expect, it } from 'vitest'
import { unsortedSuggestions } from '../../src/lib/agenda'
import { addCandidate, addNeed, loadAgenda, loadCallings, submitSuggestion, updateCandidate } from '../../src/lib/queries'
import { signIn } from './helpers'

const TAG = `it-${Date.now()}`

describe('callings confidentiality', () => {
  afterAll(async () => {
    const bishop = await signIn('bishop')
    await bishop.from('calling_candidates').delete().like('person_name', `${TAG}%`)
    await bishop.from('calling_needs').delete().like('calling_title', `${TAG}%`)
  })

  it('lets a suggester send a name the bishopric then sees', async () => {
    const suggester = await signIn('suggester')
    await submitSuggestion(suggester, { calling_title: 'Primary Teacher', person_name: `${TAG} Sister Vale`, notes: 'Great with kids' })

    // The suggester cannot read anything back, including their own suggestion.
    const theirs = await loadCallings(suggester)
    expect(theirs.needs).toEqual([])
    expect(theirs.candidates).toEqual([])

    const bishop = await signIn('first')
    const { candidates } = await loadCallings(bishop)
    const mine = unsortedSuggestions(candidates).filter((c) => c.person_name.startsWith(TAG))
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ calling_title: 'Primary Teacher', notes: 'Great with kids', status: 'suggested' })
  })

  it('hides every callings table, the agenda, and the prayer roll from a scheduler', async () => {
    const scheduler = await signIn('scheduler')
    const callings = await loadCallings(scheduler)
    expect(callings.needs).toEqual([])
    expect(callings.candidates).toEqual([])

    const agenda = await loadAgenda(scheduler, '2026-11-01')
    expect(agenda.agenda).toBeNull()
    expect(agenda.interviews).toEqual([])
    expect(agenda.agendaItems).toEqual([])
    expect(agenda.prayerRoll).toEqual([])
    // Meetings are not confidential, so the scheduler still gets those.
    expect(agenda.meetings.length).toBeGreaterThan(0)
  })

  it('carries an accepted name through to Sustainings Today on the agenda', async () => {
    const bishop = await signIn('bishop')
    await addNeed(bishop, { calling_title: `${TAG} Activities Committee` })
    const need = (await loadCallings(bishop)).needs.find((n) => n.calling_title === `${TAG} Activities Committee`)!
    await addCandidate(bishop, { need_id: need.id, person_name: `${TAG} Brother West`, status: 'discussing' })
    const candidate = (await loadCallings(bishop)).candidates.find((c) => c.person_name === `${TAG} Brother West`)!

    await updateCandidate(bishop, candidate.id, { status: 'accepted', sustain_on: '2030-06-02' })

    const { candidates } = await loadAgenda(bishop, '2030-06-02')
    const { sustainingsOn } = await import('../../src/lib/agenda')
    const { needs } = await loadCallings(bishop)
    expect(sustainingsOn('2030-06-02', needs, candidates)).toContainEqual({ name: `${TAG} Brother West`, calling: `${TAG} Activities Committee` })
  })
})
