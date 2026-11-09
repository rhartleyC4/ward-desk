import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendDaily } from './daily'
import { sendDaySummaries } from './daySummaries'
import { sendFollowUps } from './followUps'
import { sendNotices } from './notices'
import { describeTick, tick, type TickReport } from './tick'

vi.mock('./daily', () => ({ sendDaily: vi.fn() }))
vi.mock('./daySummaries', () => ({ sendDaySummaries: vi.fn() }))
vi.mock('./followUps', () => ({ sendFollowUps: vi.fn() }))
vi.mock('./notices', () => ({ sendNotices: vi.fn() }))

const send = vi.fn()
const release = vi.fn()
const statements: string[] = []
let locked = true

const lock = vi.fn(async (strings: TemplateStringsArray) => {
  statements.push(strings.join('?'))
  return strings[0].includes('pg_try_advisory_lock') ? [{ locked }] : []
})
const sql = { reserve: async () => Object.assign(lock, { release }) } as never

const at = (time: string) => new Date(`2026-11-08T${time}:00-07:00`)
const run = (time: string, more = {}) => tick({ sql, now: at(time), timeZone: 'America/Denver', send, ...more })
const unlocked = () => statements.some((s) => s.includes('pg_advisory_unlock'))

beforeEach(() => {
  vi.clearAllMocks()
  statements.length = 0
  locked = true
  vi.mocked(sendDaySummaries).mockResolvedValue([])
  vi.mocked(sendNotices).mockResolvedValue([])
  vi.mocked(sendFollowUps).mockResolvedValue([])
  vi.mocked(sendDaily).mockResolvedValue([])
})

describe('tick', () => {
  it('leaves everything to the run already going', async () => {
    locked = false
    await expect(run('19:00')).resolves.toEqual({ summaries: [], notices: [], followUps: [], daily: [], busy: true })
    expect(sendNotices).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledOnce()
    expect(unlocked()).toBe(false)
  })

  it.each([
    ['17:59', false],
    ['18:00', true],
    ['21:59', true],
    ['22:00', false],
  ])('at %s, sends summaries: %s', async (time, sends) => {
    await run(time)
    expect(vi.mocked(sendDaySummaries).mock.calls.length > 0).toBe(sends)
  })

  it('sends summaries for tomorrow in the ward', async () => {
    await run('19:00')
    expect(sendDaySummaries).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-11-09' }))
  })

  it('looks once more for changes made during the run, and returns them all', async () => {
    const first = { kind: 'a' } as never
    const later = { kind: 'b' } as never
    vi.mocked(sendNotices).mockResolvedValueOnce([first]).mockResolvedValueOnce([later])
    const report = await run('11:00')
    expect(sendNotices).toHaveBeenCalledTimes(2)
    expect(report.notices).toEqual([first, later])
  })

  it('does not look again on a dry run', async () => {
    await run('11:00', { dryRun: true })
    expect(sendNotices).toHaveBeenCalledOnce()
    expect(sendNotices).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
  })

  it('lets go of the lock when something fails', async () => {
    vi.mocked(sendFollowUps).mockRejectedValue(new Error('boom'))
    await expect(run('11:00')).rejects.toThrow('boom')
    expect(unlocked()).toBe(true)
    expect(release).toHaveBeenCalledOnce()
  })
})

describe('describeTick', () => {
  const empty: TickReport = { summaries: [], notices: [], followUps: [], daily: [] }
  const person = (outcome: string, office: string | null, devices: number, kind = 'reminders') => ({ outcome, office, devices, kind }) as never

  it('says when another run has it', () => {
    expect(describeTick({ ...empty, busy: true })).toEqual(['another run is going; it sends what this one would have'])
  })

  it('has nothing to say about an idle run', () => {
    expect(describeTick(empty)).toEqual([])
  })

  it('only mentions summaries that went out this run', () => {
    const summaries = [person('already-sent', 'bishop', 1), person('sent', 'bishop', 1), person('failed', null, 2), person('dry-run', 'ward_clerk', 0)]
    expect(describeTick({ ...empty, summaries })).toEqual(['summary → bishop: sent, 1 device', 'summary → bishopric: failed, 2 devices', 'summary → ward_clerk: dry-run, 0 devices'])
  })

  it('lists every notice, follow-up and daily by kind and office', () => {
    const report = { ...empty, notices: [person('sent', 'bishop', 1, 'appointment_booked')], followUps: [person('sent', null, 3, 'report_due')], daily: [person('failed', 'ward_clerk', 1, 'callings_to_record')] }
    expect(describeTick(report)).toEqual(['appointment_booked → bishop: sent, 1 device', 'report_due → member: sent, 3 devices', 'callings_to_record → ward_clerk: failed, 1 device'])
  })
})
