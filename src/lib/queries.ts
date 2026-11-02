// All database access goes through here. Every function takes the client as a parameter so
// integration tests can call the exact same queries signed in as different roles.

import { addDays, type IsoDate } from './dates'
import type { Enums, Tables, TablesInsert, TablesUpdate } from './database.types'
import type { Client } from './supabase'

type Result<T> = { data: T; error: { message: string } | null }

/** Unwraps a query result, throwing its error. A null `data` only happens alongside an error. */
function must<T>({ data, error }: Result<T>): NonNullable<T> {
  if (error) throw new Error(error.message)
  return data as NonNullable<T>
}

/** For maybeSingle(): no row is a normal result, not an error. */
function maybe<T>({ data, error }: Result<T | null>): T | null {
  if (error) throw new Error(error.message)
  return data
}

function check({ error }: { error: { message: string } | null }): void {
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export type Profile = Pick<Tables<'profiles'>, 'id' | 'email' | 'display_name' | 'short_name'>

export async function loadMe(client: Client, userId: string) {
  const [profile, roles] = await Promise.all([
    client.from('profiles').select('id, email, display_name, short_name').eq('id', userId).maybeSingle(),
    client.from('roles').select('role').eq('user_id', userId),
  ])
  return { profile: maybe(profile), roles: must(roles).map((r) => r.role) }
}

export async function loadProfiles(client: Client): Promise<Profile[]> {
  return must(await client.from('profiles').select('id, email, display_name, short_name').order('display_name'))
}

/** Bishopric members, for the Conducting and interviewer pickers. */
/** The bishop and counselors, in that order, for the Conducting and Interviewer pickers. */
export async function loadBishopric(client: Client): Promise<Profile[]> {
  return must(
    await client
      .from('profiles')
      .select('id, email, display_name, short_name')
      .in('office', ['bishop', 'first_counselor', 'second_counselor'])
      .order('office'),
  )
}

// ---------------------------------------------------------------------------
// Sacrament meetings
// ---------------------------------------------------------------------------

export type Meeting = Tables<'meetings'>
export type ProgramItem = Tables<'program_items'>
export type ProgramItemDraft = Omit<TablesInsert<'program_items'>, 'meeting_id' | 'position'>
export type Absence = Tables<'absences'>

export async function loadSacrament(client: Client, from: IsoDate, to: IsoDate) {
  const meetings = must(await client.from('meetings').select('*').gte('meeting_date', from).lte('meeting_date', to).order('meeting_date'))
  const ids = meetings.map((m) => m.id)
  const [items, absences] = await Promise.all([
    ids.length ? client.from('program_items').select('*').in('meeting_id', ids).order('position') : Promise.resolve({ data: [], error: null }),
    client.from('absences').select('*').lte('starts_on', to).gte('ends_on', from),
  ])
  return { meetings, items: must(items) as ProgramItem[], absences: must(absences) }
}

/** Saves a Sunday and replaces its program, keeping the order given. */
export async function saveMeeting(
  client: Client,
  meeting: TablesInsert<'meetings'> & { meeting_date: IsoDate },
  items: ProgramItemDraft[],
): Promise<Meeting> {
  const saved = must(await client.from('meetings').upsert(meeting, { onConflict: 'meeting_date' }).select('*').single())
  check(await client.from('program_items').delete().eq('meeting_id', saved.id))
  if (items.length) {
    check(
      await client.from('program_items').insert(
        items.map(({ id: _id, created_at: _c, ...item }, i) => ({ ...item, meeting_id: saved.id, position: i + 1 })),
        // In a multi-row insert, a column missing from some rows would otherwise be sent as NULL instead of its default.
        { defaultToNull: false },
      ),
    )
  }
  return saved
}

export async function deleteMeeting(client: Client, id: string): Promise<void> {
  check(await client.from('meetings').delete().eq('id', id))
}

// ---------------------------------------------------------------------------
// Away dates
// ---------------------------------------------------------------------------

export async function loadAbsences(client: Client, from: IsoDate): Promise<Absence[]> {
  return must(await client.from('absences').select('*').gte('ends_on', from).order('starts_on'))
}

export async function addAbsence(client: Client, absence: Pick<TablesInsert<'absences'>, 'starts_on' | 'ends_on' | 'location'>) {
  check(await client.from('absences').insert(absence))
}

export async function deleteAbsence(client: Client, id: string) {
  check(await client.from('absences').delete().eq('id', id))
}

// ---------------------------------------------------------------------------
// Standing schedule
// ---------------------------------------------------------------------------

export async function loadSchedule(client: Client) {
  const [events, rotations, stewardships] = await Promise.all([
    client.from('recurring_events').select('*').order('weekday').order('week_of_month').order('start_time'),
    client.from('rotations').select('*').order('title'),
    client.from('stewardships').select('*').order('area'),
  ])
  return { events: must(events), rotations: must(rotations), stewardships: must(stewardships) }
}

// ---------------------------------------------------------------------------
// Callings
// ---------------------------------------------------------------------------

export type CallingNeed = Tables<'calling_needs'>
export type Candidate = Tables<'calling_candidates'>

export async function loadCallings(client: Client) {
  const [needs, candidates] = await Promise.all([
    client.from('calling_needs').select('*').order('created_at'),
    client.from('calling_candidates').select('*').order('created_at'),
  ])
  return { needs: must(needs), candidates: must(candidates) }
}

export async function addNeed(client: Client, need: TablesInsert<'calling_needs'>) {
  check(await client.from('calling_needs').insert(need))
}

export async function updateNeed(client: Client, id: string, changes: TablesUpdate<'calling_needs'>) {
  check(await client.from('calling_needs').update(changes).eq('id', id))
}

export async function addCandidate(client: Client, candidate: TablesInsert<'calling_candidates'>) {
  check(await client.from('calling_candidates').insert(candidate))
}

export async function updateCandidate(client: Client, id: string, changes: TablesUpdate<'calling_candidates'>) {
  check(await client.from('calling_candidates').update(changes).eq('id', id))
}

/** For called leaders: insert only. They can't read the row back, so don't ask for it. */
export async function submitSuggestion(client: Client, s: { calling_title: string; person_name: string; notes?: string }) {
  check(await client.from('calling_candidates').insert({ ...s, status: 'suggested' }))
}

// ---------------------------------------------------------------------------
// Weekly agenda
// ---------------------------------------------------------------------------

export type Agenda = Tables<'agendas'>
export type AgendaItem = Tables<'agenda_items'>
export type Interview = Tables<'interviews'>
export type PrayerName = Tables<'prayer_roll'>

/** Everything the agenda for one Sunday pulls together. */
export async function loadAgenda(client: Client, date: IsoDate) {
  const horizon = addDays(date, 9 * 7)
  const [agenda, sacrament, callings, interviews, items, prayer, schedule, absences, profiles, bishopric] = await Promise.all([
    client.from('agendas').select('*').eq('meeting_date', date).maybeSingle(),
    loadSacrament(client, date, horizon),
    loadCallings(client),
    // A day either side so the time-zone conversion in agenda.ts can pick the right ones.
    client.from('interviews').select('*').gte('scheduled_at', addDays(date, -1)).lt('scheduled_at', addDays(date, 2)).order('scheduled_at'),
    client.from('agenda_items').select('*').order('created_at'),
    client.from('prayer_roll').select('*').is('removed_on', null).order('added_on'),
    loadSchedule(client),
    loadAbsences(client, addDays(date, -7)),
    loadProfiles(client),
    loadBishopric(client),
  ])
  return {
    agenda: maybe(agenda),
    ...sacrament,
    ...callings,
    interviews: must(interviews),
    agendaItems: must(items),
    prayerRoll: must(prayer),
    ...schedule,
    absences,
    profiles,
    bishopric,
  }
}

export type AgendaData = Awaited<ReturnType<typeof loadAgenda>>

export async function saveAgendaHeader(
  client: Client,
  date: IsoDate,
  fields: Pick<TablesInsert<'agendas'>, 'opening_prayer' | 'spiritual_thought' | 'closing_prayer' | 'notes'>,
) {
  check(await client.from('agendas').upsert({ meeting_date: date, ...fields }, { onConflict: 'meeting_date' }))
}

export async function addAgendaItem(client: Client, item: { kind: Enums<'agenda_item_kind'>; body: string; event_date?: IsoDate | null }) {
  check(await client.from('agenda_items').insert(item))
}

export async function resolveAgendaItem(client: Client, id: string, on: IsoDate) {
  check(await client.from('agenda_items').update({ resolved_on: on }).eq('id', id))
}

export async function addInterview(client: Client, interview: TablesInsert<'interviews'>) {
  check(await client.from('interviews').insert(interview))
}

export async function addPrayerName(client: Client, name: string) {
  check(await client.from('prayer_roll').insert({ name }))
}

export async function removePrayerName(client: Client, id: string, on: IsoDate) {
  check(await client.from('prayer_roll').update({ removed_on: on }).eq('id', id))
}
