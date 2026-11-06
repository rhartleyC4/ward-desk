// Sends notifications by hand. On staging and production the notify Edge Function does this every
// 10 minutes (see tick.ts); this is for trying it locally and for "Day-ahead summaries" runs from
// the Actions tab (.github/workflows/notify.yml).
//
//   npm run notify -- --dry-run                 # show what each person would get tomorrow
//   npm run notify -- --date 2026-11-08 --dry-run
//   npm run notify -- --only you@example.com --force   # send to one person, even if already sent
//   npm run notify -- --tick --dry-run          # everything due now, as the Edge Function would send it
//   npm run notify -- --tick --now 2026-11-08T11:00:00-07:00 --dry-run
//
// Reads SUPABASE_DB_URL, WARD_TIME_ZONE, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT from
// the environment, or locally from .env (npm run db:env writes them).

import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'
import postgres from 'postgres'
import webpush from 'web-push'
import { addDays } from '../../src/lib/dates'
import { wardParts } from '../../src/lib/slots'
import { sendDaySummaries } from './daySummaries'
import type { Sender } from './deliver'
import { describeTick, tick } from './tick'

const envFile = new URL('../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

const { values: args } = parseArgs({
  options: {
    date: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    only: { type: 'string', multiple: true },
    tick: { type: 'boolean', default: false },
    now: { type: 'string' },
  },
})

function need(name: string, fallback?: string): string {
  const value = process.env[name] || fallback
  if (!value) throw new Error(`${name} is not set.`)
  return value
}

const timeZone = need('WARD_TIME_ZONE', process.env.VITE_WARD_TIME_ZONE || 'America/Denver')
const now = args.now ? new Date(args.now) : new Date()
if (Number.isNaN(now.getTime())) throw new Error(`--now must be a date and time, like 2026-11-08T11:00:00-07:00, not ${args.now}`)
const date = args.date ?? addDays(wardParts(now.toISOString(), timeZone).date, 1)
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date must look like 2026-11-08, not ${date}`)
const dryRun = args['dry-run']

const sql = postgres(need('SUPABASE_DB_URL'), { max: 4, prepare: false, onnotice: () => {} })

const send: Sender = dryRun
  ? async () => 'failed'
  : (() => {
      webpush.setVapidDetails(
        need('VAPID_SUBJECT', 'mailto:noreply@warddesk.app'),
        need('VAPID_PUBLIC_KEY', process.env.VITE_VAPID_PUBLIC_KEY),
        need('VAPID_PRIVATE_KEY'),
      )
      return async (device, message) => {
        try {
          await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, JSON.stringify(message), {
            TTL: 12 * 60 * 60, // a phone that's off overnight still gets it in the morning
            urgency: 'normal',
            // No Topic header: Apple's push service refuses it (400 BadWebPushTopic).
          })
          return 'sent'
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) return 'gone'
          console.error(`  push failed (${status ?? 'no status'}): ${(e as Error).message}`)
          return 'failed'
        }
      }
    })()

try {
  let only: string[] | undefined
  if (args.only?.length) {
    const rows = await sql<{ id: string }[]>`select id from public.profiles where email in ${sql(args.only)}`
    if (!rows.length) throw new Error('--only matched no one.')
    only = rows.map((r) => r.id)
  }

  if (args.tick) {
    const report = await tick({ sql, now, timeZone, send, dryRun, only })
    const lines = describeTick(report)
    console.log(`Due at ${wardParts(now.toISOString(), timeZone).time} in ${timeZone}${dryRun ? ' (dry run, nothing sent)' : ''}: ${lines.length ? '' : 'nothing'}`)
    for (const l of lines) console.log(`- ${l}`)
    for (const r of report.followUps) console.log(`    ${r.body.replace(/\n/g, '\n    ')}`)
    if ([...report.summaries, ...report.notices, ...report.followUps, ...report.daily].some((r) => r.outcome === 'failed')) process.exitCode = 1
  } else {
    const reports = await sendDaySummaries({ sql, date, timeZone, send, dryRun, force: args.force, only })
    console.log(`Day-ahead summaries for ${date}${dryRun ? ' (dry run, nothing sent)' : ''}:`)
    // Logs show offices, not names, and the lines themselves never name anyone.
    for (const r of reports) {
      console.log(`- ${r.office ?? 'bishopric'}: ${r.outcome}, ${r.devices} device${r.devices === 1 ? '' : 's'}`)
      for (const l of r.lines) console.log(`    ${l.text}`)
    }
    if (reports.some((r) => r.outcome === 'failed')) process.exitCode = 1
  }
} finally {
  await sql.end()
}
