import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { meeting, profiles, programItem } from '../test/fixtures'
import { MeetingEditor, type MeetingForm } from './MeetingEditor'

describe('MeetingEditor', () => {
  it('plans a new Sunday with conducting, hymns, and speakers', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<(form: MeetingForm) => void>()
    render(<MeetingEditor date="2026-11-22" meeting={undefined} items={[]} bishopric={profiles} onSave={onSave} onCancel={() => {}} />)

    await user.selectOptions(screen.getByLabelText('Conducting'), 'Brother Lane')
    await user.type(screen.getByLabelText('Opening hymn'), '19')
    await user.click(screen.getByRole('button', { name: 'Add program item' }))
    await user.type(screen.getByLabelText('Speaker'), 'Sister Hale')
    await user.type(screen.getByLabelText('Topic'), 'Gratitude')
    await user.click(screen.getByRole('button', { name: 'Add program item' }))
    // The second item is left blank and should be dropped on save.
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledOnce()
    const form = onSave.mock.calls[0][0]
    expect(form.meeting).toMatchObject({ meeting_date: '2026-11-22', conducting_id: 'l', opening_hymn: 19 })
    expect(form.items).toEqual([expect.objectContaining({ kind: 'talk', person_name: 'Sister Hale', topic: 'Gratitude' })])
  })

  it('reorders the program', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<(form: MeetingForm) => void>()
    const m = meeting('2026-11-08')
    const items = [programItem(m.id, 1, { person_name: 'First' }), programItem(m.id, 2, { person_name: 'Second' })]
    render(<MeetingEditor date={m.meeting_date} meeting={m} items={items} bishopric={profiles} onSave={onSave} onCancel={() => {}} />)

    const second = screen.getByDisplayValue('Second').closest('[data-program-item]') as HTMLElement
    await user.click(within(second).getByRole('button', { name: 'Move up' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave.mock.calls[0][0].items.map((i) => i.person_name)).toEqual(['Second', 'First'])
  })

  it('starts a new first Sunday as Fast Sunday', () => {
    render(<MeetingEditor date="2026-12-06" meeting={undefined} items={[]} bishopric={profiles} onSave={() => {}} onCancel={() => {}} />)
    expect(screen.getByLabelText('Type')).toHaveValue('fast_sunday')
  })

  it('starts other new Sundays as regular', () => {
    render(<MeetingEditor date="2026-12-13" meeting={undefined} items={[]} bishopric={profiles} onSave={() => {}} onCancel={() => {}} />)
    expect(screen.getByLabelText('Type')).toHaveValue('regular')
  })

  it('keeps the saved type on a first Sunday', () => {
    const m = { ...meeting('2027-04-04'), meeting_type: 'general_conference' as const }
    render(<MeetingEditor date={m.meeting_date} meeting={m} items={[]} bishopric={profiles} onSave={() => {}} onCancel={() => {}} />)
    expect(screen.getByLabelText('Type')).toHaveValue('general_conference')
  })

  it('hides the plan on a conference Sunday and brings it back for a regular one', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<(form: MeetingForm) => void>()
    const m = { ...meeting('2027-04-04'), opening_hymn: 19 }
    const items = [programItem(m.id, 1, { person_name: 'Sister Hale' })]
    render(<MeetingEditor date={m.meeting_date} meeting={m} items={items} bishopric={profiles} onSave={onSave} onCancel={() => {}} />)

    await user.selectOptions(screen.getByLabelText('Type'), 'general_conference')
    expect(screen.getByText(/no sacrament meeting to plan/)).toBeInTheDocument()
    for (const label of ['Presiding', 'Conducting', 'Opening hymn', 'Invocation']) expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add program item' })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Type'), 'regular')
    expect(screen.getByLabelText('Opening hymn')).toHaveValue('19')
    expect(screen.getByDisplayValue('Sister Hale')).toBeInTheDocument()
  })

  it('asks for a title on a special program', async () => {
    const user = userEvent.setup()
    render(<MeetingEditor date="2026-12-20" meeting={undefined} items={[]} bishopric={profiles} onSave={() => {}} onCancel={() => {}} />)
    expect(screen.queryByLabelText('Program title')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Type'), 'special_program')
    expect(screen.getByLabelText('Program title')).toBeInTheDocument()
  })
})
