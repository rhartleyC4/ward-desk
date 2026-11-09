// The choices queries.ts makes itself: which write it picks, what it trims or defaults, and how it
// treats a failure. What the database then does with them is covered by tests/integration.

import { describe, expect, it, vi } from 'vitest'
import { tidyTitle } from './callings'
import { OFFICES } from './leadership'
import * as q from './queries'

type Answer = { data?: unknown; error?: { message: string } | null; count?: number | null }
type Op = [string, ...unknown[]]

/** A stand-in Supabase client. `answer` says what each table (or `rpc:name`) returns. */
function client(answer: (name: string) => Answer = () => ({ data: [], error: null })) {
  const log: { table: string; ops: Op[] }[] = []
  const settled = (name: string) => Promise.resolve({ data: null, error: null, ...answer(name) })
  const from = (table: string) => {
    const entry = { table, ops: [] as Op[] }
    log.push(entry)
    const query: object = new Proxy(
      {},
      {
        get: (_target, method: string) =>
          method === 'then'
            ? (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) => settled(table).then(ok, no)
            : (...args: unknown[]) => {
                entry.ops.push([method, ...args])
                return query
              },
      },
    )
    return query
  }
  const rpc = vi.fn((name: string, _args?: unknown) => settled(`rpc:${name}`))
  const invoke = vi.fn(async (_name: string, _options: unknown): Promise<Answer> => ({ error: null }))
  const passkey = { list: vi.fn(async () => ({ data: [{ id: 'p1' }], error: null })), delete: vi.fn(async () => ({ error: null })), update: vi.fn(async () => ({ error: null })) }
  const auth = { signInWithPasskey: vi.fn(async (): Promise<Answer> => ({ data: { user: { id: 'u1' } }, error: null })), registerPasskey: vi.fn(async (): Promise<Answer> => ({ data: { id: 'p1', friendly_name: 'Phone' }, error: null })), passkey }
  const fake = { from, rpc, functions: { invoke }, auth } as never
  const ops = (table: string, at = 0) => log.filter((l) => l.table === table)[at]?.ops ?? []
  return { fake, ops, log, rpc, invoke, auth, passkey }
}

const failing = () => client(() => ({ error: { message: 'denied' } }))

describe('failures', () => {
  it('throws the database\'s message from a read', async () => {
    await expect(q.loadProfiles(failing().fake)).rejects.toThrow('denied')
  })

  it('throws it from a read that may find nothing', async () => {
    await expect(q.lengthFor(failing().fake, 'other')).rejects.toThrow('denied')
  })

  it('throws it from a write', async () => {
    await expect(q.deleteEvent(failing().fake, 'e1')).rejects.toThrow('denied')
  })
})

describe('people', () => {
  it('returns no secretaries without asking for profiles when there is no bishopric', async () => {
    const c = client()
    await expect(q.loadSecretaries(c.fake)).resolves.toEqual([])
    expect(c.ops('profiles')).toEqual([])
  })

  it('leaves the bishop and counselors out of the secretaries', async () => {
    const c = client((t) => (t === 'roles' ? { data: [{ user_id: 'a' }] } : { data: [{ id: 'a', office: 'bishop' }, { id: 'b', office: 'ward_clerk' }, { id: 'c', office: null }] }))
    await expect(q.loadSecretaries(c.fake)).resolves.toEqual([{ id: 'b', office: 'ward_clerk' }, { id: 'c', office: null }])
  })

  it('returns an empty name when none was saved', async () => {
    const c = client(() => ({ data: { display_name: null } }))
    await expect(q.updateMyName(c.fake, 'u1', 'Avery')).resolves.toBe('')
  })

  it('lists only people still on the list', async () => {
    const c = client()
    await q.loadLeadershipPeople(c.fake)
    expect(c.ops('profiles')).toContainEqual(['is', 'removed_at', null])
  })
})

