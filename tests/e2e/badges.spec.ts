// The tab badge has to follow what's done on the page. People stay on Home, so a count that only
// catches up on the next page change sits there wrong, on the tab and on the app icon.

import { badgeCount, expect, expectBadge, expectNoReload, markPage, test, uniqueName } from './fixtures'

const FIRST_COUNSELOR = '00000000-0000-0000-0000-000000000001'

test.describe('the Home badge', () => {
  const person = uniqueName('Member')

  test.afterEach(async ({ sql }) => {
    await sql`delete from public.interviews where person_name = ${person}`
  })

  test('drops without a reload when an appointment is reported', async ({ openApp, sql }) => {
    await sql`
      insert into public.interviews (interviewer_id, scheduled_at, person_name, purpose, duration_minutes)
      values (${FIRST_COUNSELOR}, now() - interval '2 hours', ${person}, 'other', 15)`

    const page = await openApp('first')
    await expect(page).toHaveURL(/\/home$/)
    const before = await badgeCount(page, 'Home')
    const appointment = page.getByRole('article', { name: person })
    await expect(appointment).toBeVisible()

    await markPage(page)
    await appointment.getByRole('button', { name: 'Done', exact: true }).click()

    await expect(appointment).toHaveCount(0)
    await expectBadge(page, 'Home', before - 1)
    await expectNoReload(page)
  })
})
