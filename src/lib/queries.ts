// All database access goes through here. Every function takes the client as a parameter so
// integration tests can call the exact same queries signed in as different roles.

import { addDays, type IsoDate } from './dates'
import { toPasskeyError } from './passkeys'
import type { AppRole } from './access'
import type { Tables, TablesInsert, TablesUpdate } from './database.types'
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
  const [profile, roles, templates] = await Promise.all([
    client.from('profiles').select('id, email, display_name, short_name').eq('id', userId).maybeSingle(),
    client.from('roles').select('role').eq('user_id', userId),
    loadAgendaTemplates(client),
  ])
  return { profile: maybe(profile), roles: must(roles).map((r) => r.role), templates }
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
export type AgendaSection = Tables<'agenda_sections'>
export type AgendaTemplate = Tables<'agenda_templates'> & { sections: AgendaSection[] }
export type Interview = Tables<'interviews'>
export type PrayerName = Tables<'prayer_roll'>

/** The meetings this user attends, each with its sections in order. RLS hides the rest. */
export async function loadAgendaTemplates(client: Client): Promise<AgendaTemplate[]> {
  const rows = must(await client.from('agenda_templates').select('*, sections:agenda_sections(*)').order('position'))
  return rows.map((t) => ({ ...t, sections: [...t.sections].sort((a, b) => a.position - b.position) }))
}

