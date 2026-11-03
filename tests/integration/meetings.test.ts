import { afterAll, describe, expect, it } from 'vitest'
import {
  addAgendaItem,
  addAgendaSection,
  addAttendee,
  createAgendaTemplate,
  deleteAgendaSection,
  deleteAgendaTemplate,
  loadAgendaTemplates,
  loadMeetingSetup,
  removeAttendee,
  renameAgendaSection,
  reorderAgendaSections,
  resolveAgendaItem,
  updateAgendaTemplate,
} from '../../src/lib/queries'
import { signIn } from './helpers'

const SLUG = `it-${Date.now()}`

afterAll(async () => {
  const bishop = await signIn('bishop')
  const t = (await loadAgendaTemplates(bishop)).find((x) => x.slug === SLUG)
  if (!t) return
  await bishop.from('agenda_items').delete().in('section_id', t.sections.map((s) => s.id))
  await bishop.from('agenda_templates').delete().eq('id', t.id)
})

describe('setting up a meeting', () => {
  it('lets the ward clerk build a meeting that its attendees then see', async () => {
    const clerk = await signIn('clerk')
    await createAgendaTemplate(clerk, { slug: SLUG, name: 'Youth Council', position: 9, weekday: 0, weeks_of_month: [3], start_time: '09:30' })
    let template = (await loadAgendaTemplates(clerk)).find((t) => t.slug === SLUG)!
    await addAgendaSection(clerk, { template_id: template.id, position: 1, kind: 'items', title: 'Activities' })
    await addAgendaSection(clerk, { template_id: template.id, position: 2, kind: 'calendar', title: 'Calendar' })
    await addAgendaSection(clerk, { template_id: template.id, position: 3, kind: 'closing_prayer', title: 'Closing prayer' })
    await updateAgendaTemplate(clerk, template.id, { name: 'Ward Youth Council', weekday: 0, weeks_of_month: [1, 3], start_time: '09:30' })

    template = (await loadAgendaTemplates(clerk)).find((t) => t.slug === SLUG)!
    const [activities, calendar, closing] = template.sections
    await reorderAgendaSections(clerk, template.id, [calendar.id, activities.id, closing.id])
    await renameAgendaSection(clerk, activities.id, 'Youth activities')

    template = (await loadAgendaTemplates(clerk)).find((t) => t.slug === SLUG)!
    expect(template.name).toBe('Ward Youth Council')
    expect(template.weeks_of_month).toEqual([1, 3])
    expect(template.sections.map((s) => s.title)).toEqual(['Calendar', 'Youth activities', 'Closing prayer'])

    const setup = await loadMeetingSetup(clerk)
    const rs = setup.profiles.find((p) => p.email === 'rspres@ward.test')!
    await addAttendee(clerk, template.id, rs.id)
    const rsClient = await signIn('rspres')
    expect((await loadAgendaTemplates(rsClient)).map((t) => t.slug)).toContain(SLUG)
    await removeAttendee(clerk, template.id, rs.id)
    expect((await loadAgendaTemplates(rsClient)).map((t) => t.slug)).not.toContain(SLUG)
  })

  it('keeps open items and used meetings from being deleted', async () => {
    const bishop = await signIn('bishop')
    const template = (await loadAgendaTemplates(bishop)).find((t) => t.slug === SLUG)!
    const activities = template.sections.find((s) => s.title === 'Youth activities')!
    await addAgendaItem(bishop, activities, `${SLUG} Service project`)

    await expect(deleteAgendaSection(bishop, activities.id)).rejects.toThrow('This section still has open items. Mark them done first.')
    await expect(deleteAgendaTemplate(bishop, template.id)).rejects.toThrow(/already has agendas or items/)

    const { data } = await bishop.from('agenda_items').select('id').eq('section_id', activities.id).single()
    await resolveAgendaItem(bishop, data!.id, '2030-06-02')
    await deleteAgendaSection(bishop, activities.id)
    expect((await loadAgendaTemplates(bishop)).find((t) => t.slug === SLUG)!.sections.map((s) => s.title)).toEqual(['Calendar', 'Closing prayer'])

    await deleteAgendaTemplate(bishop, template.id)
    expect((await loadAgendaTemplates(bishop)).map((t) => t.slug)).not.toContain(SLUG)
  })

  it('refuses leaders', async () => {
    const leader = await signIn('rspres')
    await expect(
      createAgendaTemplate(leader, { slug: `${SLUG}-x`, name: 'Not allowed', position: 9, weekday: 0, weeks_of_month: null, start_time: null }),
    ).rejects.toThrow(/row-level security/)
    const [council] = await loadAgendaTemplates(leader)
    await expect(deleteAgendaSection(leader, council.sections[0].id)).rejects.toThrow('Only the bishopric can change meetings')
  })
})
