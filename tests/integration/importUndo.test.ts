// Taking a sheets import back out, against the seeded database as the database owner (the way the
// script connects). Every name is invented, and the far-future dates keep clear of other tests.

import { execSync } from 'node:child_process'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { insertPrayerName, startRun, undoImport } from '../../scripts/import-sheets/undo'

const BISHOP = '00000000-0000-0000-0000-00000000000b'
const SECRETARY = '00000000-0000-0000-0000-00000000000c'
const TAG = `undo-${Date.now()}`
const RUN_DAY = `${2090 + Math.floor(Math.random() * 400)}-03-15`
const OTHER_DAY = RUN_DAY.replace('-03-', '-04-')

function localDbUrl(): string {
  const url: string = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).DB_URL
  if (!/@(127\.0\.0\.1|localhost):/.test(url)) throw new Error(`Integration tests only run against a local database, not ${url}`)
  return url
}

const sql = postgres(localDbUrl(), { max: 2, onnotice: () => {} })

let runId = ''
let meetingId = ''
let itemId = ''
let needId = ''
let requestId = ''

async function remaining() {
  const [row] = await sql<{ meetings: number; talks: number; trips: number; agendas: number; items: number; needs: number; names: number; prayer: number }[]>`
    select
      (select count(*) from public.meetings where id = ${meetingId})::int as meetings,
      (select count(*) from public.program_items where meeting_id = ${meetingId})::int as talks,
      (select count(*) from public.absences where location = ${TAG})::int as trips,
      (select count(*) from public.agendas where meeting_date = ${RUN_DAY})::int as agendas,
      (select count(*) from public.agenda_items where id = ${itemId})::int as items,
      (select count(*) from public.calling_needs where id = ${needId})::int as needs,
      (select count(*) from public.calling_candidates where need_id = ${needId})::int as names,
      (select count(*) from public.prayer_roll where name = ${`${TAG} family`})::int as prayer`
  return row
}

beforeAll(async () => {
  await sql.begin(async (tx) => {
    runId = await startRun(tx)
    ;[{ id: meetingId }] = await tx<{ id: string }[]>`
      insert into public.meetings (meeting_date, meeting_type) values (${RUN_DAY}, 'regular') returning id`
    await tx`insert into public.program_items (meeting_id, position, kind, person_name, status)
      values (${meetingId}, 1, 'talk', 'Wren Calder', 'confirmed')`
    await tx`insert into public.absences (user_id, starts_on, ends_on, location) values (${BISHOP}, ${RUN_DAY}, ${RUN_DAY}, ${TAG})`
    await tx`insert into public.agendas (template_id, meeting_date)
      select id, ${RUN_DAY} from public.agenda_templates where slug = 'bishopric'`
    ;[{ id: itemId }] = await tx<{ id: string }[]>`
      insert into public.agenda_items (section_id, kind, body)
      select s.id, 'discussion', ${TAG} from public.agenda_sections s
      join public.agenda_templates t on t.id = s.template_id where t.slug = 'bishopric' limit 1
      returning id`
    ;[{ id: needId }] = await tx<{ id: string }[]>`
      insert into public.calling_needs (calling_title) values (${TAG}) returning id`
    await tx`insert into public.calling_candidates (need_id, person_name, status) values (${needId}, 'Milo Brandt', 'discussing')`
    await insertPrayerName(tx, runId, `${TAG} family`)
  })

  // Outside the run: what undo must leave alone, or only unlink.
  await sql`insert into public.meetings (meeting_date, meeting_type) values (${OTHER_DAY}, 'regular')`
  await sql`insert into public.prayer_roll (name) values (${`${TAG} other`})`
  ;[{ id: requestId }] = await sql<{ id: string }[]>`
    insert into public.requests (from_id, to_id, title, agenda_item_id)
    values (${BISHOP}, ${SECRETARY}, ${TAG}, ${itemId}) returning id`
  // A talk someone adds later goes with its meeting.
  await sql`insert into public.program_items (meeting_id, position, kind, person_name, status)
    values (${meetingId}, 2, 'talk', 'Sister Lark', 'planned')`
})

afterAll(async () => {
  await sql`delete from public.requests where id = ${requestId}`
  await sql`delete from public.meetings where meeting_date in (${RUN_DAY}, ${OTHER_DAY})`
  await sql`delete from public.absences where location = ${TAG}`
  await sql`delete from public.agendas where meeting_date = ${RUN_DAY}`
  await sql`delete from public.agenda_items where body = ${TAG}`
  await sql`delete from public.calling_needs where calling_title = ${TAG}`
  await sql`delete from public.prayer_roll where name like ${`${TAG}%`}`
  await sql.end()
})

describe('undoing a sheets import', () => {
  it('counts what would go and changes nothing on a dry run', async () => {
    const result = await undoImport(sql, runId, false)
    expect(result).toEqual({
      meetings: 1, programItems: 2, absences: 1, agendas: 1, agendaItems: 1, callings: 1, candidates: 1, prayerRoll: 1,
      changedSince: 1, linksCleared: 1,
    })
    expect(await remaining()).toEqual({ meetings: 1, talks: 2, trips: 1, agendas: 1, items: 1, needs: 1, names: 1, prayer: 1 })
  })

  it('removes only that run', async () => {
    await undoImport(sql, runId, true)
    expect(await remaining()).toEqual({ meetings: 0, talks: 0, trips: 0, agendas: 0, items: 0, needs: 0, names: 0, prayer: 0 })

    const [other] = await sql`select 1 from public.meetings where meeting_date = ${OTHER_DAY}`
    expect(other).toBeDefined()
    const [name] = await sql`select 1 from public.prayer_roll where name = ${`${TAG} other`}`
    expect(name).toBeDefined()
    const [request] = await sql<{ agenda_item_id: string | null }[]>`select agenda_item_id from public.requests where id = ${requestId}`
    expect(request.agenda_item_id).toBeNull()
  })

  it('finds nothing the second time', async () => {
    const result = await undoImport(sql, runId, true)
    expect(result.meetings + result.agendaItems + result.prayerRoll).toBe(0)
  })
})
