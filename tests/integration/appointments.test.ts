import { afterAll, describe, expect, it } from 'vitest'
import { needsToDiscuss, releasesOn, sustainingsOn } from '../../src/lib/agenda'
import { appointmentFor, leadersScheduledBy, splitAppointments } from '../../src/lib/appointments'
import {
  acceptCandidate,
  addCandidate,
  addNeed,
  addSecretary,
  assignCallingAppointment,
  deleteNeed,
  loadAgenda,
  loadAgendaTemplates,
  loadAppointments,
  loadBishopric,
  loadCallings,
  removeSecretary,
  updateAppointment,
} from '../../src/lib/queries'
import { signIn } from './helpers'

const TAG = `it-${Date.now()}`

describe('appointments', () => {
  afterAll(async () => {
    const bishop = await signIn('bishop')
    await bishop.from('interviews').delete().like('person_name', `${TAG}%`)
    await bishop.from('calling_candidates').delete().like('person_name', `${TAG}%`)
    await bishop.from('calling_needs').delete().like('calling_title', `${TAG}%`)
    await bishop.from('callings').delete().like('title', `${TAG}%`)
  })

  it('carries an approved name from the bishopric to the secretary who schedules for that leader', async () => {
    const bishop = await signIn('bishop')
    const [, lane, ortiz] = await loadBishopric(bishop)
    await addNeed(bishop, { calling_title: `${TAG} Nursery Leader` })
    const need = (await loadCallings(bishop)).needs.find((n) => n.calling_title === `${TAG} Nursery Leader`)!
    await addCandidate(bishop, { need_id: need.id, person_name: `${TAG} Sister Cruz`, status: 'approved' })
    const candidate = (await loadCallings(bishop)).candidates.find((c) => c.person_name === `${TAG} Sister Cruz`)!

    await assignCallingAppointment(bishop, candidate, lane.id)

    // The assistant schedules for the counselors, so it waits in their list without a time.
    const assistant = await signIn('assistant')
    let data = await loadAppointments(assistant)
    const mine = leadersScheduledBy(assistant.userId, data.assignments)
    expect(mine.sort()).toEqual([lane.id, ortiz.id].sort())
    const waiting = splitAppointments(data.appointments, mine).toSchedule.find((a) => a.candidate_id === candidate.id)!
    expect(waiting).toMatchObject({ interviewer_id: lane.id, person_name: `${TAG} Sister Cruz`, scheduled_at: null })

    // The executive secretary only schedules for the bishop, so it isn't in their list.
    const secretary = await signIn('secretary')
    const theirs = await loadAppointments(secretary)
    const theirList = splitAppointments(theirs.appointments, leadersScheduledBy(secretary.userId, theirs.assignments))
    expect(theirList.toSchedule.some((a) => a.candidate_id === candidate.id)).toBe(false)

    await updateAppointment(assistant, waiting.id, { scheduled_at: '2030-06-02T17:00:00Z' })

    // Handing it to another counselor keeps the time, and the agenda shows it beside the name.
    await assignCallingAppointment(bishop, candidate, ortiz.id)
    const [bishopric] = await loadAgendaTemplates(bishop)
    const agenda = await loadAgenda(bishop, bishopric, '2030-06-02')
    expect(appointmentFor(candidate.id, agenda.appointments)).toMatchObject({ interviewer_id: ortiz.id, scheduled_at: '2030-06-02T17:00:00+00:00' })

    // Taking it back cancels it rather than leaving it in someone's list.
    await assignCallingAppointment(bishop, candidate, null)
    data = await loadAppointments(assistant)
    expect(data.appointments.some((a) => a.candidate_id === candidate.id)).toBe(false)
  })

  it('moves an accepted name to Sustainings and the release to Releases on the chosen Sunday', async () => {
    const bishop = await signIn('bishop')
    const [, lane] = await loadBishopric(bishop)
    await addNeed(bishop, { calling_title: `${TAG} Ward Chorister`, release_name: `${TAG} Sister Old` })
    const need = (await loadCallings(bishop)).needs.find((n) => n.calling_title === `${TAG} Ward Chorister`)!
    await addCandidate(bishop, { need_id: need.id, person_name: `${TAG} Sister New`, status: 'approved' })
    const candidate = (await loadCallings(bishop)).candidates.find((c) => c.person_name === `${TAG} Sister New`)!
    await assignCallingAppointment(bishop, candidate, lane.id)

    const [bishopric] = await loadAgendaTemplates(bishop)
    const before = await loadAgenda(bishop, bishopric, '2030-06-02')
    expect(needsToDiscuss('2030-06-02', before.needs, before.candidates).map((n) => n.id)).toContain(need.id)

    await acceptCandidate(bishop, candidate, '2030-06-09')

    // Still discussed the Sunday before, then sustained and released together.
    const sunday = await loadAgenda(bishop, bishopric, '2030-06-09')
    expect(needsToDiscuss('2030-06-02', sunday.needs, sunday.candidates).map((n) => n.id)).toContain(need.id)
    expect(needsToDiscuss('2030-06-09', sunday.needs, sunday.candidates).map((n) => n.id)).not.toContain(need.id)
    expect(sustainingsOn('2030-06-09', sunday.needs, sunday.candidates)).toContainEqual({ id: candidate.id, name: `${TAG} Sister New`, calling: `${TAG} Ward Chorister` })
    expect(releasesOn('2030-06-09', sunday.needs).map((n) => n.id)).toContain(need.id)
    // The appointment happened, so it leaves the secretary's list.
    expect(appointmentFor(candidate.id, sunday.appointments)?.status).toBe('completed')
  })

  it("takes a removed calling's open appointments off the secretaries' list", async () => {
    const bishop = await signIn('bishop')
    const [, lane] = await loadBishopric(bishop)
    await addNeed(bishop, { calling_title: `${TAG} Library Aide` })
    const need = (await loadCallings(bishop)).needs.find((n) => n.calling_title === `${TAG} Library Aide`)!
    await addCandidate(bishop, { need_id: need.id, person_name: `${TAG} Brother Gone`, status: 'approved' })
    const candidate = (await loadCallings(bishop)).candidates.find((c) => c.person_name === `${TAG} Brother Gone`)!
    await assignCallingAppointment(bishop, candidate, lane.id)

    await deleteNeed(bishop, need.id)

    const callings = await loadCallings(bishop)
    expect(callings.needs.some((n) => n.id === need.id)).toBe(false)
    expect(callings.candidates.some((c) => c.id === candidate.id)).toBe(false)
    const { appointments } = await loadAppointments(bishop)
    expect(appointments.some((a) => a.person_name === `${TAG} Brother Gone`)).toBe(false)
  })

  it('lets the bishopric change who schedules for whom', async () => {
    const clerk = await signIn('clerk')
    const [bishop] = await loadBishopric(clerk)
    const { secretaries } = await loadAppointments(clerk)
    expect(secretaries.map((s) => s.display_name)).toEqual(expect.arrayContaining(['Brother Quinn', 'Brother Tate']))
    expect(secretaries.some((s) => s.id === bishop.id)).toBe(false)

    const tate = secretaries.find((s) => s.display_name === 'Brother Tate')!
    await addSecretary(clerk, bishop.id, tate.id)
    expect((await loadAppointments(clerk)).assignments).toContainEqual(expect.objectContaining({ leader_id: bishop.id, secretary_id: tate.id }))
    await removeSecretary(clerk, bishop.id, tate.id)
    expect((await loadAppointments(clerk)).assignments).not.toContainEqual(expect.objectContaining({ leader_id: bishop.id, secretary_id: tate.id }))
  })

  it('hides appointments and assignments from a called leader', async () => {
    const leader = await signIn('leader')
    const data = await loadAppointments(leader)
    expect(data.appointments).toEqual([])
    expect(data.assignments).toEqual([])
  })
})
