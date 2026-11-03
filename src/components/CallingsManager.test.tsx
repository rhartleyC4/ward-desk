import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { agendaData } from '../test/fixtures'
import { CallingsManager, type CallingsActions } from './CallingsManager'

function actions(): CallingsActions {
  return { addNeed: vi.fn(), updateNeed: vi.fn(), addCandidate: vi.fn(), updateCandidate: vi.fn(), acceptCandidate: vi.fn(), assignAppointment: vi.fn() }
}

const need = (title: string) => screen.getByRole('article', { name: title })

describe('CallingsManager', () => {
  it('shows who meets with an approved name and when', () => {
    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={actions()} timeZone="America/Denver" />)

    const primary = need('Primary Teacher')
    expect(within(primary).getByText('Release:')).toBeInTheDocument()
    expect(within(primary).getByLabelText('Who meets with Sister Nash')).toHaveValue('l')
    expect(within(primary).getByText('Sun, Nov 8, 10:00 AM')).toBeInTheDocument()

    // Accepted names get a sustain date instead of an appointment.
    const rs = need('RS Teacher')
    expect(within(rs).queryByLabelText('Who meets with Sister Moss')).not.toBeInTheDocument()
    expect(within(rs).getByLabelText('Sustain on')).toHaveValue('2026-11-01')
  })

  it('says when an assigned appointment still needs a time', () => {
    const data = agendaData()
    data.appointments = [{ ...data.appointments[0], scheduled_at: null }]
    render(<CallingsManager date="2026-10-25" data={data} actions={actions()} timeZone="America/Denver" />)
    expect(within(need('Primary Teacher')).getByText('Waiting to be scheduled')).toBeInTheDocument()
  })

  it('assigns the appointment once a name is approved', async () => {
    const user = userEvent.setup()
    const a = actions()
    const data = agendaData()
    render(<CallingsManager date="2026-10-25" data={data} actions={a} timeZone="America/Denver" />)

    await user.selectOptions(screen.getByLabelText('Who meets with Sister Nash'), 'Brother Ortiz')
    expect(a.assignAppointment).toHaveBeenCalledWith(data.candidates[2], 'o')
    await user.selectOptions(screen.getByLabelText('Who meets with Sister Nash'), '—')
    expect(a.assignAppointment).toHaveBeenLastCalledWith(data.candidates[2], null)
  })

  it('records an acceptance so it moves to Sustainings', async () => {
    const user = userEvent.setup()
    const a = actions()
    const data = agendaData()
    render(<CallingsManager date="2026-10-25" data={data} actions={a} timeZone="America/Denver" />)

    await user.selectOptions(screen.getByLabelText('Status for Sister Nash'), 'Accepted')
    expect(a.acceptCandidate).toHaveBeenCalledWith(data.candidates[2])
    expect(a.updateCandidate).not.toHaveBeenCalled()
  })

  it('drops a calling on the Sunday its accepted name is sustained', () => {
    render(<CallingsManager date="2026-11-01" data={agendaData()} actions={actions()} timeZone="America/Denver" />)
    expect(screen.queryByRole('article', { name: 'RS Teacher' })).not.toBeInTheDocument()
    expect(need('Primary Teacher')).toBeInTheDocument()
  })

  it('does everything the callings tab did', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={a} timeZone="America/Denver" />)

    await user.selectOptions(screen.getByLabelText('Status for Sister Nash'), 'Extended')
    expect(a.updateCandidate).toHaveBeenCalledWith('c3', { status: 'extended' })

    await user.type(within(need('Sunday School')).getByLabelText('Name to consider for Sunday School'), 'Brother Hale')
    await user.click(within(need('Sunday School')).getByRole('button', { name: 'Add' }))
    expect(a.addCandidate).toHaveBeenCalledWith('n3', 'Brother Hale')

    await user.click(within(need('Sunday School')).getByRole('button', { name: 'Mark filled' }))
    expect(a.updateNeed).toHaveBeenCalledWith('n3', { status: 'filled' })

    await user.selectOptions(screen.getByLabelText('Attach Brother Vale to a calling'), 'Primary Teacher')
    expect(a.updateCandidate).toHaveBeenCalledWith('c2', { need_id: 'n1', status: 'discussing' })

    const form = screen.getByRole('form', { name: 'Add a calling to fill' })
    await user.type(within(form).getByLabelText('Calling'), 'Ward Librarian')
    await user.type(within(form).getByLabelText('Releasing (optional)'), 'Sister Ames')
    await user.click(within(form).getByRole('button', { name: 'Add' }))
    expect(a.addNeed).toHaveBeenCalledWith({ calling_title: 'Ward Librarian', release_name: 'Sister Ames' })
  })
})
