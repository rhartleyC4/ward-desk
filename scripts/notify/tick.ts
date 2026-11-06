// Everything the scheduled sender does on one run. The notify Edge Function runs it every 10
// minutes (pg_cron calls the function) and as soon as an appointment or away-date change is
// recorded; `npm run notify -- --tick` runs it by hand. What's due depends on the ward's time now;
// notification_log, push_events and the outbox's claims keep each from going twice, so most runs
// send nothing.
//
// - From 6 to 10 PM: each bishopric member's day-ahead summary for tomorrow.
// - Changes to appointments and away dates, to whoever they concern (notices.ts).
// - Half an hour after a leader's last appointment of the day: how did they go?
// - From 10 AM to 8 PM: a secretary's reminders to send for tomorrow, and requests due tomorrow.
// - Sunday afternoon: the ward clerk's callings to record. In the daytime: calling request progress.
//
// Nobody gets a kind they turned off (notification_mutes).
//
// Pure apart from the database and the sender it's given, so the Edge Function (Deno) gets it as a
// bundle (npm run functions:build) and the integration tests run it against the local database.

import type { Sql } from 'postgres'
import { addDays } from '../../src/lib/dates'
import { wardNow } from '../../src/lib/followUp'
import { sendDaily, type DailyReport } from './daily'
import { sendDaySummaries, type PersonReport } from './daySummaries'
import type { Sender } from './deliver'
import { sendFollowUps, type FollowUpReport } from './followUps'
import { sendNotices, type NoticeReport } from './notices'

/** Day-ahead summaries go out in this stretch of the ward's evening (24-hour, inclusive start). */
export const SUMMARY_FROM_HOUR = 18
export const SUMMARY_UNTIL_HOUR = 22

/** Any number, the same in every run: only one run at a time holds it. */
const RUN_LOCK = 7_310_412

export type TickOptions = { sql: Sql; now: Date; timeZone: string; send: Sender; dryRun?: boolean; only?: string[] }
export type TickReport = { summaries: PersonReport[]; notices: NoticeReport[]; followUps: FollowUpReport[]; daily: DailyReport[]; busy?: boolean }

export async function tick({ sql, now, timeZone, send, dryRun, only }: TickOptions): Promise<TickReport> {
  // A change can start a run while another is going. The one already going picks it up below.
  const lock = await sql.reserve()
  try {
    const [{ locked }] = await lock<{ locked: boolean }[]>`select pg_try_advisory_lock(${RUN_LOCK}) as locked`
    if (!locked) return { summaries: [], notices: [], followUps: [], daily: [], busy: true }
    try {
      const { date, hour } = wardNow(now, timeZone)
      const summaries = hour >= SUMMARY_FROM_HOUR && hour < SUMMARY_UNTIL_HOUR ? await sendDaySummaries({ sql, date: addDays(date, 1), timeZone, send, dryRun, only }) : []
      // After the summaries, so a booking they already show isn't announced as well.
      const notices = await sendNotices({ sql, now, timeZone, send, dryRun, only })
      const followUps = await sendFollowUps({ sql, now, timeZone, send, dryRun, only })
      const daily = await sendDaily({ sql, now, timeZone, send, dryRun, only })
      // Changes recorded while this run was busy, whose own run found the lock taken.
      if (!dryRun) notices.push(...(await sendNotices({ sql, now, timeZone, send, only })))
      return { summaries, notices, followUps, daily }
    } finally {
      await lock`select pg_advisory_unlock(${RUN_LOCK})`
    }
  } finally {
    lock.release()
  }
}

/** What a run did, for logs: offices and outcomes, never names. */
export function describeTick({ summaries, notices, followUps, daily, busy }: TickReport): string[] {
  if (busy) return ['another run is going; it sends what this one would have']
  // Every evening run finds most summaries already sent; only what happened this run is worth a line.
  const sent = (r: { outcome: string }) => ['sent', 'failed', 'dry-run'].includes(r.outcome)
  const devices = (n: number) => `${n} device${n === 1 ? '' : 's'}`
  return [
    ...summaries.filter(sent).map((r) => `summary → ${r.office ?? 'bishopric'}: ${r.outcome}, ${devices(r.devices)}`),
    ...[...notices, ...followUps, ...daily].map((r) => `${r.kind} → ${r.office ?? 'member'}: ${r.outcome}, ${devices(r.devices)}`),
  ]
}
