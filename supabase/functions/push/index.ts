// Sends a push notification the moment a request is sent or answered, a calling request is sent
// or received, or a meeting assignment is given out or answered. The app calls it right after
// making the change (pushAbout in src/lib/queries.ts):
//
//   POST /functions/v1/push  { "event": "request_sent", "id": "<request id>" }
//
// The caller must be signed in and must be the person who made the change (plan.ts checks), and
// the change must be a few minutes old at most. Each notification is recorded in push_events
// first, so repeating a call sends nothing.
//
// Nobody gets a kind they turned off (notification_mutes; the kinds are the event names).
//
// A mentor acting for the new bishop sends the x-acting-as header (see acting_as() in the
// database). The change counts as the new bishop's, so it's announced as his, and he's told too,
// since he didn't make it himself. The mentor's own devices are never sent the bishop's news.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (supabase secrets set ...).
// Supabase provides SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY. Deploying is
// manual; see "Instant notifications" in README.md.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import webpush from 'npm:web-push@3.6.7'
import { mentorMessage, planPush, PUSH_EVENTS, tableFor, type PushMessage, type AssignmentRow, type CallingRequestRow, type Office, type PushEvent, type RequestRow } from './plan.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acting-as',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const env = (name: string) => Deno.env.get(name) ?? ''

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'POST only' })

  const caller = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: auth } = await caller.auth.getUser()
  if (!auth.user) return reply(401, { error: 'Sign in first' })

  let event: PushEvent
  let id: string
  try {
    const body = await req.json()
    event = body.event
    id = body.id
  } catch {
    return reply(400, { error: 'Send JSON with event and id' })
  }
  if (!PUSH_EVENTS.includes(event) || typeof id !== 'string') return reply(400, { error: 'Unknown event' })

  const publicKey = env('VAPID_PUBLIC_KEY')
  const privateKey = env('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) return reply(200, { sent: 0, skipped: 'notifications are not set up here' })

  // The service role reads past RLS: a leader can't read calling_requests, but may announce their own.
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  const table = tableFor(event)
  const callerId = await actingAs(admin, auth.user.id, req.headers.get('x-acting-as'))
  const mentored = callerId !== auth.user.id
  const [{ data: row }, { data: me }] = await Promise.all([
    admin.from(table).select('*').eq('id', id).maybeSingle(),
    admin.from('profiles').select('office').eq('id', callerId).maybeSingle(),
  ])
  if (!row) return reply(404, { error: 'No such request' })

  const plan = planPush(event, row as RequestRow | CallingRequestRow | AssignmentRow, callerId, (me?.office ?? null) as Office, new Date())
  if ('skip' in plan) return reply(200, { sent: 0, skipped: plan.skip })

  // Each kind of notification is named after its event, and anyone can turn one off.
  const { data: muted } = await admin.from('notification_mutes').select('user_id').eq('kind', event).in('user_id', plan.to)
  const to = plan.to.filter((id) => !muted?.some((m) => m.user_id === id))
  if (!to.length) return reply(200, { sent: 0, skipped: 'turned off' })

  // Claim it before sending, so two calls at once can't both send.
  const { error: claimed } = await admin.from('push_events').insert({ key: plan.key })
  if (claimed) return reply(200, { sent: 0, skipped: claimed.code === '23505' ? 'already sent' : claimed.message })

  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:noreply@warddesk.app', publicKey, privateKey)
  const result = await sendTo(admin, to, plan.message)

  // The new bishop hears what his mentor did for him, once.
  if (mentored) {
    const { error: told } = await admin.from('push_events').insert({ key: `${plan.key}:mentor` })
    if (!told) await sendTo(admin, [callerId], mentorMessage(plan.message))
  }
  return reply(200, result)
})

/** Who the caller acts as: the person named by x-acting-as while an open delegation allows it. */
async function actingAs(admin: SupabaseClient, userId: string, wanted: string | null): Promise<string> {
  if (!wanted || wanted === userId) return userId
  const now = new Date().toISOString()
  const [{ data: delegation }, { data: role }] = await Promise.all([
    admin.from('delegations').select('id').eq('mentor_id', userId).eq('for_id', wanted).is('ended_at', null).lte('starts_at', now).gt('ends_at', now).maybeSingle(),
    admin.from('roles').select('role').eq('user_id', wanted).eq('role', 'bishopric').maybeSingle(),
  ])
  return delegation && role ? wanted : userId
}

async function sendTo(admin: SupabaseClient, to: string[], message: PushMessage) {
  const { data: devices } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', to)
  let sent = 0
  for (const d of devices ?? []) {
    try {
      await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, JSON.stringify(message), {
        TTL: 24 * 60 * 60,
        urgency: 'normal',
        // No topic: the push service caps it at 32 characters, shorter than these tags. The tag
        // still replaces an earlier notification about the same request on the device.
      })
      sent++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      // The push service no longer knows this device.
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', d.id)
      else console.error(`push failed (${status ?? 'no status'}): ${(e as Error).message}`)
    }
  }
  return { sent, devices: devices?.length ?? 0 }
}
