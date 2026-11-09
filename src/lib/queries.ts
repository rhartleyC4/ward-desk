// All database access goes through here. Every function takes the client as a parameter so
// integration tests can call the exact same queries signed in as different roles.

import type { AgendaAssignment, AssignmentAnswer, AssignmentChange, MyAssignment } from './assignments'
import type { Block, DayChange, UsualHours } from './availability'
import { tidyTitle, type ListedCalling } from './callings'
import type { MessageTemplate } from './messages'
import type { NotificationKind } from './notifications'
import { addDays, upcomingSunday, type IsoDate } from './dates'
import { cleanName } from './names'
import type { ErrorReport } from './errorReport'
import { toPasskeyError } from './passkeys'
import type { CallingRequest, CallingRequestKind, MyCallingRequest, Recipient, Request, RequestStatus } from './requests'
import type { Enums, Tables, TablesInsert, TablesUpdate } from './database.types'
import type { Client } from './supabase'
import { leavingPayload, organizationsOf, seatsPayload, type Leaving, type Seats, type Work } from './leadership'
import { leaderHomeCount, meetingsCount, sacramentCount, secretaryHomeCount, type TabCounts } from './tabCounts'

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
  const [profile, roles, templates, hours] = await Promise.all([
    client.from('profiles').select('id, email, display_name, short_name, office, organization').eq('id', userId).maybeSingle(),
    client.from('roles').select('role').eq('user_id', userId),
    loadAgendaTemplates(client),
    client.from('availability').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ])
  const row = maybe(profile)
  return {
    profile: row && { id: row.id, email: row.email, display_name: row.display_name, short_name: row.short_name },
    office: row?.office ?? null,
    organization: row?.organization ?? null,
    roles: must(roles).map((r) => r.role),
    templates,
    // RLS hides hours from anyone outside the bishopric, who keep none anyway.
    hasHours: (hours.count ?? 0) > 0,
  }
}

export async function loadProfiles(client: Client): Promise<Profile[]> {
  return must(await client.from('profiles').select('id, email, display_name, short_name').order('display_name'))
}

/** Changes the signed-in person's own name (1-60 characters, trimmed) and returns it as saved. */
export async function updateMyName(client: Client, userId: string, name: string): Promise<string> {
  const row = must(await client.from('profiles').update({ display_name: cleanName(name) }).eq('id', userId).select('display_name').single())
  return row.display_name ?? ''
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
export type Secretary = Profile & { office: Tables<'profiles'>['office'] }

export async function loadSecretaries(client: Client): Promise<Secretary[]> {
  const ids = must(await client.from('roles').select('user_id').eq('role', 'bishopric')).map((r) => r.user_id)
  if (!ids.length) return []
  const rows = must(await client.from('profiles').select('id, email, display_name, short_name, office').in('id', ids).order('display_name'))
  return rows.filter((p) => !['bishop', 'first_counselor', 'second_counselor'].includes(p.office ?? ''))
}

// ---------------------------------------------------------------------------
// Appointment hours
// ---------------------------------------------------------------------------

/** Everyone's usual hours, the changed dates and away dates in a range, and who keeps hours. */
export async function loadHours(client: Client, from: IsoDate, to: IsoDate) {
  const [hours, changes, absences, leaders] = await Promise.all([
    client.from('availability').select('id, user_id, weekday, starts_at, ends_at'),
    client.from('availability_changes').select('id, user_id, on_date, starts_at, ends_at').gte('on_date', from).lte('on_date', to),
    client.from('absences').select('*').lte('starts_on', to).gte('ends_on', from),
    loadBishopric(client),
  ])
  return { hours: must(hours) as UsualHours[], changes: must(changes) as DayChange[], absences: must(absences), leaders }
}

export async function addUsualHours(client: Client, userId: string, weekday: number, block: Block) {
  check(await client.from('availability').insert({ user_id: userId, weekday, ...block }))
}

export async function deleteUsualHours(client: Client, id: string) {
  check(await client.from('availability').delete().eq('id', id))
}

/** Adds a block of time on one date; the date's usual hours no longer apply. */
export async function addDayHours(client: Client, userId: string, date: IsoDate, block: Block) {
  // Different hours mean the leader is available after all.
  check(await client.from('availability_changes').delete().eq('user_id', userId).eq('on_date', date).is('starts_at', null))
  check(await client.from('availability_changes').insert({ user_id: userId, on_date: date, ...block }))
}

/** Marks a leader not available on a date, dropping any changed hours for it. */
export async function markDayOff(client: Client, userId: string, date: IsoDate) {
  await resetDay(client, userId, date)
  check(await client.from('availability_changes').insert({ user_id: userId, on_date: date }))
}

/** Back to the usual hours for a date. */
export async function resetDay(client: Client, userId: string, date: IsoDate) {
  check(await client.from('availability_changes').delete().eq('user_id', userId).eq('on_date', date))
}

// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------

export async function loadTemplates(client: Client): Promise<MessageTemplate[]> {
  return must(await client.from('message_templates').select('id, name, kind, audience, body').order('kind').order('audience').order('name'))
}

/** Adds a template, or changes one when an id is given. */
export async function saveTemplate(client: Client, template: Omit<MessageTemplate, 'id'> & { id?: string }) {
  const { id, ...fields } = template
  const row = { ...fields, name: fields.name.trim() }
  check(id ? await client.from('message_templates').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id) : await client.from('message_templates').insert(row))
}

