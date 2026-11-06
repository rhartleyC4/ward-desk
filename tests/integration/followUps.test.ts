// The scheduled sender's follow-up nudges against the seeded database, with a fake push service in
// place of the real one: a leader asked how today's appointments went, and a secretary asked to
// send tomorrow's reminders.

import { execSync } from 'node:child_process'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Device, PushMessage, Sender } from '../../scripts/notify/deliver'
import { tick } from '../../scripts/notify/tick'

const TZ = 'America/Denver'
const BISHOP = '00000000-0000-0000-0000-00000000000b'
const SECRETARY = '00000000-0000-0000-0000-00000000000c' // schedules for the bishop
const ASSISTANT = '00000000-0000-0000-0000-000000000010'
const ENDPOINT = 'https://push.test/follow-up-integration'
// Sunday, December 6th 2026: the bishop has appointments 9:00–9:10 and 10:00–10:20.
const SUNDAY = '2026-12-06'
const at = (date: string, time: string) => new Date(`${date}T${time}:00-07:00`)

function localDbUrl(): string {
  const url: string = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).DB_URL
  if (!/@(127\.0\.0\.1|localhost):/.test(url)) throw new Error(`Integration tests only run against a local database, not ${url}`)
  return url
}

const sql = postgres(localDbUrl(), { max: 2, onnotice: () => {} })

function fakePush() {
  const sent: { endpoint: string; message: PushMessage }[] = []
  const send: Sender = async (device: Device, message) => {
    sent.push({ endpoint: device.endpoint, message })
    return 'sent'
  }
  return { send, sent }
}

const only = [BISHOP, SECRETARY, ASSISTANT]
const run = (now: Date, send: Sender) => tick({ sql, now, timeZone: TZ, send, only })

const cleanUp = async () => {
  await sql`delete from public.push_subscriptions where endpoint like ${`${ENDPOINT}%`}`
  await sql`delete from public.notification_log where for_date between '2026-12-05' and '2026-12-07' and user_id in ${sql(only)}`
  await sql`delete from public.interviews where person_name like 'Follow Test%'`
  await sql`delete from public.recurring_events where title = 'Follow-up test meeting'`
}

beforeAll(async () => {
  await cleanUp()
  await sql`
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
      (${BISHOP}, ${`${ENDPOINT}/bishop`}, 'k', 'a'),
      (${SECRETARY}, ${`${ENDPOINT}/secretary`}, 'k', 'a'),
      (${ASSISTANT}, ${`${ENDPOINT}/assistant`}, 'k', 'a')`
  // A Sunday meeting the secretary reminds people about, the day after they're asked.
  await sql`insert into public.recurring_events (title, weekday, start_time, reminder_by) values ('Follow-up test meeting', 0, '19:00', ${SECRETARY})`
})

beforeEach(async () => {
  await sql`delete from public.notification_log where for_date between '2026-12-05' and '2026-12-07' and user_id in ${sql(only)}`
  await sql`delete from public.interviews where person_name like 'Follow Test%'`
  await sql`delete from public.meeting_reminders where for_date = ${SUNDAY}`
  await sql`
    insert into public.interviews (interviewer_id, scheduled_at, person_name, purpose, duration_minutes) values
      (${BISHOP}, ${at(SUNDAY, '09:00')}, 'Follow Test One', 'other', 10),
      (${BISHOP}, ${at(SUNDAY, '10:00')}, 'Follow Test Two', 'other', 20)`
})

afterAll(async () => {
  await cleanUp()
  await sql.end()
})

describe('asking a leader how appointments went', () => {
  it('waits until half an hour after the last one, then asks once', async () => {
    const early = fakePush()
    await run(at(SUNDAY, '10:49'), early.send)
    expect(early.sent.filter((s) => s.endpoint.endsWith('/bishop'))).toHaveLength(0)

    const due = fakePush()
    const report = await run(at(SUNDAY, '10:50'), due.send)
    const bishop = due.sent.filter((s) => s.endpoint.endsWith('/bishop'))
    expect(bishop.map((s) => s.message)).toEqual([{ title: 'How did your appointments go?', body: '2 appointments today are ready to mark done or missed.', url: '/home', tag: `report-${SUNDAY}` }])
    expect(report.followUps.find((r) => r.userId === BISHOP)?.outcome).toBe('sent')

    const again = fakePush()
    await run(at(SUNDAY, '11:00'), again.send)
    expect(again.sent.filter((s) => s.endpoint.endsWith('/bishop'))).toHaveLength(0)
  })

  it("doesn't ask when they've all been reported", async () => {
    await sql`update public.interviews set status = 'completed' where person_name like 'Follow Test%'`
    const push = fakePush()
    await run(at(SUNDAY, '11:00'), push.send)
    expect(push.sent.filter((s) => s.endpoint.endsWith('/bishop'))).toHaveLength(0)
  })
})

describe("asking a secretary to send tomorrow's reminders", () => {
  const SATURDAY = '2026-12-05'

  it('waits for late morning, then asks whoever books for that leader', async () => {
    const early = fakePush()
    await run(at(SATURDAY, '09:50'), early.send)
    expect(early.sent).toHaveLength(0)

    const push = fakePush()
    await run(at(SATURDAY, '10:00'), push.send)
    expect(push.sent.map((s) => s.endpoint.split('/').at(-1))).toEqual(['secretary'])
    expect(push.sent[0].message).toEqual({
      title: 'Reminders for tomorrow',
      body: '2 appointment reminders to send\nFollow-up test meeting: reminder to send',
      url: `/reminders?date=${SUNDAY}`,
      tag: `reminders-${SUNDAY}`,
    })
    expect(push.sent[0].message.body).not.toContain('Follow Test') // no member's name on the lock screen

    const again = fakePush()
    await run(at(SATURDAY, '10:10'), again.send)
    expect(again.sent).toHaveLength(0)
  })

  it('leaves out what was already sent, and asks nothing when all of it was', async () => {
    await sql`update public.interviews set reminded_at = now() where person_name = 'Follow Test One'`
    const some = fakePush()
    await run(at(SATURDAY, '12:00'), some.send)
    expect(some.sent[0].message.body).toBe('1 appointment reminder to send\nFollow-up test meeting: reminder to send')

    await sql`delete from public.notification_log where kind = 'reminders' and for_date = ${SUNDAY}`
    await sql`update public.interviews set reminded_at = now() where person_name like 'Follow Test%'`
    await sql`insert into public.meeting_reminders (event_id, for_date) select id, ${SUNDAY} from public.recurring_events where title = 'Follow-up test meeting'`
    const none = fakePush()
    await run(at(SATURDAY, '12:10'), none.send)
    expect(none.sent).toHaveLength(0)
  })
})
