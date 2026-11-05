// The day-ahead sender against the seeded database, with a fake push service in place of the real one.

import { execSync } from 'node:child_process'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sendDaySummaries, type Device, type Sender } from '../../scripts/notify/daySummaries'
import type { PushMessage } from '../../src/lib/daySummary'

const SUNDAY = '2026-11-08'
const BISHOP = '00000000-0000-0000-0000-00000000000b'
const SECOND = '00000000-0000-0000-0000-000000000002'
const LEADER = '00000000-0000-0000-0000-00000000000d'
const ENDPOINT = 'https://push.test/notify-integration'

function localDbUrl(): string {
  const url: string = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).DB_URL
  if (!/@(127\.0\.0\.1|localhost):/.test(url)) throw new Error(`Integration tests only run against a local database, not ${url}`)
  return url
}

const sql = postgres(localDbUrl(), { max: 2, onnotice: () => {} })

const cleanUp = async () => {
  await sql`delete from public.push_subscriptions where endpoint like ${`${ENDPOINT}%`}`
  await sql`delete from public.notification_log where for_date = ${SUNDAY} and user_id in (${BISHOP}, ${SECOND}, ${LEADER})`
  await sql`delete from public.interviews where person_name = 'Notify Test'`
}

/** A push service that records what it was asked to deliver and answers as told. */
function fakePush(answer: (d: Device) => 'sent' | 'gone' | 'failed' = () => 'sent') {
  const sent: { endpoint: string; message: PushMessage }[] = []
  const send: Sender = async (device, message) => {
    sent.push({ endpoint: device.endpoint, message })
    return answer(device)
  }
  return { send, sent }
}

const run = (send: Sender, more: { force?: boolean } = {}) =>
  sendDaySummaries({ sql, date: SUNDAY, timeZone: 'America/Denver', send, only: [BISHOP, SECOND, LEADER], ...more })

beforeAll(async () => {
  await cleanUp()
  await sql`
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
      (${SECOND}, ${`${ENDPOINT}/second`}, 'k', 'a'),
      (${BISHOP}, ${`${ENDPOINT}/bishop-phone`}, 'k', 'a'),
      (${BISHOP}, ${`${ENDPOINT}/bishop-old`}, 'k', 'a'),
      (${LEADER}, ${`${ENDPOINT}/leader`}, 'k', 'a')`
  await sql`
    insert into public.interviews (interviewer_id, scheduled_at, person_name, purpose, duration_minutes) values
      (${BISHOP}, '2026-11-08 10:00 America/Denver', 'Notify Test', 'temple_recommend', 15),
      (${BISHOP}, '2026-11-08 10:15 America/Denver', 'Notify Test', 'other', 10)`
})

afterAll(async () => {
  await cleanUp()
  await sql.end()
})

describe('day-ahead summaries', () => {
  it('sends each bishopric member their day, removes devices the push service forgot, and logs it', async () => {
    const push = fakePush((d) => (d.endpoint.endsWith('bishop-old') ? 'gone' : 'sent'))
    const reports = await run(push.send)

    const second = push.sent.find((s) => s.endpoint.endsWith('/second'))!.message
    expect(second.title).toBe('Tomorrow: Sunday, November 8th')
    expect(second.body).toBe('8:30 AM Bishopric meeting\n9:15 AM Ward Council\nConducting sacrament meeting, with 1 release')

    const bishop = push.sent.find((s) => s.endpoint.endsWith('/bishop-phone'))!.message
    expect(bishop.body).toBe('8:30 AM Bishopric meeting\n9:15 AM Ward Council\n2 appointments, 10–10:25 AM')
    expect(bishop.body).not.toContain('Notify Test')

    expect(push.sent.some((s) => s.endpoint.endsWith('/leader')), 'a called leader gets no bishopric summary').toBe(false)
    expect(reports.map((r) => [r.userId, r.outcome]).sort()).toEqual([
      [SECOND, 'sent'],
      [BISHOP, 'sent'],
    ])

    const devices = await sql`select endpoint from public.push_subscriptions where endpoint like ${`${ENDPOINT}%`} order by endpoint`
    expect(devices.map((d) => d.endpoint.split('/').at(-1))).toEqual(['bishop-phone', 'leader', 'second'])
    const logged = await sql`select user_id from public.notification_log where for_date = ${SUNDAY} and user_id in (${BISHOP}, ${SECOND})`
    expect(logged).toHaveLength(2)
  })

  it('does not send the same day twice unless forced', async () => {
    const again = fakePush()
    expect((await run(again.send)).map((r) => r.outcome)).toEqual(['already-sent', 'already-sent'])
    expect(again.sent).toHaveLength(0)

    const forced = fakePush()
    await run(forced.send, { force: true })
    expect(forced.sent).toHaveLength(2)
  })

  it('logs nothing when every device fails, so the next run tries again', async () => {
    await sql`delete from public.notification_log where for_date = ${SUNDAY} and user_id = ${SECOND}`
    const reports = await sendDaySummaries({ sql, date: SUNDAY, timeZone: 'America/Denver', send: fakePush(() => 'failed').send, only: [SECOND] })
    expect(reports[0].outcome).toBe('failed')
    expect(await sql`select 1 from public.notification_log where for_date = ${SUNDAY} and user_id = ${SECOND}`).toHaveLength(0)
  })
})
