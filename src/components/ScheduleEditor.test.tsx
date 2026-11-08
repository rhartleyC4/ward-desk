import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { profiles } from '../test/fixtures'
import { ScheduleEditor, type ScheduleActions, type ScheduleData } from './ScheduleEditor'

const ts = '2026-11-01T12:00:00Z'

function data(): ScheduleData {
  return {
    events: [
      { id: 'e1', title: 'Bishopric meeting', weekday: 0, week_of_month: null, start_time: '08:30:00', notes: null, created_at: ts, reminder_by: null, agenda_template_id: null },
      { id: 'e2', title: 'Ward Council', weekday: 0, week_of_month: 2, start_time: '09:15:00', notes: null, created_at: ts, reminder_by: null, agenda_template_id: null },
    ],
    rotations: [
      { id: 'r1', title: 'Primary message', assignee_id: 'l', assignee_label: null, months: [3, 6, 9, 12], weekday: 0, week_of_month: 3, notes: null, created_at: ts },
      { id: 'r2', title: 'PPI: EQ President', assignee_id: null, assignee_label: 'EQ President', months: [10, 2, 6], weekday: null, week_of_month: null, notes: null, created_at: ts },
    ],
    stewardships: [{ id: 's1', user_id: 'l', area: 'Sunday School', notes: null, created_at: ts }],
    profiles,
    bishopric: profiles,
    secretaries: [{ id: 'exec', email: 'secretary@ward.test', display_name: 'Brother Quinn', short_name: 'Quinn' }],
    agendaTemplates: [{ id: 'wc', name: 'Ward Council' }],
  }
}

function setup(canEdit = true) {
  const actions: ScheduleActions = {
    saveEvent: vi.fn(async () => true),
    deleteEvent: vi.fn(async () => true),
    saveRotation: vi.fn(async () => true),
    deleteRotation: vi.fn(async () => true),
    addStewardship: vi.fn(async () => true),
    deleteStewardship: vi.fn(async () => true),
  }
  render(<ScheduleEditor data={data()} canEdit={canEdit} actions={actions} busy={false} />)
  return { actions, user: userEvent.setup() }
}

const card = (title: string) => screen.getByRole('heading', { name: title }).closest('section')!

