// Sends whatever notifications are due: the evening day-ahead summaries, a leader's nudge to report
// on today's appointments, and a secretary's reminders to send for tomorrow. pg_cron calls it every
// 10 minutes (public.call_notify, in supabase/migrations/*_notify_cron.sql):
//
//   POST /functions/v1/notify   with header x-notify-secret: <NOTIFY_SECRET>
//
// What's due is decided by scripts/notify/tick.ts, bundled into tick.bundle.js by
// `npm run functions:build` (deploy with `npm run functions:deploy`, which builds first).
// notification_log keeps each notification from going twice, so a repeated call sends nothing.
//
// Secrets: NOTIFY_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT and WARD_TIME_ZONE
// (supabase secrets set ...). Supabase provides SUPABASE_DB_URL. See "Notifications" in README.md.

import postgres from 'npm:postgres@3.4.5'
import webpush from 'npm:web-push@3.6.7'
import { describeTick, tick } from './tick.bundle.js'

type Device = { endpoint: string; p256dh: string; auth: string }
type PushMessage = { tag: string }

const env = (name: string) => Deno.env.get(name) ?? ''

const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Compares secrets without leaking how much of one matched. */
function same(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'POST only' })
  if (!same(env('NOTIFY_SECRET'), req.headers.get('x-notify-secret') ?? '')) return reply(401, { error: 'Not allowed' })

  const publicKey = env('VAPID_PUBLIC_KEY')
  const privateKey = env('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) return reply(200, { skipped: 'notifications are not set up here' })
  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:noreply@warddesk.app', publicKey, privateKey)

  const send = async (device: Device, message: PushMessage) => {
    try {
      await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, JSON.stringify(message), {
        TTL: 12 * 60 * 60, // a phone that's off overnight still gets it in the morning
        urgency: 'normal',
        topic: message.tag, // a newer one for the same day replaces an undelivered one
      })
      return 'sent' as const
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) return 'gone' as const
      console.error(`push failed (${status ?? 'no status'}): ${(e as Error).message}`)
      return 'failed' as const
    }
  }

  const sql = postgres(env('SUPABASE_DB_URL'), { max: 2, prepare: false, onnotice: () => {} })
  try {
    const report = await tick({ sql, now: new Date(), timeZone: env('WARD_TIME_ZONE') || 'America/Denver', send })
    const lines = describeTick(report)
    // Offices and outcomes only, never names.
    for (const l of lines) console.log(l)
    return reply(200, { sent: lines })
  } catch (e) {
    console.error(`notify failed: ${(e as Error).message}`)
    return reply(500, { error: 'notify failed' })
  } finally {
    await sql.end()
  }
})