export async function deleteTemplate(client: Client, id: string) {
  check(await client.from('message_templates').delete().eq('id', id))
}

/** Records the times sent to choose from, so the list can say they were offered. */
export async function markOffered(client: Client, id: string, times: string[]) {
  check(await client.from('interviews').update({ offered_at: new Date().toISOString(), offered_times: times }).eq('id', id))
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
    client.from('rotations').select('*').order('title').order('created_at'),
    client.from('stewardships').select('*').order('area'),
  ])
  return { events: must(events), rotations: must(rotations), stewardships: must(stewardships) }
}

export type StandingEvent = Tables<'recurring_events'>
export type StandingRotation = Tables<'rotations'>
export type EventDraft = Pick<StandingEvent, 'title' | 'weekday' | 'week_of_month' | 'start_time' | 'reminder_by' | 'agenda_template_id'>
export type RotationDraft = Pick<StandingRotation, 'title' | 'months' | 'assignee_id' | 'assignee_label' | 'weekday' | 'week_of_month'>

/** Every rotation, for Home and the day-ahead summary. */
export async function loadRotations(client: Client): Promise<StandingRotation[]> {
  return must(await client.from('rotations').select('*').order('title').order('created_at'))
}

/** Adds a regular meeting, or changes one when `id` is given. */
export async function saveEvent(client: Client, event: EventDraft, id?: string) {
  check(id ? await client.from('recurring_events').update(event).eq('id', id) : await client.from('recurring_events').insert(event))
}

export async function deleteEvent(client: Client, id: string) {
  check(await client.from('recurring_events').delete().eq('id', id))
}

/** Adds a rotation, or changes one when `id` is given. */
export async function saveRotation(client: Client, rotation: RotationDraft, id?: string) {
  check(id ? await client.from('rotations').update(rotation).eq('id', id) : await client.from('rotations').insert(rotation))
}

export async function deleteRotation(client: Client, id: string) {
  check(await client.from('rotations').delete().eq('id', id))
}

export async function addStewardship(client: Client, userId: string, area: string) {
  check(await client.from('stewardships').insert({ user_id: userId, area: area.trim() }))
}

