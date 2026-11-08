// Mentoring through the real API: the x-acting-as header passes the gateway, and what the mentor
// does is recorded as the person he mentors. Sister Reyes (a ward leader) mentors Brother Lane.

import { execSync } from 'node:child_process'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as q from '../../src/lib/queries'
import { anonClient, LOCAL_PASSWORD, signIn } from './helpers'

const LANE = '00000000-0000-0000-0000-000000000001'
const REYES = '00000000-0000-0000-0000-00000000000d'
const SECRETARY = '00000000-0000-0000-0000-00000000000c'
const TAG = `mentoring-it-${Date.now()}`

function localDbUrl(): string {
  const url: string = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).DB_URL
  if (!/@(127\.0\.0\.1|localhost):/.test(url)) throw new Error(`Integration tests only run against a local database, not ${url}`)
  return url
}

const sql = postgres(localDbUrl(), { max: 2, onnotice: () => {} })

/** Reyes, signed in, sending x-acting-as for Lane on every request. */
async function reyesForLane() {
  const client = anonClient({ 'x-acting-as': LANE })
  const { error } = await client.auth.signInWithPassword({ email: 'leader@ward.test', password: LOCAL_PASSWORD })
  if (error) throw error
  return client
}

describe('mentoring', () => {
  beforeAll(async () => {
    await sql`update public.delegations set ended_at = now() where mentor_id = ${REYES} and ended_at is null`
    await sql`insert into public.delegations (mentor_id, for_id, ends_at) values (${REYES}, ${LANE}, now() + interval '1 week')`
  })
  afterAll(async () => {
    await sql`delete from public.requests where title like ${TAG + '%'}`
    await sql`delete from public.delegations where mentor_id = ${REYES}`
    await sql.end()
  })

  it('tells the mentor who she may act for', async () => {
    const reyes = await signIn('leader')
    const who = await q.whoami(reyes)
    expect(who?.mentoring.map((m) => m.for_id)).toEqual([LANE])
    const lane = await signIn('first')
    expect((await q.whoami(lane))?.mentored_by.map((m) => m.mentor_id)).toEqual([REYES])
  })

  it('records what she does as him', async () => {
    const acting = await reyesForLane()
    const { data, error } = await acting.from('requests').insert({ to_id: SECRETARY, title: `${TAG} visit` }).select('from_id').single()
    expect(error).toBeNull()
    expect(data?.from_id).toBe(LANE)
  })

  it('keeps her own view without the header', async () => {
    const reyes = await signIn('leader')
    const { data } = await reyes.from('requests').select('id').like('title', `${TAG}%`)
    expect(data).toEqual([])
  })

  it('hides callings until he allows them', async () => {
    const acting = await reyesForLane()
    expect((await acting.from('calling_needs').select('id')).data).toEqual([])
    const lane = await signIn('first')
    const [d] = (await q.whoami(lane))!.mentored_by
    await q.updateMentoring(lane, d.id, { sees_callings: true })
    expect((await acting.from('calling_needs').select('id')).data?.length).toBeGreaterThan(0)
  })
})
