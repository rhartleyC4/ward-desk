// Sends one notification to every device a person has, removes devices the push service has
// forgotten, and logs it in notification_log so the same thing is never sent twice. Shared by the
// day-ahead summaries and the follow-up nudges.

import type { Sql } from 'postgres'
import type { IsoDate } from '../../src/lib/dates'

export type PushMessage = { title: string; body: string; url: string; tag: string }
export type Device = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

/** What sending to one device did. 'gone' means the push service no longer knows it, so it's removed. */
export type SendResult = 'sent' | 'gone' | 'failed'
export type Sender = (device: Device, message: PushMessage) => Promise<SendResult>

export type LogKind = 'day_summary' | 'report_due' | 'reminders'

export async function deliver(sql: Sql, send: Sender, devices: Device[], userId: string, kind: LogKind, forDate: IsoDate, message: PushMessage): Promise<'sent' | 'failed'> {
  const results = await Promise.all(devices.map(async (d) => [d, await send(d, message)] as const))
  const gone = results.filter(([, r]) => r === 'gone').map(([d]) => d.id)
  if (gone.length) await sql`delete from public.push_subscriptions where id in ${sql(gone)}`
  if (!results.some(([, r]) => r === 'sent')) return 'failed'
  await sql`
    insert into public.notification_log (user_id, kind, for_date) values (${userId}, ${kind}, ${forDate})
    on conflict (user_id, kind, for_date) do update set sent_at = now()`
  return 'sent'
}