describe('schedule and callings', () => {
  it('adds a regular meeting, or changes the one given', async () => {
    const c = client()
    await q.saveEvent(c.fake, { title: 'A' } as never)
    await q.saveEvent(c.fake, { title: 'B' } as never, 'e1')
    expect(c.ops('recurring_events', 0)).toEqual([['insert', { title: 'A' }]])
    expect(c.ops('recurring_events', 1)).toEqual([['update', { title: 'B' }], ['eq', 'id', 'e1']])
  })

  it('tidies a new title but leaves other changes alone', async () => {
    const c = client()
    await q.updateCallingListEntry(c.fake, 'x', { title: '  relief   society ' })
    await q.updateCallingListEntry(c.fake, 'x', { organization: 'Primary' })
    expect(c.ops('callings', 0)[0]).toEqual(['update', { title: tidyTitle('  relief   society ') }])
    expect(c.ops('callings', 1)[0]).toEqual(['update', { organization: 'Primary' }])
  })

  it('completes a calling when they are set apart', async () => {
    const c = client()
    await q.setApart(c.fake, 'k', '2026-11-08')
    expect(c.ops('calling_candidates')[0]).toEqual(['update', { status: 'set_apart', set_apart_on: '2026-11-08' }])
  })
})

describe('requests', () => {
  it('leaves the reply alone when none is given', async () => {
    const c = client()
    await q.answerRequest(c.fake, 'r', 'seen')
    expect(c.ops('requests')[0]).toEqual(['update', { status: 'seen' }])
  })

  it.each([
    ['  on it ', 'on it'],
    ['   ', null],
    [null, null],
  ])('saves the reply %j as %j', async (reply, saved) => {
    const c = client()
    await q.answerRequest(c.fake, 'r', 'done', reply)
    expect(c.ops('requests')[0]).toEqual(['update', { status: 'done', reply: saved }])
  })

  it('changes and deletes a request by id', async () => {
    const c = client()
    await q.updateRequest(c.fake, 'r', { title: 'New' })
    await q.deleteRequest(c.fake, 'r')
    expect(c.ops('requests', 0)).toEqual([['update', { title: 'New' }], ['eq', 'id', 'r']])
    expect(c.ops('requests', 1)).toEqual([['delete'], ['eq', 'id', 'r']])
  })

  it('leaves out what a calling request did not fill in', async () => {
    const c = client(() => ({ data: 'c1' }))
    await expect(q.submitCallingRequest(c.fake, { kind: 'fill' as never, calling_title: 'Clerk', organization: null, release_name: null, needed_by: null, notes: null })).resolves.toBe('c1')
    expect(c.rpc).toHaveBeenCalledWith('submit_calling_request', { request_kind: 'fill', title: 'Clerk', org: undefined, releasing: undefined, needed: undefined, request_notes: undefined, names: [] })
  })

  it('adds up what is waiting, treating a missing count as none', async () => {
    const c = client((t) => (t === 'requests' ? { count: 2 } : t === 'agenda_assignments' ? { count: null } : { count: 3 }))
    await expect(q.countWaiting(c.fake, 'u', true, '2026-11-08')).resolves.toBe(5)
  })

  it('only counts calling requests for the bishopric', async () => {
    const c = client(() => ({ count: 1 }))
    await expect(q.countWaiting(c.fake, 'u', false, '2026-11-08')).resolves.toBe(2)
    expect(c.ops('calling_requests')).toEqual([])
  })

  it('counts nothing when a part fails to load', async () => {
    const c = client((t) => (t === 'calling_requests' ? { error: { message: 'denied' } } : { count: 1 }))
    await expect(q.countWaiting(c.fake, 'u', true, '2026-11-08')).rejects.toThrow('denied')
  })
})

describe('loadTabCounts', () => {
  const who = { userId: 'u', bishopric: false, home: null, callings: false, sacrament: false, today: '2026-11-08', now: new Date('2026-11-08T12:00:00Z') } as const
  const zero = () => client(() => ({ data: [], count: 0 }))

  it('only has Requests for someone with no other tab to count', async () => {
    const c = zero()
    await expect(q.loadTabCounts(c.fake, who)).resolves.toEqual({ '/requests': 0 })
    expect(c.ops('interviews')).toEqual([])
  })

  it("counts open assignments from the caller's date", async () => {
    const c = zero()
    await q.loadTabCounts(c.fake, { ...who, today: '2030-01-06' })
    expect(c.ops('agenda_assignments')).toContainEqual(['gte', 'meeting_date', '2030-01-06'])
  })

  it('counts Home for a leader from their own appointments', async () => {
    const c = zero()
    await expect(q.loadTabCounts(c.fake, { ...who, home: 'leader' })).resolves.toEqual({ '/requests': 0, '/home': 0 })
    expect(c.ops('interviews')).toContainEqual(['eq', 'interviewer_id', 'u'])
  })

  it('counts Home for a secretary from every scheduled appointment', async () => {
    const c = zero()
    await expect(q.loadTabCounts(c.fake, { ...who, home: 'secretary' })).resolves.toEqual({ '/requests': 0, '/home': 0 })
    expect(c.ops('secretary_assignments')).toHaveLength(1)
  })

  it('counts Meetings from suggestions and unreceived requests', async () => {
    const c = zero()
    await expect(q.loadTabCounts(c.fake, { ...who, callings: true })).resolves.toEqual({ '/requests': 0, '/agenda': 0 })
    expect(c.ops('calling_candidates')).toContainEqual(['eq', 'status', 'suggested'])
  })

  it('counts Sacrament for the coming Sunday', async () => {
    const c = zero()
    const counts = await q.loadTabCounts(c.fake, { ...who, sacrament: true })
    expect(Object.keys(counts).sort()).toEqual(['/requests', '/sacrament'])
    expect(c.ops('absences')).toContainEqual(['lte', 'starts_on', '2026-11-08'])
  })
})

