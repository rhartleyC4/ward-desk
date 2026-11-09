// What the end-to-end journeys share: opening the app as a seeded person, the local database for
// setting up and cleaning away a test's own rows, and ways to read the main tabs.

import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { LOCAL_PASSWORD, type SeedUser } from '../integration/helpers'

const apiUrl = process.env.E2E_API_URL!
const anonKey = process.env.E2E_ANON_KEY!

// Supabase limits sign-ins per address, so each person signs in through the API only once per run.
const sessions = new Map<SeedUser, string>()

async function sessionFor(user: SeedUser): Promise<string> {
  const known = sessions.get(user)
  if (known) return known
  const client = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signInWithPassword({ email: `${user}@ward.test`, password: LOCAL_PASSWORD })
  if (error || !data.session) throw new Error(`Could not sign in as ${user}: ${error?.message}. Is local Supabase running and seeded?`)
  const session = JSON.stringify(data.session)
  sessions.set(user, session)
  return session
}

const storageKey = () => `sb-${new URL(apiUrl).hostname.split('.')[0]}-auth-token`

type Fixtures = {
  /** Opens the app at `/` in its own browser profile, signed in as this person, or signed out. */
  openApp: (user?: SeedUser) => Promise<Page>
}

type WorkerFixtures = { sql: postgres.Sql }

export const test = base.extend<Fixtures, WorkerFixtures>({
  sql: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright requires the destructuring here
    async ({}, provide) => {
      const sql = postgres(process.env.E2E_DB_URL!, { max: 1, onnotice: () => {} })
      await provide(sql)
      await sql.end()
    },
    { scope: 'worker' },
  ],

  openApp: async ({ browser }, provide) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = []
    const crashes: string[] = []

    await provide(async (user) => {
      const context = await browser.newContext()
      contexts.push(context)
      const session = user ? await sessionFor(user) : null
      await context.addInitScript(
        ([key, value]) => {
          if (value) localStorage.setItem(key, value)
          localStorage.setItem('ward-desk:install-dismissed', '1')
        },
        [storageKey(), session] as const,
      )
      const page = await context.newPage()
      page.on('pageerror', (e) => crashes.push(`${user ?? 'signed out'} at ${page.url()}: ${e.message}`))
      await page.goto('/')
      return page
    })

    await Promise.all(contexts.map((c) => c.close()))
    expect(crashes, 'uncaught errors in the page').toEqual([])
  },
})

export { expect }

/** A name no other run or test is using, so a test can find and remove exactly its own rows. */
export const uniqueName = (what: string) => `E2E ${what} ${randomUUID().slice(0, 8)}`

/** The main tabs on show: the row along the top on a desktop, or the bar along the bottom on a phone. */
export const mainTabs = (page: Page): Locator => page.locator('[aria-label="Main"] a:visible')

export const mainTab = (page: Page, label: string): Locator => page.locator(`[aria-label="Main"] a[aria-label^="${label}"]:visible`)

/**
 * The number on a tab's badge. Only for a tab the test knows has at least one thing waiting: until
 * the counts load a tab looks the same as one with nothing on it.
 */
export async function badgeCount(page: Page, label: string): Promise<number> {
  const tab = mainTab(page, label)
  await expect(tab).toHaveAttribute('aria-label', new RegExp(`^${label} \\(\\d+ `))
  return Number((await tab.getAttribute('aria-label'))!.match(/\((\d+) /)![1])
}

export async function expectBadge(page: Page, label: string, count: number) {
  const tab = mainTab(page, label)
  if (count) {
    await expect(tab).toHaveAttribute('aria-label', new RegExp(`^${label} \\(${count} `))
    await expect(tab).toContainText(String(count))
  } else {
    await expect(tab).toHaveAttribute('aria-label', label)
  }
}

/** Marks the page, so `expectNoReload` can tell the app updated in place. */
export const markPage = (page: Page) => page.evaluate(() => document.documentElement.setAttribute('data-e2e-same-page', ''))

export const expectNoReload = (page: Page) => expect(page.locator('html[data-e2e-same-page]')).toHaveCount(1)
