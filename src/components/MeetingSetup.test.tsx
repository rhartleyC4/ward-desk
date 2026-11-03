import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MeetingSetup } from '../lib/queries'
import { bishopricTemplate, profiles, wardCouncilTemplate } from '../test/fixtures'
import { MeetingCard, MeetingForm, type MeetingSetupActions } from './MeetingSetup'

function actions(): MeetingSetupActions {
  return {
    createMeeting: vi.fn(),
    saveMeeting: vi.fn(),
    deleteMeeting: vi.fn(),
    addSection: vi.fn(),
    renameSection: vi.fn(),
    moveSection: vi.fn(),
    deleteSection: vi.fn(),
    addAttendee: vi.fn(),
    removeAttendee: vi.fn(),
  }
}

const setup: MeetingSetup = {
  templates: [bishopricTemplate, wardCouncilTemplate],
  attendees: [{ template_id: 'council', user_id: 'y' }],
  profiles: [
    ...profiles,
    { id: 'y', email: 'rspres@ward.test', display_name: 'Sister Young', short_name: null },
    { id: 'r', email: 'leader@ward.test', display_name: 'Sister Reyes', short_name: null },
  ],
  bishopricIds: ['b', 'l', 'o'],
}

describe('MeetingCard', () => {
  it('shows when the meeting is held and its sections in order', () => {
    render(<MeetingCard template={wardCouncilTemplate} setup={setup} actions={actions()} />)

    expect(screen.getByText('2nd and 4th Sundays')).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rows.slice(0, 3)).toEqual(['Prayer rollPrayer roll', 'General businessItems (carried forward until done)', 'Upcoming assignmentsAssignments due this month'])
    expect(screen.getByRole('button', { name: 'Move Prayer roll up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Closing prayer down' })).toBeDisabled()
  })

  it('reorders, renames, adds and removes sections', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<MeetingCard template={wardCouncilTemplate} setup={setup} actions={a} />)

    await user.click(screen.getByRole('button', { name: 'Move General business up' }))
    expect(a.moveSection).toHaveBeenCalledWith(wardCouncilTemplate, 'council-s2', -1)

    await user.click(screen.getByRole('button', { name: 'Rename Relief Society' }))
    const rename = screen.getByLabelText('Rename Relief Society')
    await user.clear(rename)
    await user.type(rename, 'Relief Society presidency{Enter}')
    expect(a.renameSection).toHaveBeenCalledWith('council-s4', 'Relief Society presidency')

    await user.click(screen.getByRole('button', { name: 'Remove General business' }))
    expect(a.deleteSection).toHaveBeenCalledWith(wardCouncilTemplate.sections[1])

    const add = screen.getByRole('form', { name: 'Add a section to Ward Council' })
    await user.selectOptions(within(add).getByLabelText('Shows'), 'calendar')
    await user.type(within(add).getByLabelText('Section title'), 'Calendar')
    await user.click(within(add).getByRole('button', { name: 'Add' }))
    expect(a.addSection).toHaveBeenCalledWith(wardCouncilTemplate, 'calendar', 'Calendar')
  })

  it('manages attendees, leaving out the bishopric who see everything already', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<MeetingCard template={wardCouncilTemplate} setup={setup} actions={a} />)

    const picker = screen.getByLabelText('Attendee')
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual(['—', 'Sister Reyes'])
    await user.selectOptions(picker, 'Sister Reyes')
    await user.click(within(picker.closest('form')!).getByRole('button', { name: 'Add' }))
    expect(a.addAttendee).toHaveBeenCalledWith('council', 'r')

    await user.click(within(screen.getByRole('button', { name: 'Sister Young' })).getByTestId('CancelIcon'))
    expect(a.removeAttendee).toHaveBeenCalledWith('council', 'y')
  })

  it('edits the schedule and offers deleting any meeting but the bishopric', async () => {
    const user = userEvent.setup()
    const a = actions()
    const { unmount } = render(<MeetingCard template={wardCouncilTemplate} setup={setup} actions={a} />)

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByLabelText('4th'))
    await user.click(screen.getByRole('button', { name: 'Save meeting' }))
    expect(a.saveMeeting).toHaveBeenCalledWith('council', { name: 'Ward Council', weekday: 0, weeks_of_month: [2], start_time: null })

    await user.click(screen.getByRole('button', { name: 'Delete meeting' }))
    expect(a.deleteMeeting).toHaveBeenCalledWith(wardCouncilTemplate)
    unmount()

    render(<MeetingCard template={bishopricTemplate} setup={setup} actions={a} />)
    expect(screen.queryByRole('button', { name: 'Delete meeting' })).not.toBeInTheDocument()
  })
})

describe('MeetingForm', () => {
  it('creates a meeting that is held every week when no weeks are checked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<MeetingForm submitLabel="Create meeting" onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText(/Meeting name/), 'Youth Council')
    await user.selectOptions(screen.getByLabelText('Day'), 'Wednesday')
    await user.type(screen.getByLabelText('Time'), '19:00')
    await user.click(screen.getByRole('button', { name: 'Create meeting' }))
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Youth Council', weekday: 3, weeks_of_month: null, start_time: '19:00' })
  })
})
