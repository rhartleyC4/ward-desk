// A request going from one person to another and back, each in their own browser.

import type { Locator } from '@playwright/test'
import { badgeCount, expect, expectBadge, expectNoReload, markPage, test, uniqueName } from './fixtures'

const chip = (request: Locator, label: string) => request.getByText(label, { exact: true })

test.describe('a request between two people', () => {
  const title = uniqueName('Set up chairs')

  test.afterEach(async ({ sql }) => {
    await sql`delete from public.requests where title = ${title}`
  })

  test('is sent, seen, finished, and the sender follows along', async ({ openApp }) => {
    // The bishop asks through the two-step form.
    const bishop = await openApp('bishop')
    await bishop.goto('/requests')
    await bishop.getByRole('button', { name: /Ask someone to do something/ }).click()
    await bishop.getByRole('combobox', { name: /Who is it for/ }).selectOption({ label: 'Sister Young' })
    await bishop.getByRole('button', { name: 'Next' }).click()
    await bishop.getByLabel('In a few words').fill(title)
    await bishop.getByLabel('Details (optional)').fill('Before the fireside on Sunday.')
    await bishop.getByRole('button', { name: 'Send request' }).click()
    await expect(bishop.getByRole('status').filter({ hasText: 'Sister Young will see it' })).toBeVisible()
    await bishop.getByRole('button', { name: 'Done', exact: true }).click()

    const sent = bishop.getByRole('article', { name: title })
    await expect(chip(sent, 'Not seen yet')).toBeVisible()

    // It reaches her, with a badge, and only she answers it.
    const leader = await openApp('rspres')
    await leader.goto('/requests')
    const waiting = await badgeCount(leader, 'Requests')
    const received = leader.getByRole('article', { name: title })
    await expect(received.getByText('From Bishop Avery')).toBeVisible()
    await expect(received.getByText('Before the fireside on Sunday.')).toBeVisible()
    await expect(chip(received, 'New')).toBeVisible()

    await markPage(leader)
    await received.getByRole('button', { name: 'Got it' }).click()
    await expect(chip(received, 'New')).toHaveCount(0)
    await expectBadge(leader, 'Requests', waiting - 1)
    await expectNoReload(leader)

    await bishop.reload()
    await expect(chip(sent, 'Seen')).toBeVisible()

    // She finishes it with a note, and the bishop reads it.
    await received.getByRole('button', { name: "It's done" }).click()
    await leader.getByLabel('Anything to add? (optional)').fill('All set up in the cultural hall.')
    await leader.getByRole('button', { name: 'Mark done' }).click()
    await expect(leader.getByText('Finished lately')).toBeVisible()
    await expect(received.getByRole('button', { name: 'Reopen' })).toBeVisible()

    await bishop.reload()
    await expect(chip(sent, 'Done')).toBeVisible()
    await expect(sent.getByText('All set up in the cultural hall.')).toBeVisible()
  })
})
