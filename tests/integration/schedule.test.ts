import { afterAll, describe, expect, it } from 'vitest'
import { addStewardship, deleteEvent, deleteRotation, deleteStewardship, loadRotations, loadSchedule, saveEvent, saveRotation } from '../../src/lib/queries'
import { signIn } from './helpers'

const TAG = `it-${Date.now()}`

describe('the standing schedule', () => {
  afterAll(async () => {
    const lane = await signIn('first')
    await lane.from('rotations').delete().like('title', `${TAG}%`)
    await lane.from('recurring_events').delete().like('title', `${TAG}%`)
    await lane.from('stewardships').delete().like('area', `${TAG}%`)
  })

  it('lets a counselor add, change and remove a rotation', async () => {
    const lane = await signIn('first')
    await saveRotation(lane, { title: `${TAG} talk`, assignee_id: lane.userId, assignee_label: null, months: [1, 7], weekday: 0, week_of_month: 4 })
    const added = (await loadRotations(lane)).find((r) => r.title === `${TAG} talk`)!
    expect(added).toMatchObject({ months: [1, 7], weekday: 0, week_of_month: 4 })

    await saveRotation(lane, { ...added, months: [3], weekday: null, week_of_month: null }, added.id)
    expect((await loadRotations(lane)).find((r) => r.id === added.id)).toMatchObject({ months: [3], weekday: null })

    await deleteRotation(lane, added.id)
    expect((await loadRotations(lane)).some((r) => r.id === added.id)).toBe(false)
  })

  it('lets a counselor keep the regular meetings and assignments', async () => {
    const lane = await signIn('first')
    await saveEvent(lane, { title: `${TAG} council`, weekday: 0, week_of_month: 3, start_time: '09:30' })
    const event = (await loadSchedule(lane)).events.find((e) => e.title === `${TAG} council`)!
    expect(event.start_time).toBe('09:30:00')
    await deleteEvent(lane, event.id)

    await addStewardship(lane, lane.userId, ` ${TAG} area `)
    const area = (await loadSchedule(lane)).stewardships.find((s) => s.area === `${TAG} area`)!
    expect(area.user_id).toBe(lane.userId)
    await deleteStewardship(lane, area.id)
    expect((await loadSchedule(lane)).stewardships.some((s) => s.id === area.id)).toBe(false)
  })

  it('refuses changes from a called leader', async () => {
    const leader = await signIn('leader')
    await expect(saveRotation(leader, { title: `${TAG} x`, assignee_id: null, assignee_label: null, months: [1], weekday: null, week_of_month: null })).rejects.toThrow(/row-level security/)
    await expect(saveEvent(leader, { title: `${TAG} x`, weekday: 0, week_of_month: null, start_time: null })).rejects.toThrow(/row-level security/)
  })
})
