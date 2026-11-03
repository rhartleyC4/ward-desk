import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { agendaData } from '../test/fixtures'
import { CallingsManager, type CallingsActions } from './CallingsManager'

function actions(): CallingsActions {
  return { addNeed: vi.fn(), updateNeed: vi.fn(), deleteNeed: vi.fn(), addCandidate: vi.fn(), updateCandidate: vi.fn(), acceptCandidate: vi.fn(), assignAppointment: vi.fn() }
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

  it('offers only the steps the bishopric uses, showing older statuses as the nearest one', () => {
    const data = agendaData()
    data.candidates[2] = { ...data.candidates[2], status: 'extended' }
    render(<CallingsManager date="2026-10-25" data={data} actions={actions()} timeZone="America/Denver" />)
    const status = screen.getByLabelText('Status for Sister Nash')
    expect(within(status).getAllByRole('option').map((o) => o.textContent)).toEqual(['Considering', 'Approved', 'Accepted', 'Declined'])
    expect(status).toHaveValue('approved')
  })

  it('shows Announce on only once a name has accepted', () => {
    const data = agendaData()
    data.needs[1] = { ...data.needs[1], release_name: 'Sister Hale' }
    render(<CallingsManager date="2026-10-25" data={data} actions={actions()} timeZone="America/Denver" />)
    expect(within(need('Primary Teacher')).queryByLabelText('Announce on')).not.toBeInTheDocument()
    expect(within(need('RS Teacher')).getByLabelText('Announce on')).toBeInTheDocument()
  })

  it('hides the name box behind a button once a calling has a name', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={a} timeZone="America/Denver" />)

    const primary = need('Primary Teacher')
    expect(within(primary).queryByLabelText('Name to consider for Primary Teacher')).not.toBeInTheDocument()
    await user.click(within(primary).getByRole('button', { name: 'Add name' }))
    await user.type(within(primary).getByLabelText('Name to consider for Primary Teacher'), 'Brother Hale{Enter}')
    expect(a.addCandidate).toHaveBeenCalledWith('n1', 'Brother Hale')
    expect(within(primary).queryByLabelText('Name to consider for Primary Teacher')).not.toBeInTheDocument()
  })

  it('adds the person being released after the calling was created', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={a} timeZone="America/Denver" />)

    const rs = need('RS Teacher')
    await user.click(within(rs).getByRole('button', { name: 'Releasing' }))
    await user.type(within(rs).getByLabelText('Releasing from RS Teacher'), 'Sister Hale{Enter}')
    expect(a.updateNeed).toHaveBeenCalledWith('n2', { release_name: 'Sister Hale' })
  })

  it('removes a calling only after confirming', async () => {
    const user = userEvent.setup()
    const a = actions()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={a} timeZone="America/Denver" />)

    const remove = within(need('Sunday School')).getByRole('button', { name: 'Remove Sunday School' })
    await user.click(remove)
    expect(a.deleteNeed).not.toHaveBeenCalled()
    await user.click(remove)
    expect(a.deleteNeed).toHaveBeenCalledWith('n3')
    confirm.mockRestore()
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

    await user.selectOptions(screen.getByLabelText('Status for Sister Nash'), 'Declined')
    expect(a.updateCandidate).toHaveBeenCalledWith('c3', { status: 'declined' })

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
