// The notifications about appointment and away-date changes, and the scheduled ones for requests
// due, callings to record and calling request progress, against the seeded database. Changes are
// made by signed-in people, so the database's triggers record them; a fake push service stands in
// for the real one.

import { execSync } from 'node:child_process'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sendDaily } from '../../scripts/notify/daily'
import type { Device, PushMessage, Sender } from '../../scripts/notify/deliver'
import { sendNotices } from '../../scripts/notify/notices'
import { tick } from '../../scripts/notify/tick'
import * as q from '../../src/lib/queries'
import { signIn } from './helpers'

const TZ = 'America/Denver'
const BISHOP = '00000000-0000-0000-0000-00000000000b'
const SECRETARY = '00000000-0000-0000-0000-00000000000c' // schedules for the bishop
const CLERK = '00000000-0000-0000-0000-00000000000e'
const ENDPOINT = 'https://push.test/notices-integration'
const NAME = 'Notice Test'

function localDbUrl(): string {
  const url: string = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).DB_URL
  if (!/@(127\.0\.0\.1|localhost):/.test(url)) throw new Error(`Integration tests only run against a local database, not ${url}`)
  return url
}

const sql = postgres(localDbUrl(), { max: 3, onnotice: () => {} })

function fakePush() {
  const sent: { endpoint: string; message: PushMessage }[] = []
  const send: Sender = async (device: Device, message) => {
    sent.push({ endpoint: device.endpoint, message })
    return 'sent'
  }
  const to = (who: string) => sent.filter((s) => s.endpoint.endsWith(`/${who}`)).map((s) => s.message.body)
  return { send, sent, to }
}

let leaderId = ''
let only: string[] = []
const notices = (send: Sender) => sendNotices({ sql, now: new Date(), timeZone: TZ, send, only })

const cleanUp = async () => {
  await sql`delete from public.push_subscriptions where endpoint like ${`${ENDPOINT}%`}`
  await sql`delete from public.interviews where person_name = ${NAME}`
  await sql`delete from public.absences where starts_on = '2027-02-09'`
  await sql`delete from public.requests where title = ${NAME}`
  await sql`delete from public.calling_candidates where person_name = ${NAME}`
  await sql`delete from public.calling_needs where calling_title = ${NAME}`
  await sql`delete from public.calling_requests where calling_title = ${NAME}`
  if (only.length) {
    await sql`delete from public.notification_mutes where user_id in ${sql(only)}`
    await sql`delete from public.notification_log where kind in ('request_due', 'callings_to_record') and user_id in ${sql(only)}`
  }
}

/** Earlier tests' changes aren't this test's news. */
const drain = () => sql`update public.notification_outbox set claimed_at = now() where claimed_at is null`

beforeAll(async () => {
  leaderId = (await sql<{ id: string }[]>`select id from public.profiles where email = 'leader@ward.test'`)[0].id
  only = [BISHOP, SECRETARY, CLERK, leaderId]
  await cleanUp()
  await sql`
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
      (${BISHOP}, ${`${ENDPOINT}/bishop`}, 'k', 'a'),
      (${SECRETARY}, ${`${ENDPOINT}/secretary`}, 'k', 'a'),
      (${CLERK}, ${`${ENDPOINT}/clerk`}, 'k', 'a'),
      (${leaderId}, ${`${ENDPOINT}/leader`}, 'k', 'a')`
})

beforeEach(drain)

afterAll(async () => {
  await cleanUp()
  await drain()
  await sql.end()
})

