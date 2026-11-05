import { afterAll, describe, expect, it } from 'vitest'
import {
  answerRequest,
  countWaiting,
  deleteRequest,
  loadAgenda,
  loadAgendaTemplates,
  loadCallingRequests,
  loadCallings,
  loadMyCallingRequests,
  loadRecipients,
  loadRequests,
  receiveCallingRequest,
  sendRequest,
  submitCallingRequest,
  updateCandidate,
} from '../../src/lib/queries'
import { signIn } from './helpers'

const TAG = `it-${Date.now()}`

describe('requests', () => {
  afterAll(async () => {
    const bishop = await signIn('bishop')
    await bishop.from('requests').delete().like('title', `${TAG}%`)
  })

  it('goes from the bishop to the secretary and back', async () => {
    const bishop = await signIn('bishop')
    const secretary = await signIn('secretary')

    const people = await loadRecipients(bishop)
    expect(people.map((p) => p.id)).toContain(secretary.userId)
    expect(people.map((p) => p.id)).not.toContain(bishop.userId)

    const before = await countWaiting(secretary, secretary.userId, true)
    const id = await sendRequest(bishop, { to_id: secretary.userId, title: `${TAG} Call the Lees`, details: 'About Sunday', due_on: '2026-11-12', agenda_item_id: null })
    expect(await countWaiting(secretary, secretary.userId, true)).toBe(before + 1)

    await answerRequest(secretary, id, 'seen')
    expect(await countWaiting(secretary, secretary.userId, true)).toBe(before)
    await answerRequest(secretary, id, 'done', '  Called them ')

    const seen = (await loadRequests(bishop)).find((r) => r.id === id)
    expect(seen).toMatchObject({ status: 'done', reply: 'Called them' })
    expect(seen?.closed_at).not.toBeNull()
  })

  it('keeps a request to a ward leader between the two of them', async () => {
    const bishop = await signIn('bishop')
    const leader = await signIn('leader')
    const id = await sendRequest(bishop, { to_id: leader.userId, title: `${TAG} Plan the activity`, details: null, due_on: null, agenda_item_id: null })

    expect((await loadRequests(leader)).map((r) => r.id)).toContain(id)
    expect((await loadRequests(await signIn('first'))).map((r) => r.id)).not.toContain(id)
    expect((await loadRequests(await signIn('rspres'))).map((r) => r.id)).not.toContain(id)

    // A leader can answer it but not send one.
    await answerRequest(leader, id, 'seen')
    await expect(sendRequest(leader, { to_id: bishop.userId, title: `${TAG} Nope`, details: null, due_on: null, agenda_item_id: null })).rejects.toThrow()
    expect(await loadRecipients(leader)).toEqual([])

    await deleteRequest(bishop, id)
    expect((await loadRequests(leader)).map((r) => r.id)).not.toContain(id)
  })

  it('shows up on the agenda', async () => {
    const bishop = await signIn('bishop')
    const [template] = (await loadAgendaTemplates(bishop)).filter((t) => t.slug === 'bishopric')
    expect(template.sections.map((s) => s.kind)).toContain('follow_ups')

    const clerk = await signIn('clerk')
    const id = await sendRequest(bishop, { to_id: clerk.userId, title: `${TAG} Update the records`, details: null, due_on: null, agenda_item_id: null })
    const agenda = await loadAgenda(await signIn('second'), template, '2026-11-08')
    expect(agenda.requests.map((r) => r.id)).toContain(id)
    expect(agenda.recipients.length).toBeGreaterThan(0)
  })
})

describe('calling requests', () => {
  afterAll(async () => {
    const bishop = await signIn('bishop')
    const { needs } = await loadCallings(bishop)
    const mine = (await loadCallingRequests(bishop)).filter((r) => r.calling_title.startsWith(TAG))
    await bishop.from('calling_candidates').delete().in('request_id', mine.map((r) => r.id))
    await bishop.from('calling_requests').delete().in('id', mine.map((r) => r.id))
    await bishop.from('calling_needs').delete().in('id', needs.filter((n) => n.calling_title.startsWith(TAG)).map((n) => n.id))
    await bishop.from('callings').delete().like('title', `${TAG}%`)
  })

  it('takes a leader’s request to the right counselor and reports back how it’s going', async () => {
    const leader = await signIn('leader')
    const id = await submitCallingRequest(leader, {
      kind: 'replace',
      calling_title: `${TAG} Primary Pianist`,
      organization: 'Primary',
      release_name: 'Brother Hale',
      notes: 'Moving away',
      names: ['Sister Vale'],
    })

    const [mine] = (await loadMyCallingRequests(leader)).filter((r) => r.id === id)
    expect(mine).toMatchObject({ stage: 'sent', names: ['Sister Vale'], release_name: 'Brother Hale' })
    // Still confidential: the leader reads nothing from the callings tables.
    expect((await loadCallings(leader)).needs).toEqual([])

    const second = await signIn('second') // assigned to Primary in the seed
    const request = (await loadCallingRequests(second)).find((r) => r.id === id)!
    expect(request.routed_to).toEqual([second.userId])
    expect(await countWaiting(second, second.userId, true)).toBeGreaterThan(0)

    const { needs, candidates } = await loadCallings(second)
    const need = needs.find((n) => n.id === request.need_id)!
    expect(need).toMatchObject({ status: 'open', release_name: 'Brother Hale' })
    const vale = candidates.find((c) => c.request_id === id)!
    expect(vale).toMatchObject({ need_id: need.id, person_name: 'Sister Vale', suggested_by: leader.userId })

    await receiveCallingRequest(second, id, second.userId)
    expect((await loadMyCallingRequests(leader)).find((r) => r.id === id)).toMatchObject({ stage: 'received', received_by_name: 'Brother Ortiz' })

    await updateCandidate(second, vale.id, { status: 'discussing' })
    expect((await loadMyCallingRequests(leader)).find((r) => r.id === id)?.stage).toBe('in_progress')

    expect(await loadMyCallingRequests(await signIn('rspres'))).not.toContainEqual(expect.objectContaining({ id }))
  })
})
