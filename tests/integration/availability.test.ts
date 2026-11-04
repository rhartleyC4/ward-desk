import { afterAll, describe, expect, it } from 'vitest'
import { dayFor } from '../../src/lib/availability'
import { addDayHours, addUsualHours, deleteUsualHours, loadHours, markDayOff, resetDay } from '../../src/lib/queries'
import { signIn } from './helpers'

// Dates far enough out that nothing seeded touches them. 2031-01-08 is a Wednesday.
const WED = '2031-01-08'

describe('appointment hours', () => {
  afterAll(async () => {
    const secretary = await signIn('secretary')
    const { hours, leaders } = await loadHours(secretary, WED, WED)
    const second = leaders.find((l) => l.email === 'second@ward.test')!
    for (const h of hours.filter((x) => x.user_id === second.id)) await deleteUsualHours(secretary, h.id)
    for (const l of leaders) await resetDay(secretary, l.id, WED)
  })

  it('lets a counselor set his usual hours and the secretary see them', async () => {
    const second = await signIn('second')
    await addUsualHours(second, second.userId, 3, { starts_at: '19:00', ends_at: '20:30' })

    const secretary = await signIn('secretary')
    const { hours, changes, absences } = await loadHours(secretary, WED, WED)
    expect(dayFor(second.userId, WED, hours, changes, absences)).toMatchObject({ kind: 'usual', blocks: [{ starts_at: '19:00:00', ends_at: '20:30:00' }] })
  })

  it('lets the secretary change one date and put it back', async () => {
    const second = await signIn('second')
    const secretary = await signIn('secretary')

    await markDayOff(secretary, second.userId, WED)
    let data = await loadHours(second, WED, WED)
    expect(dayFor(second.userId, WED, data.hours, data.changes, data.absences).kind).toBe('off')

    // Giving hours on a day marked off makes him available again, at just those hours.
    await addDayHours(secretary, second.userId, WED, { starts_at: '18:00', ends_at: '18:30' })
    data = await loadHours(second, WED, WED)
    expect(dayFor(second.userId, WED, data.hours, data.changes, data.absences)).toMatchObject({ kind: 'changed', blocks: [{ starts_at: '18:00:00' }] })

    await resetDay(secretary, second.userId, WED)
    data = await loadHours(second, WED, WED)
    expect(dayFor(second.userId, WED, data.hours, data.changes, data.absences).kind).toBe('usual')
  })

  it('hides everyone\'s hours from called leaders', async () => {
    const leader = await signIn('leader')
    const { hours, changes } = await loadHours(leader, '2026-11-01', '2026-11-30')
    expect(hours).toEqual([])
    expect(changes).toEqual([])
    await expect(addUsualHours(leader, leader.userId, 1, { starts_at: '19:00', ends_at: '20:00' })).rejects.toThrow()
  })
})
