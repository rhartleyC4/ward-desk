// Everything the scheduled sender does on one run. The notify Edge Function runs it every 10
// minutes (pg_cron calls the function), and `npm run notify -- --tick` runs it by hand. What's due
// depends on the ward's time now; notification_log keeps each from going twice, so most runs send
// nothing.
//
// - From 6 to 10 PM: each bishopric member's day-ahead summary for tomorrow.
// - Half an hour after a leader's last appointment of the day: how did they go?
// - From 10 AM to 8 PM: a secretary's reminders to send for tomorrow.
//
// Pure apart from the database and the sender it's given, so the Edge Function (Deno) gets it as a
// bundle (npm run functions:build) and the integration tests run it against the local database.

import type { Sql } from 'postgres'
import { addDays } from '../../src/lib/dates'
import { wardNow } from '../../src/lib/followUp'
import { sendDaySummaries, type PersonReport } from './daySummaries'
import type { Sender } from './deliver'
import { sendFollowUps, type FollowUpReport } from './followUps'

/** Day-ahead summaries go out in this stretch of the ward's evening (24-hour, inclusive start). */
export const SUMMARY_FROM_HOUR = 18
export const SUMMARY_UNTIL_HOUR = 22

export type TickOptions = { sql: Sql; now: Date; timeZone: string; send: Sender; dryRun?: boolean; only?: string[] }
export type TickReport = { summaries: PersonReport[]; followUps: FollowUpReport[] }

export async function tick({ sql, now, timeZone, send, dryRun, only }: TickOptions): Promise<TickReport> {
  const { date, hour } = wardNow(now, timeZone)
  const summaries = hour >= SUMMARY_FROM_HOUR && hour < SUMMARY_UNTIL_HOUR ? await sendDaySummaries({ sql, date: addDays(date, 1), timeZone, send, dryRun, only }) : []
  const followUps = await sendFollowUps({ sql, now, timeZone, send, dryRun, only })
  return { summaries, followUps }
}

/** What a run did, for logs: offices and outcomes, never names. */
export function describeTick({ summaries, followUps }: TickReport): string[] {
  // Every evening run finds most summaries already sent; only what happened this run is worth a line.
  const sent = (r: { outcome: string }) => ['sent', 'failed', 'dry-run'].includes(r.outcome)
  return [
    ...summaries.filter(sent).map((r) => `summary → ${r.office ?? 'bishopric'}: ${r.outcome}, ${r.devices} device${r.devices === 1 ? '' : 's'}`),
    ...followUps.map((r) => `${r.kind} → ${r.office ?? 'bishopric'}: ${r.outcome}, ${r.devices} device${r.devices === 1 ? '' : 's'}`),
  ]
}