describe('pushAbout', () => {
  it('asks the push function about the change', async () => {
    const c = client()
    await q.pushAbout(c.fake, 'request_sent', 'r')
    expect(c.invoke).toHaveBeenCalledWith('push', { body: { event: 'request_sent', id: 'r' } })
  })

  it('only logs when the function answers with an error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = client()
    c.invoke.mockResolvedValue({ error: { message: 'no' } })
    await expect(q.pushAbout(c.fake, 'request_sent', 'r')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith('Notification not sent:', 'no')
    warn.mockRestore()
  })

  it('only logs when the call itself fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = client()
    c.invoke.mockRejectedValue(new Error('offline'))
    await expect(q.pushAbout(c.fake, 'request_sent', 'r')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith('Notification not sent:', 'offline')
    warn.mockRestore()
  })
})

describe('appointments', () => {
  const appointment = { id: 'a', scheduled_at: '2026-11-08T17:00:00Z' }
  const changes = (c: ReturnType<typeof client>) => c.ops('interviews')[0][1] as Record<string, unknown>

  it('completes one that happened', async () => {
    const c = client()
    await q.reportAppointment(c.fake, appointment, { outcome: 'done' } as never, 'u')
    expect(changes(c)).toMatchObject({ status: 'completed', reported_by: 'u' })
    expect(c.ops('interviews')).toContainEqual(['eq', 'status', 'scheduled'])
  })

  it('sends a missed one back to be booked again, letting offered times go', async () => {
    const c = client()
    await q.reportAppointment(c.fake, appointment, { outcome: 'reschedule', note: ' sick ' } as never, 'u')
    expect(changes(c)).toMatchObject({ missed_at: appointment.scheduled_at, report_note: 'sick', scheduled_at: null, offered_at: null, offered_times: [] })
    expect(changes(c)).not.toHaveProperty('status')
  })

  it('keeps no empty note when rescheduling', async () => {
    const c = client()
    await q.reportAppointment(c.fake, appointment, { outcome: 'reschedule' } as never, 'u')
    expect(changes(c)).toMatchObject({ report_note: null })
  })

  it('cancels one that will not happen', async () => {
    const c = client()
    await q.reportAppointment(c.fake, appointment, { outcome: 'cancel', note: ' moved ' } as never, 'u')
    expect(changes(c)).toMatchObject({ status: 'cancelled', report_note: 'moved', missed_at: appointment.scheduled_at })
  })

  it('records a confirmation', async () => {
    const c = client()
    await q.markConfirmed(c.fake, 'a')
    expect(changes(c).confirmed_at).toEqual(expect.any(String))
  })

  it('records a reminder, and takes it back', async () => {
    const on = client()
    const off = client()
    await q.markReminded(on.fake, 'a')
    await q.markReminded(off.fake, 'a', false)
    expect(changes(on).reminded_at).toEqual(expect.any(String))
    expect(changes(off).reminded_at).toBeNull()
  })

  it('records a meeting reminder once, and takes it back', async () => {
    const c = client()
    await q.markMeetingReminded(c.fake, 'e', '2026-11-08')
    await q.markMeetingReminded(c.fake, 'e', '2026-11-08', false)
    expect(c.ops('meeting_reminders', 0)[0]).toEqual(['upsert', { event_id: 'e', for_date: '2026-11-08' }, { onConflict: 'event_id,for_date', ignoreDuplicates: true }])
    expect(c.ops('meeting_reminders', 1)[0]).toEqual(['delete'])
  })

  it('loads the reminders for a date', async () => {
    const c = client(() => ({ data: [{ id: 1 }] }))
    await expect(q.loadMeetingReminders(c.fake, '2026-11-08')).resolves.toEqual({ events: [{ id: 1 }], sent: [{ id: 1 }], agendas: [{ id: 1 }] })
  })

  it('uses the length given without looking one up', async () => {
    const c = client()
    await q.addAppointment(c.fake, { duration_minutes: 45, purpose: 'other' } as never)
    expect(c.ops('appointment_lengths')).toEqual([])
    expect(c.ops('interviews')[0][1]).toMatchObject({ duration_minutes: 45 })
  })

  it('starts at the usual length, treating no kind as other', async () => {
    const c = client((t) => (t === 'appointment_lengths' ? { data: { minutes: 20 } } : {}))
    await q.addAppointment(c.fake, {} as never)
    expect(c.ops('appointment_lengths')).toContainEqual(['eq', 'purpose', 'other'])
    expect(c.ops('interviews')[0][1]).toMatchObject({ duration_minutes: 20 })
  })

  it('falls back to 10 minutes when no length is set', async () => {
    await expect(q.lengthFor(client(() => ({ data: null })).fake, 'other')).resolves.toBe(10)
  })
})

