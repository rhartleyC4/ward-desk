// Live updates: what one person does shows up on another person's open page, without a reload.

import type { Locator } from '@playwright/test'
import { expect, expectNoReload, mainTab, markPage, test, uniqueName } from './fixtures'

const chip = (request: Locator, label: string) => request.getByText(label, { exact: true })

test.describe('live updates', () => {
  const title = uniqueName('Bring the hymnbooks')

  test.afterEach(async ({ sql }) => {
    await sql`delete from public.requests where title = ${title}`
  })

  test("a request appears on the other person's open page, and its answer comes back", async ({ openApp }) => {
    // She's already looking at her requests before anything is sent.
    const leader = await openApp('rspres')
    await leader.goto('/requests')
    await expect(mainTab(leader, 'Requests')).toBeVisible()
    await expect(leader.getByRole('progressbar')).toHaveCount(0)
    await markPage(leader)

    const bishop = await openApp('bishop')
    await bishop.goto('/requests')
    await bishop.getByRole('button', { name: /Ask someone to do something/ }).click()
    await bishop.getByRole('combobox', { name: /Who is it for/ }).selectOption({ label: 'Sister Young' })
    await bishop.getByRole('button', { name: 'Next' }).click()
    await bishop.getByLabel('In a few words').fill(title)
    await bishop.getByRole('button', { name: 'Send request' }).click()
    await bishop.getByRole('button', { name: 'Done', exact: true }).click()
    const sent = bishop.getByRole('article', { name: title })
    await expect(chip(sent, 'Not seen yet')).toBeVisible()
    await markPage(bishop)

    // It turns up for her without her doing anything.
    const received = leader.getByRole('article', { name: title })
    await expect(chip(received, 'New')).toBeVisible()
    await expectNoReload(leader)

    // And when she answers, the bishop's open page follows.
    await received.getByRole('button', { name: 'Got it' }).click()
    await expect(chip(sent, 'Seen')).toBeVisible()
    await expectNoReload(bishop)
  })
})
