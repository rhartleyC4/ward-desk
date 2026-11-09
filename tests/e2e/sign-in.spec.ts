// Signing in with the real form, and where each kind of person ends up. The database decides what
// someone may reach (pgTAP covers that); this checks the app turns it into the right tabs and pages.

import type { Page } from '@playwright/test'
import { LOCAL_PASSWORD, type SeedUser } from '../integration/helpers'
import { expect, mainTabs, test } from './fixtures'

async function signIn(page: Page, user: SeedUser, password = LOCAL_PASSWORD) {
  await page.getByLabel('Email').fill(`${user}@ward.test`)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

const PEOPLE: { user: SeedUser; who: string; landsOn: string; tabs: string[] }[] = [
  { user: 'bishop', who: 'the bishop', landsOn: '/home', tabs: ['Home', 'Meetings', 'Sacrament', 'Requests'] },
  { user: 'second', who: 'a counselor who has not set hours', landsOn: '/hours', tabs: ['Home', 'Meetings', 'Sacrament', 'Requests'] },
  { user: 'secretary', who: 'the executive secretary', landsOn: '/home', tabs: ['Home', 'Meetings', 'Sacrament', 'Appointments', 'Requests'] },
  { user: 'rspres', who: 'a leader on ward council', landsOn: '/agenda', tabs: ['Meetings', 'Requests'] },
]

for (const { user, who, landsOn, tabs } of PEOPLE) {
  test(`${who} signs in and gets the right tabs`, async ({ openApp }) => {
    const page = await openApp()
    await signIn(page, user)
    await expect(page).toHaveURL(new RegExp(`${landsOn}$`))
    await expect(mainTabs(page)).toHaveText(tabs.map((t) => new RegExp(t)))
  })
}

test('a leader with one tab has no tab bar and can find the way back from Settings', async ({ openApp }) => {
  const page = await openApp()
  await signIn(page, 'leader')
  await expect(page).toHaveURL(/\/requests$/)
  await expect(page.getByRole('heading', { name: 'Requests', exact: true })).toBeVisible()
  await expect(mainTabs(page)).toHaveCount(0)

  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await page.getByRole('link', { name: 'Requests' }).click()
  await expect(page).toHaveURL(/\/requests$/)
})

test('a page outside someone’s role sends them to their own', async ({ openApp }) => {
  const page = await openApp('leader')
  await expect(page).toHaveURL(/\/requests$/)
  await page.goto('/appointments')
  await expect(page).toHaveURL(/\/requests$/)
})

test('a wrong password stays on the sign-in page and says so', async ({ openApp }) => {
  const page = await openApp()
  await signIn(page, 'bishop', 'not-the-password')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(mainTabs(page)).toHaveCount(0)
})