describe('agendas', () => {
  it('asks for no items when there are no sections', async () => {
    const c = client()
    await expect(q.loadOpenAgendaItems(c.fake, [])).resolves.toEqual([])
    expect(c.log).toEqual([])
  })

  it('files an item as calendar or discussion by its section', async () => {
    const c = client()
    await q.addAgendaItem(c.fake, { id: 's', kind: 'calendar' } as never, 'Ward party', '2026-11-20')
    await q.addAgendaItem(c.fake, { id: 's', kind: 'callings' } as never, 'Talk')
    expect(c.ops('agenda_items', 0)[0]).toEqual(['insert', { section_id: 's', kind: 'calendar', body: 'Ward party', event_date: '2026-11-20' }])
    expect(c.ops('agenda_items', 1)[0]).toEqual(['insert', { section_id: 's', kind: 'discussion', body: 'Talk', event_date: null }])
  })

  it('removes an assignment when it is given to no one', async () => {
    const c = client()
    await expect(q.saveAssignments(c.fake, 't', '2026-11-08', [{ part: 'opening_prayer', to: null }] as never)).resolves.toEqual([])
    expect(c.ops('agenda_assignments')).toEqual([['delete'], ['match', { template_id: 't', meeting_date: '2026-11-08', part: 'opening_prayer' }]])
  })
})

describe('mentoring and handover', () => {
  it('ends mentoring with a time, not a flag', async () => {
    const c = client()
    await q.updateMentoring(c.fake, 'd', { ended: true })
    const changes = c.ops('delegations')[0][1] as Record<string, unknown>
    expect(changes.ended_at).toEqual(expect.any(String))
    expect(changes).not.toHaveProperty('ended')
  })

  it('leaves the end alone for other changes', async () => {
    const c = client()
    await q.updateMentoring(c.fake, 'd', { sees_callings: true })
    expect(c.ops('delegations')[0][1]).toEqual({ sees_callings: true })
  })

  it('treats no answer as not signed in', async () => {
    await expect(q.whoami(client(() => ({ data: null })).fake).catch(() => 'threw')).resolves.toBeNull()
  })

  it('has no work for someone the database knows nothing about', async () => {
    await expect(q.loadLeadershipWork(client(() => ({ data: [] })).fake, 'u')).resolves.toBeNull()
  })

  it('sends no end date when mentoring has none', async () => {
    const c = client(() => ({ data: 'h1' }))
    const seats = Object.fromEntries(OFFICES.map(({ office }) => [office, { kind: 'empty' }])) as never
    await q.runHandover(c.fake, { seats, leaving: {}, mentorEndsAt: null, mentorSeesCallings: false })
    expect(c.rpc.mock.calls[0][1]).toMatchObject({ mentor_ends_at: undefined, mentor_sees_callings: false })
  })

  it('tidies a new leader\'s email', async () => {
    const c = client(() => ({ data: 'x' }))
    await q.changeLeader(c.fake, { organization: 'Primary', email: ' New@Ward.Test ', outgoingBecomes: 'released' })
    expect(c.rpc).toHaveBeenCalledWith('change_leader', { org: 'Primary', person: undefined, email: 'new@ward.test', outgoing_becomes: 'released' })
  })
})

