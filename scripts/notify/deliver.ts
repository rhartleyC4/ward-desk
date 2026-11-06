// Sends one notification to every device a person has, removes devices the push service has
// forgotten, and logs it in notification_log so the same thing is never sent twice. Shared by the
// day-ahead summaries, the follow-up nudges and the other scheduled ones.

import type { Sql } from 'postgres'
import type { IsoDate } from '../../src/lib/dates'
import type { NotificationKind } from '../../src/lib/notifications'

export type PushMessage = { title: string; body: string; url: string; tag: string }
export type Device = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

/** What sending to one device did. 'gone' means the push service no longer knows it, so it's removed. */
export type SendResult = 'sent' | 'gone' | 'failed'
export type Sender = (device: Device, message: PushMessage) => Promise<SendResult>

export type LogKind = 'day_summary' | 'report_due' | 'reminders' | 'request_due' | 'callings_to_record'

/** Sends to each device; 'sent' when at least one took it. */
export async function sendToDevices(sql: Sql, send: Sender, devices: Device[], message: PushMessage): Promise<'sent' | 'failed'> {
  const results = await Promise.all(devices.map(async (d) => [d, await send(d, message)] as const))
  const gone = results.filter(([, r]) => r === 'gone').map(([d]) => d.id)
  if (gone.length) await sql`delete from public.push_subscriptions where id in ${sql(gone)}`
  return results.some(([, r]) => r === 'sent') ? 'sent' : 'failed'
}

export async function deliver(sql: Sql, send: Sender, devices: Device[], userId: string, kind: LogKind, forDate: IsoDate, message: PushMessage): Promise<'sent' | 'failed'> {
  if ((await sendToDevices(sql, send, devices, message)) === 'failed') return 'failed'
  await sql`
    insert into public.notification_log (user_id, kind, for_date) values (${userId}, ${kind}, ${forDate})
    on conflict (user_id, kind, for_date) do update set sent_at = now()`
  return 'sent'
}

/** Whether a person turned this kind off. */
export type Muted = (userId: string, kind: NotificationKind) => boolean

export async function loadMuted(sql: Sql): Promise<Muted> {
  const rows = await sql<{ user_id: string; kind: string }[]>`select user_id, kind from public.notification_mutes`
  const off = new Set(rows.map((r) => `${r.user_id}:${r.kind}`))
  return (userId, kind) => off.has(`${userId}:${kind}`)
}
