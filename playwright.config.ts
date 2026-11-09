// End-to-end journeys: the real UI in a real browser against local Supabase and its seed data.
// Needs `npm run db:start`. Run with `npm run test:e2e`. E2E_PORT moves the app off its default port,
// for when another worktree is running these at the same time.

import { defineConfig, devices } from '@playwright/test'
import { execSync } from 'node:child_process'

// Set once here so the test workers, which load this file too, inherit them.
if (!process.env.E2E_DB_URL) {
  const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  process.env.E2E_API_URL = status.API_URL
  process.env.E2E_ANON_KEY = status.ANON_KEY
  process.env.E2E_DB_URL = status.DB_URL
}

const apiUrl = process.env.E2E_API_URL!
const dbUrl = process.env.E2E_DB_URL!
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(apiUrl) || !/@(127\.0\.0\.1|localhost):/.test(dbUrl)) {
  throw new Error('End-to-end tests only run against a local Supabase.')
}

const port = process.env.E2E_PORT ?? '5188'
const ci = !!process.env.CI

export default defineConfig({
  testDir: 'tests/e2e',
  // The journeys share the seeded accounts, so one at a time keeps one test's badges out of another's.
  workers: 1,
  timeout: 60_000,
  // Above the default 5 seconds: parallel worktrees can leave this machine badly short of CPU.
  expect: { timeout: 10_000 },
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'en-US',
    timezoneId: 'America/Denver',
    contextOptions: { reducedMotion: 'reduce' },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Desktop has a tab row and phones a bottom bar, and most people use this on a phone.
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // The dev server, not a build: password sign-in for the seed accounts only exists in dev.
    command: `npx vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    // Never reuse a server: one left running could be another worktree's code.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: apiUrl,
      VITE_SUPABASE_ANON_KEY: process.env.E2E_ANON_KEY!,
      VITE_WARD_NAME: 'Ward Desk',
      VITE_WARD_TIME_ZONE: 'America/Denver',
      VITE_ENABLE_GOOGLE: 'false',
      // Not the training site, whatever a local .env says.
      VITE_APP_ENV: '',
      VITE_PRACTICE_PASSWORD: '',
    },
  },
})
