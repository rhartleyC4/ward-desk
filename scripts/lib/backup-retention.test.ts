import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs without types
import { DAILY_DAYS, diffRules, lifecycleXml, MONTHLY_DAYS, parseLifecycle, RETENTION, sameRules } from './backup-retention.mjs'

describe('backup retention', () => {
  it('keeps deleted data out of backups within about three months', () => {
    expect(DAILY_DAYS).toBe(30)
    expect(MONTHLY_DAYS).toBeLessThanOrEqual(90)
  })

  it('covers daily and monthly backups for both environments', () => {
    expect(RETENTION.map((r: { prefix: string }) => r.prefix).sort()).toEqual(['production/daily/', 'production/monthly/', 'staging/daily/', 'staging/monthly/'])
  })

  it('reads back the rules it writes', () => {
    expect(parseLifecycle(lifecycleXml())).toEqual(RETENTION)
    expect(sameRules(parseLifecycle(lifecycleXml()))).toBe(true)
  })

  it('ignores disabled rules and reports differences', () => {
    const xml = `<LifecycleConfiguration><Rule><ID>a</ID><Status>Disabled</Status><Filter><Prefix>production/daily/</Prefix></Filter><Expiration><Days>30</Days></Expiration></Rule>
      <Rule><ID>b</ID><Status>Enabled</Status><Filter><Prefix>production/monthly/</Prefix></Filter><Expiration><Days>366</Days></Expiration></Rule></LifecycleConfiguration>`
    const rules = parseLifecycle(xml)
    expect(rules).toEqual([{ prefix: 'production/monthly/', days: 366 }])
    const { missing, extra } = diffRules(rules)
    expect(missing).toContain('production/daily/ → 30 days')
    expect(extra).toEqual(['production/monthly/ → 366 days'])
  })
})