describe('passkeys', () => {
  it('returns who signed in', async () => {
    await expect(q.signInWithPasskey(client().fake)).resolves.toBe('u1')
  })

  it('copes with no user coming back', async () => {
    const c = client()
    c.auth.signInWithPasskey.mockResolvedValue({ data: { user: null }, error: null })
    await expect(q.signInWithPasskey(c.fake)).resolves.toBe('')
  })

  it('turns a failed sign-in into a readable error', async () => {
    const c = client()
    c.auth.signInWithPasskey.mockResolvedValue({ data: {}, error: { message: 'bad' } })
    await expect(q.signInWithPasskey(c.fake)).rejects.toThrow('bad')
  })

  it('names a new passkey after the device and returns its id', async () => {
    const c = client()
    c.auth.registerPasskey.mockResolvedValue({ data: { id: 'p9' }, error: null })
    await expect(q.registerPasskey(c.fake, 'iPhone · Safari')).resolves.toBe('p9')
    expect(c.passkey.update).toHaveBeenCalledWith({ passkeyId: 'p9', friendlyName: 'iPhone · Safari' })
  })

  it('renames a passkey', async () => {
    const c = client()
    await q.renamePasskey(c.fake, 'p1', 'Work phone')
    expect(c.passkey.update).toHaveBeenCalledWith({ passkeyId: 'p1', friendlyName: 'Work phone' })
  })

  it('turns a failed registration into a readable error', async () => {
    const c = client()
    c.auth.registerPasskey.mockResolvedValue({ data: {}, error: { message: 'bad' } })
    await expect(q.registerPasskey(c.fake, 'iPhone')).rejects.toThrow('bad')
  })

  it('lists and deletes them', async () => {
    const c = client()
    await expect(q.listPasskeys(c.fake)).resolves.toEqual([{ id: 'p1' }])
    await q.deletePasskey(c.fake, 'p1')
    expect(c.passkey.delete).toHaveBeenCalledWith({ passkeyId: 'p1' })
  })
})

describe('notifications', () => {
  it('saves this device', async () => {
    const c = client()
    await q.savePushSubscription(c.fake, { endpoint: 'e', p256dh: 'k', auth: 'a' })
    expect(c.rpc).toHaveBeenCalledWith('save_push_subscription', { sub_endpoint: 'e', sub_p256dh: 'k', sub_auth: 'a' })
  })

  it('removes this device by endpoint', async () => {
    const c = client()
    await q.deletePushSubscription(c.fake, 'e')
    expect(c.ops('push_subscriptions')).toEqual([['delete'], ['eq', 'endpoint', 'e']])
  })

  it.each([
    [{ id: 'd' }, true],
    [null, false],
  ])('says whether the device is saved when the row is %j', async (data, saved) => {
    await expect(q.hasPushSubscription(client(() => ({ data })).fake, 'e')).resolves.toBe(saved)
  })

  it('lists the kinds turned off', async () => {
    await expect(q.loadMutedNotifications(client(() => ({ data: [{ kind: 'day_summary' }] })).fake)).resolves.toEqual(['day_summary'])
  })

  it('removes the mute to turn a kind on, and adds one to turn it off', async () => {
    const c = client()
    await q.setNotificationOn(c.fake, 'day_summary', true)
    await q.setNotificationOn(c.fake, 'day_summary', false)
    expect(c.ops('notification_mutes', 0)).toEqual([['delete'], ['eq', 'kind', 'day_summary']])
    expect(c.ops('notification_mutes', 1)[0]).toEqual(['upsert', { kind: 'day_summary' }, { onConflict: 'user_id,kind', ignoreDuplicates: true }])
  })
})

describe('reportClientError', () => {
  it('leaves out a missing stack', async () => {
    const c = client()
    await q.reportClientError(c.fake, { message: 'm', stack: null, route: '/r', app_version: 'v', user_agent: 'u', source: 'load' } as never)
    expect(c.rpc).toHaveBeenCalledWith('report_client_error', { message: 'm', stack: undefined, route: '/r', app_version: 'v', user_agent: 'u', source: 'load' })
  })
})
