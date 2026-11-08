// How long off-site backups are kept. This is the one place the periods are set; the privacy
// policy (site/src/content/legal/privacy.md) and README "Backups and restore" quote them.
//
// They are applied to the R2 bucket's object lifecycle rules by `npm run backup:lifecycle`, and
// `npm run env:check` reads the rules back and fails when they differ. Deleted data should be gone
// from every backup within about three months, so keep monthlies at 90 days or less.

import { createHash } from 'node:crypto'
import { AwsClient } from 'aws4fetch'

export const DAILY_DAYS = 30
export const MONTHLY_DAYS = 90

/** Both environments share one bucket, told apart by the first part of the key (backup.yml). */
export const RETENTION = [
  { prefix: 'production/daily/', days: DAILY_DAYS },
  { prefix: 'production/monthly/', days: MONTHLY_DAYS },
  { prefix: 'staging/daily/', days: DAILY_DAYS },
  { prefix: 'staging/monthly/', days: MONTHLY_DAYS },
]

const idOf = ({ prefix, days }) => `expire-${prefix.replace(/\/$/, '').replaceAll('/', '-')}-after-${days}-days`

/** The request body for PutBucketLifecycleConfiguration. */
export function lifecycleXml(rules = RETENTION) {
  const body = rules
    .map((r) => `<Rule><ID>${idOf(r)}</ID><Status>Enabled</Status><Filter><Prefix>${r.prefix}</Prefix></Filter><Expiration><Days>${r.days}</Days></Expiration></Rule>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><LifecycleConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${body}</LifecycleConfiguration>`
}

/** The enabled expiry rules in a GetBucketLifecycleConfiguration answer, as `{ prefix, days }`. */
export function parseLifecycle(xml) {
  const rules = []
  for (const [, rule] of xml.matchAll(/<Rule>(.*?)<\/Rule>/gs)) {
    if (rule.match(/<Status>(.*?)<\/Status>/)?.[1] !== 'Enabled') continue
    const prefix = rule.match(/<Prefix>(.*?)<\/Prefix>/)?.[1] ?? ''
    const days = rule.match(/<Expiration>.*?<Days>(\d+)<\/Days>.*?<\/Expiration>/s)?.[1]
    if (days) rules.push({ prefix, days: Number(days) })
  }
  return rules
}

const describe = (r) => `${r.prefix} → ${r.days} days`
const sorted = (rules) => [...rules].sort((a, b) => a.prefix.localeCompare(b.prefix))

/** What differs between the bucket's rules and the repo's: `{ missing, extra }` as readable lines. */
export function diffRules(actual, wanted = RETENTION) {
  const key = (r) => `${r.prefix}|${r.days}`
  const have = new Set(actual.map(key))
  const want = new Set(wanted.map(key))
  return {
    missing: sorted(wanted).filter((r) => !have.has(key(r))).map(describe),
    extra: sorted(actual).filter((r) => !want.has(key(r))).map(describe),
  }
}

export const sameRules = (actual, wanted = RETENTION) => {
  const { missing, extra } = diffRules(actual, wanted)
  return missing.length === 0 && extra.length === 0
}

export const printRules = (rules) => sorted(rules).map((r) => `    ${describe(r)}`).join('\n') || '    (none)'

/** A small R2 client for the bucket's lifecycle rules (S3 API). Needs a token allowed to edit the bucket. */
export function lifecycleClient({ endpoint, bucket, accessKeyId, secretAccessKey }) {
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
  const url = `${endpoint.replace(/\/$/, '')}/${bucket}?lifecycle`
  return {
    /** `{ rules }`, or `{ error }`. A bucket with no rules yet has `rules: []`. */
    async get() {
      try {
        const res = await client.fetch(url, { signal: AbortSignal.timeout(15000) })
        const text = await res.text()
        if (res.status === 404 && /NoSuchLifecycleConfiguration/.test(text)) return { rules: [] }
        if (!res.ok) return { error: `HTTP ${res.status}${/<Code>(.*?)<\/Code>/.exec(text)?.[1] ? ` ${/<Code>(.*?)<\/Code>/.exec(text)[1]}` : ''}` }
        return { rules: parseLifecycle(text) }
      } catch (error) {
        return { error: error.message }
      }
    },
    /** Replaces all the bucket's lifecycle rules. */
    async put(rules = RETENTION) {
      const body = lifecycleXml(rules)
      const res = await client.fetch(url, {
        method: 'PUT',
        body,
        headers: { 'content-type': 'application/xml', 'content-md5': createHash('md5').update(body).digest('base64') },
      })
      if (!res.ok) return { error: `HTTP ${res.status} ${(await res.text()).slice(0, 300)}` }
      return {}
    },
  }
}