describe('ScheduleEditor', () => {
  it('lets a secretary be picked to send a meeting\'s reminders', async () => {
    const { actions, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Edit Ward Council' }))
    const form = within(screen.getByRole('form', { name: 'Edit Ward Council' }))
    await user.selectOptions(form.getByLabelText('Who reminds people the day before'), 'Brother Quinn')
    await user.selectOptions(form.getByLabelText('Its agenda'), 'Ward Council')
    await user.click(form.getByRole('button', { name: 'Save' }))
    expect(actions.saveEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ward Council', reminder_by: 'exec', agenda_template_id: 'wc' }), 'e2')
  })

  it('says on both title fields that they show on lock screens', async () => {
    const { user } = setup()
    const helper = "Shows on lock screens. Keep it general, like 'Primary message', not a name."
    await user.click(screen.getByRole('button', { name: 'Add a meeting' }))
    expect(within(screen.getByRole('form', { name: 'New meeting' })).getByText(helper)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Add a rotation' }))
    expect(within(screen.getByRole('form', { name: 'New rotation' })).getByText(helper)).toBeInTheDocument()
  })

  it('warns, without blocking, when a meeting title has a member\'s name', async () => {
    const { actions, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Add a meeting' }))
    const form = within(screen.getByRole('form', { name: 'New meeting' }))
    expect(form.queryByRole('status')).not.toBeInTheDocument()
    await user.type(form.getByLabelText(/Meeting/), 'lunch with lane')
    expect(form.getByRole('status')).toHaveTextContent('Lane')
    await user.click(form.getByRole('button', { name: 'Add meeting' }))
    expect(actions.saveEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'lunch with lane' }))
  })

  it('warns when a rotation title has the name typed as its assignee', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Add a rotation' }))
    const form = within(screen.getByRole('form', { name: 'New rotation' }))
    await user.selectOptions(form.getByLabelText('Whose turn'), 'Someone not in the app')
    await user.type(form.getByLabelText('Who (optional)'), 'Dana')
    await user.type(form.getByLabelText(/Rotation/), 'Dana talk')
    expect(form.getByRole('status')).toHaveTextContent('Dana')
    await user.clear(form.getByLabelText(/Rotation/))
    await user.type(form.getByLabelText(/Rotation/), 'Primary message')
    expect(form.queryByRole('status')).not.toBeInTheDocument()
  })

  it('lists meetings, rotations with their day and months, and assignments', () => {
    setup(false)
    expect(within(card('Regular meetings')).getByText('Every Sunday, 8:30')).toBeInTheDocument()
    expect(within(card('Regular meetings')).getByText('2nd Sunday, 9:15')).toBeInTheDocument()
    expect(within(card('Rotations')).getByText('Primary message — Lane')).toBeInTheDocument()
    expect(within(card('Rotations')).getByText('3rd Sunday · Mar, Jun, Sep, Dec')).toBeInTheDocument()
    expect(within(card('Rotations')).getByText('PPI: EQ President — EQ President')).toBeInTheDocument()
    expect(within(card('Rotations')).getByText('Feb, Jun, Oct')).toBeInTheDocument()
    expect(within(card('Bishopric assignments')).getByText('Sunday School')).toBeInTheDocument()
  })

  it('offers no editing to someone who cannot change it', () => {
    setup(false)
    expect(screen.queryByRole('button', { name: /^Add|^Edit/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Add an assignment' })).not.toBeInTheDocument()
  })

  it('adds a meeting on a set week of the month', async () => {
    const { actions, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Add a meeting' }))
    const form = within(screen.getByRole('form', { name: 'New meeting' }))
    await user.type(form.getByLabelText(/Meeting/), 'Youth council')
    await user.selectOptions(form.getByLabelText('Which weeks'), '3rd only')
    await user.type(form.getByLabelText('Time (optional)'), '09:30')
    await user.click(form.getByRole('button', { name: 'Add meeting' }))
    expect(actions.saveEvent).toHaveBeenCalledWith({ title: 'Youth council', weekday: 0, week_of_month: 3, start_time: '09:30', reminder_by: null, agenda_template_id: null })
  })

  it('changes and deletes a meeting', async () => {
    const { actions, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Edit Ward Council' }))
    const form = within(screen.getByRole('form', { name: 'Edit Ward Council' }))
    await user.selectOptions(form.getByLabelText('Which weeks'), '4th only')
    await user.click(form.getByRole('button', { name: 'Save' }))
    expect(actions.saveEvent).toHaveBeenCalledWith({ title: 'Ward Council', weekday: 0, week_of_month: 4, start_time: '09:15', reminder_by: null, agenda_template_id: null }, 'e2')

    await user.click(screen.getByRole('button', { name: 'Edit Bishopric meeting' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(actions.deleteEvent).toHaveBeenCalledWith('e1')
  })

  it('adds a rotation for a counselor on a set Sunday', async () => {
    const { actions, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Add a rotation' }))
    const form = within(screen.getByRole('form', { name: 'New rotation' }))
    const add = form.getByRole('button', { name: 'Add rotation' })
    await user.type(form.getByLabelText(/Rotation/), 'Primary message')
    expect(add).toBeDisabled() // no months yet
    await user.selectOptions(form.getByLabelText('Whose turn'), 'Brother Ortiz')
    await user.click(form.getByRole('button', { name: 'May' }))
    await user.click(form.getByRole('button', { name: 'Feb' }))
    await user.selectOptions(form.getByLabelText('Week'), '3rd')
    expect(form.getByText('Reminds whoever has the turn on that day.')).toBeInTheDocument()
    await user.click(add)
    expect(actions.saveRotation).toHaveBeenCalledWith({ title: 'Primary message', assignee_id: 'o', assignee_label: null, months: [2, 5], week_of_month: 3, weekday: 0 })
  })

  it('edits a rotation for someone outside the app and its months', async () => {
    const { actions, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Edit PPI: EQ President (EQ President)' }))
    const form = within(screen.getByRole('form', { name: 'Edit PPI: EQ President' }))
    expect(form.getByLabelText('Whose turn')).toHaveValue('other')
    expect(form.getByText('Reminds the whole bishopric on the 1st of each month it’s due.')).toBeInTheDocument()
    expect(form.getByRole('button', { name: 'Feb' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(form.getByRole('button', { name: 'Feb' }))
    await user.click(form.getByRole('button', { name: 'Save' }))
    expect(actions.saveRotation).toHaveBeenCalledWith(
      { title: 'PPI: EQ President', assignee_id: null, assignee_label: 'EQ President', months: [6, 10], week_of_month: null, weekday: null },
      'r2',
    )
  })

  it('warns when an organization is already covered, and refuses a repeat', async () => {
    const { user } = setup()
    const form = within(screen.getByRole('form', { name: 'Add an assignment' }))
    await user.selectOptions(form.getByLabelText('Who'), 'Brother Lane')
    await user.selectOptions(form.getByLabelText('Area'), 'Something else…')
    await user.type(form.getByLabelText('Other area'), 'sunday school')
    expect(form.getByRole('button', { name: 'Add' })).toBeDisabled()

    await user.selectOptions(form.getByLabelText('Who'), 'Brother Ortiz')
    await user.selectOptions(form.getByLabelText('Area'), 'Sunday School')
    expect(form.getByText("Brother Lane also covers Sunday School, so Meets with won't fill in for its callings.")).toBeInTheDocument()
    expect(form.getByRole('button', { name: 'Add' })).toBeEnabled()
  })

  it('adds and removes an assignment', async () => {
    const { actions, user } = setup()
    const form = within(screen.getByRole('form', { name: 'Add an assignment' }))
    await user.selectOptions(form.getByLabelText('Who'), 'Brother Ortiz')
    await user.selectOptions(form.getByLabelText('Area'), 'Primary')
    await user.click(form.getByRole('button', { name: 'Add' }))
    expect(actions.addStewardship).toHaveBeenCalledWith('o', 'Primary')

    await user.selectOptions(form.getByLabelText('Area'), 'Something else…')
    await user.type(form.getByLabelText('Other area'), 'Young Single Adults')
    await user.click(form.getByRole('button', { name: 'Add' }))
    expect(actions.addStewardship).toHaveBeenLastCalledWith('o', 'Young Single Adults')

    const chip = within(card('Bishopric assignments')).getByRole('button', { name: 'Sunday School' })
    await user.click(within(chip).getByTestId('CancelIcon'))
    expect(actions.deleteStewardship).toHaveBeenCalledWith('s1')
  })
})