describe('appointment changes', () => {
  it('tells the secretary about a new one, books and moves it, and hears when it’s sent back', async () => {
    const bishop = await signIn('bishop')
    const secretary = await signIn('secretary')

    await q.addAppointment(bishop, { interviewer_id: BISHOP, person_name: NAME, purpose: 'other' })
    let push = fakePush()
    await notices(push.send)
    expect(push.to('secretary')).toEqual(['The bishop has a new appointment to book.'])
    expect(push.to('bishop'), 'nobody hears about their own change').toEqual([])

    const [{ id }] = await sql<{ id: string }[]>`select id from public.interviews where person_name = ${NAME}`
    await q.updateAppointment(secretary, id, { scheduled_at: '2027-01-12T19:00:00-07:00' })
    await q.updateAppointment(secretary, id, { scheduled_at: '2027-01-13T19:30:00-07:00' })
    push = fakePush()
    await notices(push.send)
    // Booked weeks ahead: the summary the evening before covers it. Moving it is news.
    expect(push.to('bishop')).toEqual(['Your appointment Tue, Jan 12 at 7 PM moved to Wed, Jan 13 at 7:30 PM.'])
    expect(push.to('secretary')).toEqual([])

    await q.reportAppointment(bishop, { id, scheduled_at: '2027-01-13T19:30:00-07:00' }, { outcome: 'reschedule', note: null }, BISHOP)
    push = fakePush()
    await notices(push.send)
    expect(push.to('secretary')).toEqual(['The bishop sent back a missed appointment to find a new time.'])
    expect(push.sent.every((s) => !s.message.body.includes(NAME))).toBe(true)
  })

  it('sends nothing someone turned off', async () => {
    const bishop = await signIn('bishop')
    const secretary = await signIn('secretary')
    await q.setNotificationOn(secretary, 'appointment_to_book', false)
    expect(await q.loadMutedNotifications(secretary)).toEqual(['appointment_to_book'])

    await q.addAppointment(bishop, { interviewer_id: BISHOP, person_name: NAME, purpose: 'other' })
    const push = fakePush()
    const reports = await notices(push.send)
    expect(push.to('secretary')).toEqual([])
    expect(reports.find((r) => r.userId === SECRETARY)?.outcome).toBe('muted')

    await q.setNotificationOn(secretary, 'appointment_to_book', true)
    expect(await q.loadMutedNotifications(secretary)).toEqual([])
  })

  it('tells the secretary when away dates cover booked appointments', async () => {
    const bishop = await signIn('bishop')
    const secretary = await signIn('secretary')
    await sql`delete from public.interviews where person_name = ${NAME}`
    await q.addAppointment(secretary, { interviewer_id: BISHOP, person_name: NAME, purpose: 'other', scheduled_at: '2027-02-10T19:00:00-07:00' })
    await drain()

    await q.addAbsence(bishop, { starts_on: '2027-02-09', ends_on: '2027-02-11', location: null })
    const push = fakePush()
    await notices(push.send)
    expect(push.to('secretary')).toEqual(['The bishop will be away Feb 9–11, when 1 appointment is booked.'])
  })

  it('tells the rest of the bishopric when no one will be there on a Sunday', async () => {
    await sql`delete from public.absences where starts_on = '2027-02-09'`
    // Sunday, February 14th 2027.
    await q.addAbsence(await signIn('first'), { starts_on: '2027-02-09', ends_on: '2027-02-14', location: null })
    await q.addAbsence(await signIn('second'), { starts_on: '2027-02-09', ends_on: '2027-02-14', location: null })
    await drain()
    await q.addAbsence(await signIn('bishop'), { starts_on: '2027-02-09', ends_on: '2027-02-14', location: null })
    const push = fakePush()
    await notices(push.send)
    const warning = 'No one in the bishopric will be at church Sun, Feb 14. Someone will need to preside.'
    expect(push.to('secretary')).toContain(warning)
    expect(push.to('clerk')).toEqual([warning])
    // They entered it and saw the warning in the app.
    expect(push.to('bishop')).toEqual([])
  })

  it('runs one at a time', async () => {
    const other = await sql.reserve()
    try {
      await other`select pg_advisory_lock(7310412)`
      const report = await tick({ sql, now: new Date(), timeZone: TZ, send: fakePush().send, only })
      expect(report.busy).toBe(true)
    } finally {
      await other`select pg_advisory_unlock(7310412)`
      other.release()
    }
  })
})

describe('scheduled', () => {
  // Saturday, March 6th 2027 at 11 AM, and the Sunday after at 2 PM.
  const saturday = new Date('2027-03-06T11:00:00-07:00')
  const sunday = new Date('2027-03-07T14:00:00-07:00')
  const daily = (now: Date, send: Sender) => sendDaily({ sql, now, timeZone: TZ, send, only })

  it('reminds people of requests due tomorrow, once', async () => {
    await sql`insert into public.requests (from_id, to_id, title, due_on) values (${BISHOP}, ${leaderId}, ${NAME}, '2027-03-07'), (${BISHOP}, ${leaderId}, ${NAME}, '2027-03-07')`
    let push = fakePush()
    await daily(saturday, push.send)
    expect(push.to('leader')).toEqual(['2 requests you were asked to do are due tomorrow.'])
    push = fakePush()
    await daily(saturday, push.send)
    expect(push.to('leader')).toEqual([])
  })

  it('tells the ward clerk what was sustained and released, never who', async () => {
    const [need] = await sql<{ id: string }[]>`
      insert into public.calling_needs (calling_title, release_name, release_on) values (${NAME}, 'Someone Leaving', '2027-03-07') returning id`
    await sql`
      insert into public.calling_candidates (need_id, calling_title, person_name, status, sustain_on) values
        (${need.id}, ${NAME}, ${NAME}, 'accepted', '2027-03-07'),
        (${need.id}, ${NAME}, ${NAME}, 'discussing', '2027-03-07')`
    const push = fakePush()
    await daily(sunday, push.send)
    expect(push.to('clerk')).toEqual(['Today: 1 calling sustained and 1 release. You can update the church’s records.'])
    expect(push.to('bishop'), 'only the clerk').toEqual([])
  })

  it('tells a ward leader their calling request is finished, once', async () => {
    await sql`insert into public.calling_requests (requested_by, kind, calling_title, routed_to) values (${leaderId}, 'suggest', ${NAME}, '{}')`
    let push = fakePush()
    await daily(saturday, push.send)
    expect(push.to('leader')).toContain('Your calling request is finished. Open Ward Desk to see it.')
    push = fakePush()
    await daily(saturday, push.send)
    expect(push.to('leader')).toEqual([])
  })
})