export async function deleteStewardship(client: Client, id: string) {
  check(await client.from('stewardships').delete().eq('id', id))
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

/** The titles the Calling box suggests. Bishopric, admins and called leaders can read it. */
export async function loadCallingList(client: Client): Promise<ListedCalling[]> {
  return must(await client.from('callings').select('id, title, organization').order('title'))
}

/** Admins only. A calling to fill with a new title also joins the list, through a trigger. */
export async function addToCallingList(client: Client, calling: { title: string; organization: string | null }) {
  check(await client.from('callings').insert({ ...calling, title: tidyTitle(calling.title) }))
}

/** Admins only. Renaming also renames the open callings to fill that use the title. */
export async function updateCallingListEntry(client: Client, id: string, changes: { title?: string; organization?: string | null }) {
  check(await client.from('callings').update(changes.title === undefined ? changes : { ...changes, title: tidyTitle(changes.title) }).eq('id', id))
}

/**
 * Admins only. Folds a stray title into the right one: open callings and unsorted suggestions take
 * the right title, filled ones keep theirs, and the stray entry leaves the list.
 */
export async function mergeCalling(client: Client, strayId: string, keepId: string) {
  check(await client.rpc('merge_calling', { stray_id: strayId, keep_id: keepId }))
}

/** Admins only. Callings already entered keep their title. */
export async function removeFromCallingList(client: Client, id: string) {
  check(await client.from('callings').delete().eq('id', id))
}

export async function addNeed(client: Client, need: TablesInsert<'calling_needs'>) {
  check(await client.from('calling_needs').insert(need))
}

export async function updateNeed(client: Client, id: string, changes: TablesUpdate<'calling_needs'>) {
  check(await client.from('calling_needs').update(changes).eq('id', id))
}

/**
 * Removes a calling and the names considered for it. Open appointments for those names are
 * cancelled first; the cascade would otherwise leave them on the secretaries' list with no name.
 */
export async function deleteNeed(client: Client, id: string) {
  const ids = must(await client.from('calling_candidates').select('id').eq('need_id', id)).map((c) => c.id)
  if (ids.length) {
    check(await client.from('interviews').update({ status: 'cancelled' }).in('candidate_id', ids).eq('purpose', 'calling').eq('status', 'scheduled'))
  }
  check(await client.from('calling_needs').delete().eq('id', id))
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

/** They were set apart on this day, which completes the calling. */
export async function setApart(client: Client, candidateId: string, on: IsoDate) {
  check(await client.from('calling_candidates').update({ status: 'set_apart', set_apart_on: on }).eq('id', candidateId))
}

/** For called leaders: insert only. They can't read the row back, so don't ask for it. */
export async function submitSuggestion(client: Client, s: { calling_title: string; person_name: string; notes?: string }) {
  check(await client.from('calling_candidates').insert({ ...s, status: 'suggested' }))
}

// ---------------------------------------------------------------------------
// Requests (the bishopric asks someone to do something) and calling requests (from ward leaders)
// ---------------------------------------------------------------------------

/** Every request this user can see: sent to them, sent by them, and (bishopric) the bishopric's own. */
export async function loadRequests(client: Client): Promise<Request[]> {
  return must(await client.from('requests').select('*').order('created_at', { ascending: false }))
}

/** Who the picker offers. Bishopric only; empty for anyone else. */
export async function loadRecipients(client: Client): Promise<Recipient[]> {
  return must(await client.rpc('request_recipients'))
}

export type RequestDraft = Pick<TablesInsert<'requests'>, 'to_id' | 'title' | 'details' | 'due_on' | 'agenda_item_id'>

/** Sends a request and returns its id, so the caller can notify the person. */
export async function sendRequest(client: Client, draft: RequestDraft): Promise<string> {
  const row = must(await client.from('requests').insert({ ...draft, title: draft.title.trim(), details: draft.details?.trim() || null }).select('id').single())
  return row.id
}

/** The person asked answers: seen, done, or can't do it, with an optional note. */
export async function answerRequest(client: Client, id: string, status: Exclude<RequestStatus, 'sent'>, reply?: string | null) {
  const changes: TablesUpdate<'requests'> = { status }
  if (reply !== undefined) changes.reply = reply?.trim() || null
  check(await client.from('requests').update(changes).eq('id', id))
}

/** The sender rewords it, changes the date, or hands it to someone else (which starts it over). */
export async function updateRequest(client: Client, id: string, changes: Pick<TablesUpdate<'requests'>, 'to_id' | 'title' | 'details' | 'due_on'>) {
  check(await client.from('requests').update(changes).eq('id', id))
}

export async function deleteRequest(client: Client, id: string) {
  check(await client.from('requests').delete().eq('id', id))
}

/** Bishopric only: every calling request, newest first. */
export async function loadCallingRequests(client: Client): Promise<CallingRequest[]> {
  return must(await client.from('calling_requests').select('*').order('created_at', { ascending: false }))
}

export async function receiveCallingRequest(client: Client, id: string, userId: string) {
  check(await client.from('calling_requests').update({ received_by: userId, received_at: new Date().toISOString() }).eq('id', id).is('received_at', null))
}

export type CallingRequestDraft = {
  kind: CallingRequestKind
  calling_title: string
  organization?: string | null
  release_name?: string | null
  needed_by?: IsoDate | null
  notes?: string | null
  names?: string[]
}

/** A ward leader's request. It also adds the calling to the bishopric's list; returns the request's id. */
export async function submitCallingRequest(client: Client, r: CallingRequestDraft): Promise<string> {
  return must(
    await client.rpc('submit_calling_request', {
      request_kind: r.kind,
      title: r.calling_title,
      org: r.organization ?? undefined,
      releasing: r.release_name ?? undefined,
      needed: r.needed_by ?? undefined,
      request_notes: r.notes ?? undefined,
      names: r.names ?? [],
    }),
  )
}

/** A leader's own calling requests and how far along each one is. */
export async function loadMyCallingRequests(client: Client): Promise<MyCallingRequest[]> {
  return must(await client.rpc('my_calling_requests'))
}

/**
 * Unread requests for this person, meeting assignments they haven't answered, plus (bishopric)
 * calling requests sent to them and not received.
 */
export async function countWaiting(client: Client, userId: string, bishopric: boolean, today: IsoDate): Promise<number> {
  const [requests, assignments, calling] = await Promise.all([
    client.from('requests').select('id', { count: 'exact', head: true }).eq('to_id', userId).eq('status', 'sent'),
    client.from('agenda_assignments').select('id', { count: 'exact', head: true }).eq('assignee_id', userId).eq('status', 'asked').gte('meeting_date', today),
    bishopric ? client.from('calling_requests').select('id', { count: 'exact', head: true }).is('received_at', null).contains('routed_to', [userId]) : null,
  ])
  check(requests)
  check(assignments)
  if (calling) check(calling)
  return (requests.count ?? 0) + (assignments.count ?? 0) + (calling?.count ?? 0)
}

/** What to count on the tab bar, from who this person is. Each part is loaded only when they have that tab. */
export type TabCountsFor = {
  userId: string
  /** The bishopric: calling requests routed to them count on Requests. */
  bishopric: boolean
  home: 'leader' | 'secretary' | null
  /** Sorts calling suggestions on the bishopric agenda. */
  callings: boolean
  /** Plans sacrament meeting. */
  sacrament: boolean
  today: IsoDate
  now: Date
}

/** The count for each main tab's badge. Tabs with nothing to count are left out. */
export async function loadTabCounts(client: Client, who: TabCountsFor): Promise<TabCounts> {
  const sunday = upcomingSunday(who.today)
  const [requests, home, meetings, sacrament] = await Promise.all([
    countWaiting(client, who.userId, who.bishopric, who.today),
    who.home === 'leader'
      ? client
          .from('interviews')
          .select('id, interviewer_id, scheduled_at, duration_minutes, status, confirmed_at, reminded_at')
          .eq('interviewer_id', who.userId)
          .eq('status', 'scheduled')
          .not('scheduled_at', 'is', null)
          .then((r) => leaderHomeCount(who.userId, must(r), who.now))
      : who.home === 'secretary'
        ? Promise.all([client.from('interviews').select('*').eq('status', 'scheduled'), client.from('secretary_assignments').select('*'), loadBishopric(client), loadSecretaries(client)]).then(
            ([appointments, assignments, bishopric, secretaries]) =>
              secretaryHomeCount(who.userId, { appointments: must(appointments), assignments: must(assignments), bishopric, secretaries }, who.now),
          )
        : null,
    who.callings
      ? Promise.all([
          client.from('calling_candidates').select('need_id, status, request_id').is('need_id', null).eq('status', 'suggested'),
          client.from('calling_requests').select('id').is('received_at', null),
        ]).then(([candidates, unreceived]) => meetingsCount(must(candidates), must(unreceived).map((r) => r.id)))
      : null,
    who.sacrament
      ? Promise.all([loadSundays(client, sunday, sunday), client.from('absences').select('*').lte('starts_on', sunday).gte('ends_on', sunday)]).then(([meetings, absences]) =>
          sacramentCount(sunday, meetings[0], must(absences)),
        )
      : null,
  ])
  const counts: TabCounts = { '/requests': requests }
  if (home !== null) counts['/home'] = home
  if (meetings !== null) counts['/agenda'] = meetings
  if (sacrament !== null) counts['/sacrament'] = sacrament
  return counts
}

export type PushEvent = 'request_sent' | 'request_answered' | 'calling_request_sent' | 'calling_request_received' | 'assignment_sent' | 'assignment_answered'

/**
 * Asks the push function to notify whoever this change concerns. Best effort: a phone that misses
 * it still sees the request in the app, so a failure here is logged, never shown.
 */
export async function pushAbout(client: Client, event: PushEvent, id: string): Promise<void> {
  try {
    const { error } = await client.functions.invoke('push', { body: { event, id } })
    if (error) console.warn('Notification not sent:', error.message)
  } catch (e) {
    console.warn('Notification not sent:', (e as Error).message)
  }
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
    const duration_minutes = await lengthFor(client, 'calling')
    check(await client.from('interviews').insert({ candidate_id: candidate.id, interviewer_id: leaderId, person_name: candidate.person_name, purpose: 'calling', duration_minutes }))
  }
}

export async function updateAppointment(client: Client, id: string, changes: Pick<TablesUpdate<'interviews'>, 'scheduled_at' | 'status' | 'interviewer_id' | 'duration_minutes' | 'is_youth' | 'parent_name'>) {
  check(await client.from('interviews').update(changes).eq('id', id))
}

/** How an appointment went, reported by the leader who held it. */
export type Report =
  | { outcome: 'done' }
  /** They didn't come, and the secretary should find a new time. */
  | { outcome: 'reschedule'; note: string | null }
  /** They didn't come, and the leader will handle it. */
  | { outcome: 'handled'; note: string }

export async function reportAppointment(client: Client, appointment: Pick<Appointment, 'id' | 'scheduled_at'>, report: Report, userId: string) {
  const reported = { reported_at: new Date().toISOString(), reported_by: userId }
  const changes: TablesUpdate<'interviews'> =
    report.outcome === 'done'
      ? { ...reported, status: 'completed' }
      : report.outcome === 'reschedule'
        ? // Back to the secretary's list. Offered times are let go, since they were for the old time.
          { ...reported, missed_at: appointment.scheduled_at, report_note: report.note?.trim() || null, scheduled_at: null, offered_at: null, offered_times: [] }
        : { ...reported, missed_at: appointment.scheduled_at, report_note: report.note.trim(), status: 'cancelled' }
  // Only while it's still open, so two reports at once can't both apply.
  check(await client.from('interviews').update(changes).eq('id', appointment.id).eq('status', 'scheduled'))
}

/** Records that the person was sent their confirmation (or told another way). */
export async function markConfirmed(client: Client, id: string) {
  check(await client.from('interviews').update({ confirmed_at: new Date().toISOString() }).eq('id', id))
}

/** Records the day-before reminder, or with `false` takes it back. */
export async function markReminded(client: Client, id: string, sent = true) {
  check(await client.from('interviews').update({ reminded_at: sent ? new Date().toISOString() : null }).eq('id', id))
}

/** Standing meetings, the reminders already sent for a date, and that date's agendas (for who has the prayers). */
export async function loadMeetingReminders(client: Client, date: IsoDate) {
  const [events, sent, agendas] = await Promise.all([
    client.from('recurring_events').select('id, title, weekday, week_of_month, start_time, reminder_by, agenda_template_id'),
    client.from('meeting_reminders').select('event_id, for_date').eq('for_date', date),
    client.from('agendas').select('template_id, opening_prayer, spiritual_thought, closing_prayer').eq('meeting_date', date),
  ])
  return { events: must(events), sent: must(sent), agendas: must(agendas) }
}

export async function markMeetingReminded(client: Client, eventId: string, date: IsoDate, sent = true) {
  check(
    sent
      ? await client.from('meeting_reminders').upsert({ event_id: eventId, for_date: date }, { onConflict: 'event_id,for_date', ignoreDuplicates: true })
      : await client.from('meeting_reminders').delete().eq('event_id', eventId).eq('for_date', date),
  )
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

/** Sacrament meetings in a range with who's conducting, without their programs. */
export async function loadSundays(client: Client, from: IsoDate, to: IsoDate) {
  return must(await client.from('meetings').select('meeting_date, meeting_type, title, conducting_id').gte('meeting_date', from).lte('meeting_date', to).order('meeting_date'))
}

/** Unresolved items in these sections, to count what's waiting on each upcoming agenda. */
export async function loadOpenAgendaItems(client: Client, sectionIds: string[]): Promise<AgendaItem[]> {
  if (!sectionIds.length) return []
  return must(await client.from('agenda_items').select('*').in('section_id', sectionIds).is('resolved_on', null))
}

/** Everything one meeting's agenda pulls together. Sections the user can't see come back empty. */
export async function loadAgenda(client: Client, template: AgendaTemplate, date: IsoDate) {
  const horizon = addDays(date, 9 * 7)
  const [agenda, assignments, assignees, sacrament, callings, callingList, appointments, items, prayer, schedule, absences, profiles, bishopric, requests, callingRequests, recipients] = await Promise.all([
    client.from('agendas').select('*').eq('template_id', template.id).eq('meeting_date', date).maybeSingle(),
    client.from('agenda_assignments').select('*').eq('template_id', template.id).eq('meeting_date', date),
    loadAssignees(client),
    loadSacrament(client, date, horizon),
    loadCallings(client),
    loadCallingList(client),
    loadCallingAppointments(client),
    client.from('agenda_items').select('*').in('section_id', template.sections.map((s) => s.id)).order('created_at'),
    client.from('prayer_roll').select('*').is('removed_on', null).order('added_on'),
    loadSchedule(client),
    loadAbsences(client, addDays(date, -7)),
    loadProfiles(client),
    loadBishopric(client),
    // RLS limits both: requests to the ones this user is part of (or the bishopric's own), and
    // calling requests to the bishopric.
    loadRequests(client),
    loadCallingRequests(client),
    loadRecipients(client),
  ])
  return {
    requests,
    callingRequests,
    recipients,
    agenda: maybe(agenda),
    assignments: must(assignments) as AgendaAssignment[],
    assignees,
    ...sacrament,
    ...callings,
    callingList,
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

// ---------------------------------------------------------------------------
// Meeting assignments (prayers and the spiritual thought)
// ---------------------------------------------------------------------------

/** Everyone who can sign in, bishopric first, for the assignment picker. Empty for anyone who attends no meeting. */
export async function loadAssignees(client: Client): Promise<Recipient[]> {
  return must(await client.rpc('meeting_assignees'))
}

/**
 * Gives each changed part to its new person, or takes it away. Returns the ids of the ones now
 * waiting on someone's answer, so the caller can notify them.
 */
export async function saveAssignments(client: Client, templateId: string, date: IsoDate, changes: AssignmentChange[]): Promise<string[]> {
  const asked: string[] = []
  for (const { part, to } of changes) {
    const match = { template_id: templateId, meeting_date: date, part }
    if (!to) {
      check(await client.from('agenda_assignments').delete().match(match))
      continue
    }
    const existing = maybe<{ id: string }>(await client.from('agenda_assignments').select('id').match(match).maybeSingle())
    const row = existing
      ? must(await client.from('agenda_assignments').update({ assignee_id: to }).eq('id', existing.id).select('id, status').single())
      : must(await client.from('agenda_assignments').insert({ ...match, assignee_id: to }).select('id, status').single())
    if (row.status === 'asked') asked.push(row.id)
  }
  return asked
}

/** This person's own assignments, with each meeting's name and time. */
export async function loadMyAssignments(client: Client): Promise<MyAssignment[]> {
  return must(await client.rpc('my_meeting_assignments'))
}

/** The person asked accepts or declines, with an optional note. */
export async function answerAssignment(client: Client, id: string, status: Exclude<AssignmentAnswer, 'asked'>, reply: string | null = null) {
  check(await client.from('agenda_assignments').update({ status, reply: reply?.trim() || null }).eq('id', id))
}

export async function addAgendaItem(client: Client, section: Pick<AgendaSection, 'id' | 'kind'>, body: string, eventDate: IsoDate | null = null) {
  // `kind` only matters to frontends from before templates; the section decides where the item shows.
  const kind = section.kind === 'calendar' ? 'calendar' : 'discussion'
  check(await client.from('agenda_items').insert({ section_id: section.id, kind, body, event_date: eventDate }))
}

export async function resolveAgendaItem(client: Client, id: string, on: IsoDate) {
  check(await client.from('agenda_items').update({ resolved_on: on }).eq('id', id))
}

/** Adds an appointment, starting at the usual length for its kind unless one is given. */
export async function addAppointment(client: Client, interview: TablesInsert<'interviews'>) {
  const duration_minutes = interview.duration_minutes ?? (await lengthFor(client, interview.purpose ?? 'other'))
  check(await client.from('interviews').insert({ ...interview, duration_minutes }))
}

export type AppointmentLength = Pick<Tables<'appointment_lengths'>, 'purpose' | 'minutes'>

/** How long each kind of appointment usually takes. */
export async function loadLengths(client: Client): Promise<AppointmentLength[]> {
  return must(await client.from('appointment_lengths').select('purpose, minutes'))
}

/** The usual length for a kind of appointment; 10 minutes if none is set. */
export async function lengthFor(client: Client, purpose: Enums<'interview_purpose'>): Promise<number> {
  const row = maybe<{ minutes: number }>(await client.from('appointment_lengths').select('minutes').eq('purpose', purpose).maybeSingle())
  return row?.minutes ?? 10
}

export async function setUsualLength(client: Client, purpose: Enums<'interview_purpose'>, minutes: number) {
  check(await client.from('appointment_lengths').update({ minutes, updated_at: new Date().toISOString() }).eq('purpose', purpose))
}

/** Lets the times offered to someone go, so they can be offered to others. */
export async function releaseOffered(client: Client, id: string) {
  check(await client.from('interviews').update({ offered_at: null, offered_times: [] }).eq('id', id))
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

export type Invite = Pick<Tables<'allowlist'>, 'email' | 'first_name' | 'last_name' | 'initial_roles' | 'initial_office' | 'initial_organization' | 'created_at' | 'profile_id'>
export type InviteAccess = Pick<Invite, 'initial_roles' | 'initial_office'> & Partial<Pick<Invite, 'initial_organization'>>
export type InviteName = { first: string; last: string }
export type Account = Pick<Tables<'profiles'>, 'id' | 'email' | 'display_name' | 'removed_at'>

/**
 * Everyone allowed to sign in, and every account. An account no entry links to belongs to someone
 * who was taken off the list; it stays until it's deleted. An account can exist before its owner
 * has signed in, when the Sheets import made it for them; notSignedIn lists those.
 */
export async function loadAccess(client: Client) {
  const [invites, accounts, callings, notSignedIn] = await Promise.all([
    client.from('allowlist').select('email, first_name, last_name, initial_roles, initial_office, initial_organization, created_at, profile_id').order('email'),
    client.from('profiles').select('id, email, display_name, removed_at').order('display_name'),
    client.from('callings').select('organization'),
    client.rpc('accounts_not_signed_in'),
  ])
  return { invites: must(invites) as Invite[], accounts: must(accounts) as Account[], organizations: organizationsOf(must(callings)), notSignedIn: must(notSignedIn) }
}

/**
 * Deletes someone else's account and takes their email off the list (admins only). Their personal
 * records go with it; requests they were part of stay, showing "Former member".
 */
export async function deleteAccount(client: Client, personId: string) {
  check(await client.rpc('delete_account', { person: personId }))
}

const nameColumns = ({ first, last }: InviteName) => ({ first_name: first.trim() || null, last_name: last.trim() || null })

export async function addInvite(client: Client, email: string, access: InviteAccess, name: InviteName = { first: '', last: '' }) {
  check(await client.from('allowlist').insert({ email: email.trim().toLowerCase(), ...access, ...nameColumns(name) }))
}

/** The name to use when this person's account is created. Has no effect on an existing account. */
export async function updateInviteName(client: Client, email: string, name: InviteName) {
  check(await client.from('allowlist').update(nameColumns(name)).eq('email', email))
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
// Leadership changes and mentoring
// ---------------------------------------------------------------------------

export type MentoringFor = { id: string; for_id: string; name: string | null; ends_at: string; sees_callings: boolean }
export type MentoredBy = { id: string; mentor_id: string; name: string | null; starts_at: string; ends_at: string; sees_callings: boolean }
export type WhoAmI = { id: string; acting_as: string; mentoring: MentoringFor[]; mentored_by: MentoredBy[] }

/** Who is signed in, who they act as, and any mentoring they give or get. */
export async function whoami(client: Client): Promise<WhoAmI | null> {
  return (must(await client.rpc('whoami')) as WhoAmI | null) ?? null
}

/** The new bishop changes his mentor's access: allow callings, move the end, or end it now. */
export async function updateMentoring(client: Client, id: string, changes: { sees_callings?: boolean; ends_at?: string; ended?: true }) {
  const { ended, ...rest } = changes
  check(await client.from('delegations').update({ ...rest, ...(ended ? { ended_at: new Date().toISOString() } : {}) }).eq('id', id))
}

export type LeadershipPerson = Pick<Tables<'profiles'>, 'id' | 'display_name' | 'email' | 'office' | 'organization'>

/** Everyone with an account the bishopric can see, with their office or organization. */
export async function loadLeadershipPeople(client: Client): Promise<LeadershipPerson[]> {
  return must(await client.from('profiles').select('id, display_name, email, office, organization').is('removed_at', null).order('display_name'))
}

/** What would move from this person to a successor. */
export async function loadLeadershipWork(client: Client, personId: string): Promise<Work | null> {
  return must(await client.rpc('leadership_work', { person: personId }))[0] ?? null
}

export async function runHandover(client: Client, args: { seats: Seats; leaving: Record<string, Leaving>; mentorEndsAt: string | null; mentorSeesCallings: boolean }): Promise<string> {
  return must(
    await client.rpc('run_handover', {
      seats: seatsPayload(args.seats),
      leaving: leavingPayload(args.leaving),
      mentor_ends_at: args.mentorEndsAt ?? undefined,
      mentor_sees_callings: args.mentorSeesCallings,
    }),
  )
}

/** A new leader for an organization: someone with an account, or a new email. */
export async function changeLeader(client: Client, args: { organization: string; person?: string; email?: string; outgoingBecomes: 'released' | 'leader' }): Promise<string> {
  return must(
    await client.rpc('change_leader', {
      org: args.organization,
      person: args.person,
      email: args.email?.trim().toLowerCase(),
      outgoing_becomes: args.outgoingBecomes,
    }),
  )
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

// ---------------------------------------------------------------------------
// Notifications (Web Push devices)
// ---------------------------------------------------------------------------

/** Saves this device for push, taking it over if someone else turned it on here before. */
export async function savePushSubscription(client: Client, sub: { endpoint: string; p256dh: string; auth: string }) {
  check(await client.rpc('save_push_subscription', { sub_endpoint: sub.endpoint, sub_p256dh: sub.p256dh, sub_auth: sub.auth }))
}

export async function deletePushSubscription(client: Client, endpoint: string) {
  check(await client.from('push_subscriptions').delete().eq('endpoint', endpoint))
}

/** Whether this device is saved for the signed-in person (it may have been taken over by someone else). */
export async function hasPushSubscription(client: Client, endpoint: string): Promise<boolean> {
  return !!maybe(await client.from('push_subscriptions').select('id').eq('endpoint', endpoint).maybeSingle())
}

/** The kinds of notification this person turned off. Everything else is sent. */
export async function loadMutedNotifications(client: Client): Promise<NotificationKind[]> {
  return must(await client.from('notification_mutes').select('kind')).map((r) => r.kind as NotificationKind)
}

/** Turns one kind of notification on or off for this person, on every device. */
export async function setNotificationOn(client: Client, kind: NotificationKind, on: boolean) {
  check(
    on
      ? await client.from('notification_mutes').delete().eq('kind', kind)
      : await client.from('notification_mutes').upsert({ kind }, { onConflict: 'user_id,kind', ignoreDuplicates: true }),
  )
}

// ---------------------------------------------------------------------------
// Errors the app hit, for the hourly health check
// ---------------------------------------------------------------------------

export async function reportClientError(client: Client, report: ErrorReport) {
  check(
    await client.rpc('report_client_error', {
      message: report.message,
      stack: report.stack ?? undefined,
      route: report.route,
      app_version: report.app_version,
      user_agent: report.user_agent,
      source: report.source,
    }),
  )
}
