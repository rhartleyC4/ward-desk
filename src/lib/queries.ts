// All database access goes through here. Every function takes the client as a parameter so
// integration tests can call the exact same queries signed in as different roles.

import { addDays, type IsoDate } from './dates'
import { toPasskeyError } from './passkeys'
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

/** The bishop and counselors, in that order, for the Conducting and "Meets with" pickers. */
export async function loadBishopric(client: Client): Promise<Profile[]> {
  return must(
    await client
      .from('profiles')
      .select('id, email, display_name, short_name')
      .in('office', ['bishop', 'first_counselor', 'second_counselor'])
      .order('office'),
  )
}

/**
 * Bishopric members who aren't the bishop or a counselor (executive secretaries, clerk), who may
 * schedule appointments for them.
 */
export async function loadSecretaries(client: Client): Promise<Profile[]> {
  const ids = must(await client.from('roles').select('user_id').eq('role', 'bishopric')).map((r) => r.user_id)
  if (!ids.length) return []
  const rows = must(await client.from('profiles').select('id, email, display_name, short_name, office').in('id', ids).order('display_name'))
  return rows.filter((p) => !['bishop', 'first_counselor', 'second_counselor'].includes(p.office ?? '')).map(({ office: _o, ...p }) => p)
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

/**
 * Someone accepted: they're sustained on the given Sunday unless a date is already set, the person
 * they replace is released the same day, and their calling appointment counts as met.
 */
export async function acceptCandidate(client: Client, candidate: Pick<Candidate, 'id' | 'need_id' | 'sustain_on'>, sunday: IsoDate) {
  const on = candidate.sustain_on ?? sunday
  check(await client.from('calling_candidates').update({ status: 'accepted', sustain_on: on }).eq('id', candidate.id))
  if (candidate.need_id) {
    check(await client.from('calling_needs').update({ release_on: on }).eq('id', candidate.need_id).is('release_on', null).not('release_name', 'is', null))
  }
  check(
    await client.from('interviews').update({ status: 'completed' }).eq('candidate_id', candidate.id).eq('purpose', 'calling').eq('status', 'scheduled'),
  )
}

/** For called leaders: insert only. They can't read the row back, so don't ask for it. */
export async function submitSuggestion(client: Client, s: { calling_title: string; person_name: string; notes?: string }) {
  check(await client.from('calling_candidates').insert({ ...s, status: 'suggested' }))
}

// ---------------------------------------------------------------------------
// Appointments (assigned by the bishopric, scheduled by the executive secretaries)
// ---------------------------------------------------------------------------

export type Appointment = Tables<'interviews'>
export type SecretaryAssignment = Tables<'secretary_assignments'>

/** Open calling appointments and the ones already met, to show beside each name. */
async function loadCallingAppointments(client: Client): Promise<Appointment[]> {
  return must(await client.from('interviews').select('*').eq('purpose', 'calling').in('status', ['scheduled', 'completed']).not('candidate_id', 'is', null))
}

export async function loadAppointments(client: Client) {
  const [appointments, assignments, callings, bishopric, secretaries, profiles] = await Promise.all([
    client.from('interviews').select('*').eq('status', 'scheduled').order('scheduled_at', { nullsFirst: true }),
    client.from('secretary_assignments').select('*'),
    loadCallings(client),
    loadBishopric(client),
    loadSecretaries(client),
    loadProfiles(client),
  ])
  return { appointments: must(appointments), assignments: must(assignments), ...callings, bishopric, secretaries, profiles }
}

export type AppointmentsData = Awaited<ReturnType<typeof loadAppointments>>

/**
 * Hands a name's calling appointment to a leader, or takes it back with null. Reassigning keeps
 * any time already booked, so the secretary only reschedules if they need to.
 */
export async function assignCallingAppointment(client: Client, candidate: Pick<Candidate, 'id' | 'person_name'>, leaderId: string | null) {
  const open = maybe<{ id: string }>(
    await client.from('interviews').select('id').eq('candidate_id', candidate.id).eq('purpose', 'calling').eq('status', 'scheduled').maybeSingle(),
  )
  if (open) {
    const changes: TablesUpdate<'interviews'> = leaderId ? { interviewer_id: leaderId } : { status: 'cancelled' }
    check(await client.from('interviews').update(changes).eq('id', open.id))
  } else if (leaderId) {
    check(await client.from('interviews').insert({ candidate_id: candidate.id, interviewer_id: leaderId, person_name: candidate.person_name, purpose: 'calling' }))
  }
}

export async function updateAppointment(client: Client, id: string, changes: Pick<TablesUpdate<'interviews'>, 'scheduled_at' | 'status' | 'interviewer_id'>) {
  check(await client.from('interviews').update(changes).eq('id', id))
}

export async function addSecretary(client: Client, leaderId: string, secretaryId: string) {
  check(await client.from('secretary_assignments').insert({ leader_id: leaderId, secretary_id: secretaryId }))
}

export async function removeSecretary(client: Client, leaderId: string, secretaryId: string) {
  check(await client.from('secretary_assignments').delete().eq('leader_id', leaderId).eq('secretary_id', secretaryId))
}

// ---------------------------------------------------------------------------
// Weekly agenda
// ---------------------------------------------------------------------------

export type Agenda = Tables<'agendas'>
export type AgendaItem = Tables<'agenda_items'>
export type AgendaSection = Tables<'agenda_sections'>
export type AgendaTemplate = Tables<'agenda_templates'> & { sections: AgendaSection[] }
export type PrayerName = Tables<'prayer_roll'>

/** The meetings this user attends, each with its sections in order. RLS hides the rest. */
export async function loadAgendaTemplates(client: Client): Promise<AgendaTemplate[]> {
  const rows = must(await client.from('agenda_templates').select('*, sections:agenda_sections(*)').order('position'))
  return rows.map((t) => ({ ...t, sections: [...t.sections].sort((a, b) => a.position - b.position) }))
}

/** Everything one meeting's agenda pulls together. Sections the user can't see come back empty. */
export async function loadAgenda(client: Client, template: AgendaTemplate, date: IsoDate) {
  const horizon = addDays(date, 9 * 7)
  const [agenda, sacrament, callings, appointments, items, prayer, schedule, absences, profiles, bishopric] = await Promise.all([
    client.from('agendas').select('*').eq('template_id', template.id).eq('meeting_date', date).maybeSingle(),
    loadSacrament(client, date, horizon),
    loadCallings(client),
    loadCallingAppointments(client),
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
    appointments,
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

export async function addAppointment(client: Client, interview: TablesInsert<'interviews'>) {
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

export type Invite = Pick<Tables<'allowlist'>, 'email' | 'initial_roles' | 'initial_office' | 'created_at'>
export type InviteAccess = Pick<Invite, 'initial_roles' | 'initial_office'>

/** Everyone allowed to sign in, with the profile of those who already have. */
export async function loadAccess(client: Client) {
  const [invites, profiles] = await Promise.all([
    client.from('allowlist').select('email, initial_roles, initial_office, created_at').order('email'),
    loadProfiles(client),
  ])
  return { invites: must(invites) as Invite[], profiles }
}

export async function addInvite(client: Client, email: string, access: InviteAccess) {
  check(await client.from('allowlist').insert({ email: email.trim().toLowerCase(), ...access }))
}

/** Also changes the roles and position of an account that has already signed in. */
export async function updateInvite(client: Client, email: string, access: InviteAccess) {
  check(await client.from('allowlist').update(access).eq('email', email))
}

/** Also takes away every role and the position from an account that has already signed in. */
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
