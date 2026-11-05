// Sends tomorrow's day-ahead summaries. Run by .github/workflows/notify.yml each evening, or by hand:
//
//   npm run notify -- --dry-run                 # show what each person would get tomorrow
//   npm run notify -- --date 2026-11-08 --dry-run
//   npm run notify -- --only you@example.com --force   # send to one person, even if already sent
//
// Reads SUPABASE_DB_URL, WARD_TIME_ZONE, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT from
// the environment, or locally from .env (npm run db:env writes them).

import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'
import postgres from 'postgres'
import webpush from 'web-push'
import { addDays } from '../../src/lib/dates'
import { wardParts } from '../../src/lib/slots'
import { sendDaySummaries, type Sender } from './daySummaries'

/** On a scheduled run, send only in this stretch of the ward's evening (24-hour, inclusive start). */
const SEND_FROM_HOUR = 18
const SEND_UNTIL_HOUR = 22

const envFile = new URL('../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

const { values: args } = parseArgs({
  options: {
    date: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    only: { type: 'string', multiple: true },
    scheduled: { type: 'boolean', default: false },
  },
})

function need(name: string, fallback?: string): string {
  const value = process.env[name] || fallback
  if (!value) throw new Error(`${name} is not set.`)
  return value
}

const timeZone = need('WARD_TIME_ZONE', process.env.VITE_WARD_TIME_ZONE || 'America/Denver')
const now = wardParts(new Date().toISOString(), timeZone)
const hour = Number(now.time.slice(0, 2))

if (args.scheduled && (hour < SEND_FROM_HOUR || hour >= SEND_UNTIL_HOUR)) {
  console.log(`It's ${now.time} in ${timeZone}; summaries go out between ${SEND_FROM_HOUR}:00 and ${SEND_UNTIL_HOUR}:00. Nothing to do.`)
  process.exit(0)
}

const date = args.date ?? addDays(now.date, 1)
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
            topic: message.tag, // a newer summary for the same day replaces an undelivered one
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

  const reports = await sendDaySummaries({ sql, date, timeZone, send, dryRun, force: args.force, only })
  console.log(`Day-ahead summaries for ${date}${dryRun ? ' (dry run, nothing sent)' : ''}:`)
  // Logs show offices, not names, and the lines themselves never name anyone.
  for (const r of reports) {
    console.log(`- ${r.office ?? 'bishopric'}: ${r.outcome}, ${r.devices} device${r.devices === 1 ? '' : 's'}`)
    for (const l of r.lines) console.log(`    ${l.text}`)
  }
  if (reports.some((r) => r.outcome === 'failed')) process.exitCode = 1
} finally {
  await sql.end()
}
