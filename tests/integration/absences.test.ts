import { afterAll, describe, expect, it } from 'vitest'
import { addAbsence, deleteAbsence, loadAbsences, loadSacrament } from '../../src/lib/queries'
import { isAway } from '../../src/lib/schedule'
import { signIn } from './helpers'

const TAG = `it-${Date.now()}`

describe('away dates', () => {
  afterAll(async () => {
    for (const user of ['scheduler', 'first'] as const) {
      const client = await signIn(user)
      await client.from('absences').delete().like('location', `${TAG}%`)
    }
  })

  it('lets anyone record their own trip and everyone see it', async () => {
    const lane = await signIn('first')
    await addAbsence(lane, { starts_on: '2030-07-03', ends_on: '2030-07-08', location: `${TAG} Moab` })

    const scheduler = await signIn('scheduler')
    const absences = await loadAbsences(scheduler, '2030-07-01')
    expect(isAway(lane.userId, '2030-07-07', absences)?.location).toBe(`${TAG} Moab`)
  })

  it('does not let one person remove another person\'s trip', async () => {
    const lane = await signIn('first')
    const scheduler = await signIn('scheduler')
    const trip = (await loadAbsences(scheduler, '2030-07-01')).find((a) => a.location === `${TAG} Moab`)!

    await deleteAbsence(scheduler, trip.id) // RLS turns this into a no-op, not an error
    expect((await loadAbsences(lane, '2030-07-01')).map((a) => a.id)).toContain(trip.id)
  })

  it('feeds the conducting warning on the Sacrament page', async () => {
    const seeded = await signIn('scheduler')
    const { meetings, absences } = await loadSacrament(seeded, '2026-11-22', '2026-11-22')
    // Seed: Brother Ortiz is in Denver 11/20-11/23. The 11/22 meeting has Lane conducting, so no warning there,
    // but Ortiz would be flagged if assigned.
    const ortiz = absences.find((a) => a.location === 'Denver')!
    expect(isAway(ortiz.user_id, '2026-11-22', absences)).toBeDefined()
    expect(isAway(meetings[0].conducting_id, '2026-11-22', absences)).toBeUndefined()
  })
})
