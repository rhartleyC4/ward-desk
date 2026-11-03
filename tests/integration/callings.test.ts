import { afterAll, describe, expect, it } from 'vitest'
import { unsortedSuggestions } from '../../src/lib/agenda'
import {
  addCandidate,
  addNeed,
  addToCallingList,
  loadAgenda,
  loadAgendaTemplates,
  loadCallingList,
  loadCallings,
  removeFromCallingList,
  submitSuggestion,
  updateCandidate,
  updateCallingListEntry,
  updateNeed,
} from '../../src/lib/queries'
import { signIn } from './helpers'

const TAG = `it-${Date.now()}`

describe('callings confidentiality', () => {
  afterAll(async () => {
    const bishop = await signIn('bishop')
    await bishop.from('calling_candidates').delete().like('person_name', `${TAG}%`)
    await bishop.from('calling_needs').delete().like('calling_title', `${TAG}%`)
    await bishop.from('callings').delete().like('title', `${TAG}%`)
  })

  it('lets a called leader send a name the bishopric then sees', async () => {
    const leader = await signIn('leader')
    await submitSuggestion(leader, { calling_title: 'Primary Teacher', person_name: `${TAG} Sister Vale`, notes: 'Great with kids' })

    // The leader cannot read anything back, including their own suggestion.
    const theirs = await loadCallings(leader)
    expect(theirs.needs).toEqual([])
    expect(theirs.candidates).toEqual([])

    const bishop = await signIn('first')
    const { candidates } = await loadCallings(bishop)
    const mine = unsortedSuggestions(candidates).filter((c) => c.person_name.startsWith(TAG))
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ calling_title: 'Primary Teacher', notes: 'Great with kids', status: 'suggested' })
  })

  it('hides every callings table, the agenda, and the prayer roll from a called leader', async () => {
    const leader = await signIn('leader')
    const callings = await loadCallings(leader)
    expect(callings.needs).toEqual([])
    expect(callings.candidates).toEqual([])

    expect(await loadAgendaTemplates(leader)).toEqual([])
    const [bishopric] = await loadAgendaTemplates(await signIn('bishop'))
    const agenda = await loadAgenda(leader, bishopric, '2026-11-01')
    expect(agenda.agenda).toBeNull()
    expect(agenda.appointments).toEqual([])
    expect(agenda.agendaItems).toEqual([])
    expect(agenda.prayerRoll).toEqual([])
    // Meetings are not confidential, so the leader still gets those.
    expect(agenda.meetings.length).toBeGreaterThan(0)
  })

  it('carries an accepted name through to Sustainings Today on the agenda', async () => {
    const bishop = await signIn('bishop')
    await addNeed(bishop, { calling_title: `${TAG} Activities Committee` })
    const need = (await loadCallings(bishop)).needs.find((n) => n.calling_title === `${TAG} Activities Committee`)!
    await addCandidate(bishop, { need_id: need.id, person_name: `${TAG} Brother West`, status: 'discussing' })
    const candidate = (await loadCallings(bishop)).candidates.find((c) => c.person_name === `${TAG} Brother West`)!

    await updateCandidate(bishop, candidate.id, { status: 'accepted', sustain_on: '2030-06-02' })

    const [bishopric] = await loadAgendaTemplates(bishop)
    const { candidates } = await loadAgenda(bishop, bishopric, '2030-06-02')
    const { sustainingsOn } = await import('../../src/lib/agenda')
    const { needs } = await loadCallings(bishop)
    expect(sustainingsOn('2030-06-02', needs, candidates)).toContainEqual({ id: candidate.id, name: `${TAG} Brother West`, calling: `${TAG} Activities Committee` })
  })
})

describe('calling list', () => {
  afterAll(async () => {
    const bishop = await signIn('bishop')
    await bishop.from('calling_needs').delete().like('calling_title', `${TAG}%`)
    await bishop.from('callings').delete().like('title', `${TAG}%`)
  })

  it('lets a called leader read the list for the Suggest page but not change it', async () => {
    const leader = await signIn('leader')
    const list = await loadCallingList(leader)
    expect(list.map((c) => c.title)).toContain('Primary President')
    await expect(addToCallingList(leader, { title: `${TAG} Leader Pick`, organization: null })).rejects.toThrow()
  })

  it('adds a new title to the list when the bishopric uses it, ready for an admin to tidy', async () => {
    const first = await signIn('first')
    await addNeed(first, { calling_title: `${TAG} Ward Greter` })
    const added = (await loadCallingList(first)).find((c) => c.title === `${TAG} Ward Greter`)
    expect(added).toMatchObject({ organization: null })

    // The bishop is the admin: fix the typo and file it under an organization.
    const bishop = await signIn('bishop')
    await updateCallingListEntry(bishop, added!.id, { title: `${TAG}  Ward Greeter `, organization: 'Other' })
    const need = (await loadCallings(first)).needs.find((n) => n.calling_id === added!.id)!
    expect(need.calling_title).toBe(`${TAG} Ward Greeter`)

    // Once filled, a later rename leaves it alone.
    await updateNeed(first, need.id, { status: 'filled' })
    await updateCallingListEntry(bishop, added!.id, { title: `${TAG} Greeter` })
    expect((await loadCallings(first)).needs.find((n) => n.id === need.id)!.calling_title).toBe(`${TAG} Ward Greeter`)
  })

  it('lets an admin add and remove entries, refusing a duplicate title', async () => {
    const bishop = await signIn('bishop')
    await addToCallingList(bishop, { title: `${TAG} Choir Librarian`, organization: 'Music' })
    await expect(addToCallingList(bishop, { title: `${TAG} choir librarian`, organization: null })).rejects.toThrow(/duplicate key/)
    const entry = (await loadCallingList(bishop)).find((c) => c.title === `${TAG} Choir Librarian`)!
    await removeFromCallingList(bishop, entry.id)
    expect((await loadCallingList(bishop)).some((c) => c.id === entry.id)).toBe(false)
  })
})