/** Everything one meeting's agenda pulls together. Sections the user can't see come back empty. */
export async function loadAgenda(client: Client, template: AgendaTemplate, date: IsoDate) {
  const horizon = addDays(date, 9 * 7)
  const [agenda, sacrament, callings, interviews, items, prayer, schedule, absences, profiles, bishopric] = await Promise.all([
    client.from('agendas').select('*').eq('template_id', template.id).eq('meeting_date', date).maybeSingle(),
    loadSacrament(client, date, horizon),
    loadCallings(client),
    // A day either side so the time-zone conversion in agenda.ts can pick the right ones.
    client.from('interviews').select('*').gte('scheduled_at', addDays(date, -1)).lt('scheduled_at', addDays(date, 2)).order('scheduled_at'),
    client.from('agenda_items').select('*').in('section_id', template.sections.map((s) => s.id)).order('created_at'),
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
  templateId: string,
  date: IsoDate,
  fields: Pick<TablesInsert<'agendas'>, 'opening_prayer' | 'spiritual_thought' | 'closing_prayer' | 'notes'>,
) {
  check(await client.from('agendas').upsert({ template_id: templateId, meeting_date: date, ...fields }, { onConflict: 'template_id,meeting_date' }))
}

export async function addAgendaItem(client: Client, section: Pick<AgendaSection, 'id' | 'kind'>, body: string, eventDate: IsoDate | null = null) {
  // `kind` only matters to frontends from before templates; the section decides where the item shows.
  const kind = section.kind === 'calendar' ? 'calendar' : 'discussion'
  check(await client.from('agenda_items').insert({ section_id: section.id, kind, body, event_date: eventDate }))
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

// ---------------------------------------------------------------------------
// Managing meetings (agenda templates)
// ---------------------------------------------------------------------------

export type AgendaAttendee = Tables<'agenda_attendees'>
export type MeetingSetup = Awaited<ReturnType<typeof loadMeetingSetup>>
export type TemplateFields = Pick<TablesInsert<'agenda_templates'>, 'name' | 'weekday' | 'weeks_of_month' | 'start_time'>

export async function loadMeetingSetup(client: Client) {
  const [templates, attendees, profiles, bishopric] = await Promise.all([
    loadAgendaTemplates(client),
    client.from('agenda_attendees').select('*'),
    loadProfiles(client),
    client.from('roles').select('user_id').eq('role', 'bishopric'),
  ])
  // The bishopric sees every agenda already, so they aren't offered as attendees.
  return { templates, attendees: must(attendees), profiles, bishopricIds: must(bishopric).map((r) => r.user_id) }
}

export async function createAgendaTemplate(client: Client, template: TemplateFields & { slug: string; position: number }) {
  check(await client.from('agenda_templates').insert(template))
}

export async function updateAgendaTemplate(client: Client, id: string, changes: TemplateFields) {
  check(await client.from('agenda_templates').update(changes).eq('id', id))
}

/** Refused for the bishopric meeting and for any meeting that already has agendas or items. */
export async function deleteAgendaTemplate(client: Client, id: string) {
  check(await client.rpc('delete_agenda_template', { template: id }))
}

export async function addAgendaSection(client: Client, section: Pick<TablesInsert<'agenda_sections'>, 'template_id' | 'position' | 'kind' | 'title'>) {
  check(await client.from('agenda_sections').insert(section))
}

export async function renameAgendaSection(client: Client, id: string, title: string) {
  check(await client.from('agenda_sections').update({ title }).eq('id', id))
}

/** Saves a meeting's sections in this order. */
export async function reorderAgendaSections(client: Client, templateId: string, sectionIds: string[]) {
  check(await client.rpc('reorder_agenda_sections', { template: templateId, section_ids: sectionIds }))
}

/** Refused while the section has open items; its resolved items are removed with it. */
export async function deleteAgendaSection(client: Client, id: string) {
  check(await client.rpc('delete_agenda_section', { section: id }))
}

export async function addAttendee(client: Client, templateId: string, userId: string) {
  check(await client.from('agenda_attendees').insert({ template_id: templateId, user_id: userId }))
}

export async function removeAttendee(client: Client, templateId: string, userId: string) {
  check(await client.from('agenda_attendees').delete().eq('template_id', templateId).eq('user_id', userId))
}

// ---------------------------------------------------------------------------
// Sign-in access (admins only)
// ---------------------------------------------------------------------------

export type Invite = Pick<Tables<'allowlist'>, 'email' | 'initial_roles' | 'created_at'>

/** Everyone allowed to sign in, with the profile of those who already have. */
export async function loadAccess(client: Client) {
  const [invites, profiles] = await Promise.all([
    client.from('allowlist').select('email, initial_roles, created_at').order('email'),
    loadProfiles(client),
  ])
  return { invites: must(invites) as Invite[], profiles }
}

export async function addInvite(client: Client, email: string, roles: AppRole[]) {
  check(await client.from('allowlist').insert({ email: email.trim().toLowerCase(), initial_roles: roles }))
}

/** Also changes the roles of an account that has already signed in. */
export async function setInviteRoles(client: Client, email: string, roles: AppRole[]) {
  check(await client.from('allowlist').update({ initial_roles: roles }).eq('email', email))
}

/** Also takes away every role from an account that has already signed in. */
export async function removeInvite(client: Client, email: string) {
  check(await client.from('allowlist').delete().eq('email', email))
}

// ---------------------------------------------------------------------------
// Passkeys (Face ID / fingerprint sign-in)
// ---------------------------------------------------------------------------

export type Passkey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string }

/** Signs in with a passkey already saved on this device. Returns the signed-in user's id. */
export async function signInWithPasskey(client: Client): Promise<string> {
  const { data, error } = await client.auth.signInWithPasskey()
  if (error) throw toPasskeyError(error)
  return data.user?.id ?? ''
}

/** Saves a passkey on this device for the signed-in user, named after the device. */
export async function registerPasskey(client: Client, name: string) {
  const { data, error } = await client.auth.registerPasskey()
  if (error) throw toPasskeyError(error)
  if (!data.friendly_name) check(await client.auth.passkey.update({ passkeyId: data.id, friendlyName: name }))
}

export async function listPasskeys(client: Client): Promise<Passkey[]> {
  return must(await client.auth.passkey.list())
}

export async function deletePasskey(client: Client, id: string) {
  check(await client.auth.passkey.delete({ passkeyId: id }))
}
