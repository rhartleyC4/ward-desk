import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { agendaData } from '../test/fixtures'
import { CallingsManager, type CallingsActions } from './CallingsManager'

function actions(): CallingsActions {
  return { addNeed: vi.fn(), updateNeed: vi.fn(), setApart: vi.fn(), deleteNeed: vi.fn(), addCandidate: vi.fn(), updateCandidate: vi.fn(), acceptCandidate: vi.fn(), approveCandidate: vi.fn(), assignAppointment: vi.fn(), receiveCallingRequest: vi.fn() }
}

const need = (title: string) => screen.getByRole('article', { name: title })
const menuItems = () => screen.getAllByRole('menuitem').map((m) => m.textContent)

describe('CallingsManager', () => {
  it('shows who meets with an approved name and when', () => {
    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={actions()} timeZone="America/Denver" />)

    const primary = need('Primary Teacher')
    expect(within(primary).getByText('Releasing Brother Ivey')).toBeInTheDocument()
    expect(within(primary).getByLabelText('Who meets with Sister Nash')).toHaveValue('l')
    expect(within(primary).getByText('Sun, Nov 8, 10:00 AM')).toBeInTheDocument()

    // Accepted names get a sustain date instead of an appointment.
    const rs = need('RS Teacher')
    expect(within(rs).queryByLabelText('Who meets with Sister Moss')).not.toBeInTheDocument()
    expect(within(rs).getByLabelText('Sustain Sister Moss on')).toHaveValue('2026-11-01')
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

  it("hands an approved name to the leader assigned to the calling's organization", async () => {
    const user = userEvent.setup()
    const a = actions()
    const data = agendaData({ appointments: [], stewardships: [{ id: 's1', user_id: 'o', area: 'Primary', notes: null, created_at: '' }] })
    data.candidates[2] = { ...data.candidates[2], status: 'discussing' }
    render(<CallingsManager date="2026-10-25" data={data} actions={a} timeZone="America/Denver" />)

    await user.click(screen.getByRole('button', { name: 'Approve Sister Nash' }))
    expect(a.approveCandidate).toHaveBeenCalledWith(data.candidates[2], 'o')
    expect(a.updateCandidate).not.toHaveBeenCalled()
  })

  it('leaves Meets with alone when someone already meets with them', async () => {
    const user = userEvent.setup()
    const a = actions()
    const data = agendaData({ stewardships: [{ id: 's1', user_id: 'o', area: 'Primary', notes: null, created_at: '' }] })
    data.candidates[2] = { ...data.candidates[2], status: 'discussing' }
    render(<CallingsManager date="2026-10-25" data={data} actions={a} timeZone="America/Denver" />)

    await user.click(screen.getByRole('button', { name: 'Approve Sister Nash' }))
    expect(a.approveCandidate).toHaveBeenCalledWith(data.candidates[2], null)
  })

  it('offers only Approve while a name is being considered', () => {
    const data = agendaData()
    data.candidates[2] = { ...data.candidates[2], status: 'discussing' }
    render(<CallingsManager date="2026-10-25" data={data} actions={actions()} timeZone="America/Denver" />)
    expect(screen.getByRole('button', { name: 'Approve Sister Nash' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark Sister Nash accepted' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More for Sister Nash' })).not.toBeInTheDocument()
  })

  it('records an acceptance so it moves to Sustainings', async () => {
    const user = userEvent.setup()
    const a = actions()
    const data = agendaData()
    render(<CallingsManager date="2026-10-25" data={data} actions={a} timeZone="America/Denver" />)

    await user.click(screen.getByRole('button', { name: 'Mark Sister Nash accepted' }))
    expect(a.acceptCandidate).toHaveBeenCalledWith(data.candidates[2])
    expect(a.updateCandidate).not.toHaveBeenCalled()
  })

  it('keeps the rarer moves and one step back in each name\'s menu', async () => {
    const user = userEvent.setup()
    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={actions()} timeZone="America/Denver" />)
    await user.click(screen.getByRole('button', { name: 'More for Sister Nash' }))
    expect(menuItems()).toEqual(['Declined', 'Back to considering'])
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'More for Sister Moss' }))
    expect(menuItems()).toEqual(['Undo accepted'])
  })

  it('shows where each calling stands', () => {
    const data = agendaData()
    data.needs.push({ ...data.needs[0], id: 'n4', calling_title: 'Ward Librarian' }, { ...data.needs[0], id: 'n5', calling_title: 'Ward Organist' })
    data.candidates.push({ ...data.candidates[2], id: 'c8', need_id: 'n5', person_name: 'Sister Pratt', status: 'discussing' })
    render(<CallingsManager date="2026-10-25" data={data} actions={actions()} timeZone="America/Denver" />)
    expect(within(need('Primary Teacher')).getByText('Interview')).toBeInTheDocument()
    expect(within(need('RS Teacher')).getByText('To sustain')).toBeInTheDocument()
    expect(within(need('Ward Librarian')).getByText('Needs a name')).toBeInTheDocument()
    expect(within(need('Ward Organist')).getByText('To approve')).toBeInTheDocument()
  })

  it('takes back an accept without handing out a new appointment', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={a} timeZone="America/Denver" />)

    await user.click(screen.getByRole('button', { name: 'More for Sister Moss' }))
    await user.click(screen.getByRole('menuitem', { name: 'Undo accepted' }))
    expect(a.updateCandidate).toHaveBeenCalledWith('c1', { status: 'approved' })
    expect(a.approveCandidate).not.toHaveBeenCalled()
  })

  it('leaves a declined name declined', () => {
    const data = agendaData()
    data.candidates[2] = { ...data.candidates[2], status: 'declined' }
    render(<CallingsManager date="2026-10-25" data={data} actions={actions()} timeZone="America/Denver" />)
    expect(screen.queryByRole('button', { name: 'More for Sister Nash' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark Sister Nash accepted' })).not.toBeInTheDocument()
    expect(within(need('Primary Teacher')).getByText('Declined')).toBeInTheDocument()
  })

  it('approves only one name per calling at a time', () => {
    const data = agendaData()
    data.candidates.push({ ...data.candidates[2], id: 'c8', person_name: 'Sister Pratt', status: 'discussing' })
    render(<CallingsManager date="2026-10-25" data={data} actions={actions()} timeZone="America/Denver" />)
    expect(screen.getByRole('button', { name: 'Approve Sister Pratt' })).toBeDisabled()
    expect(within(need('Primary Teacher')).getByText('Another name is approved')).toBeInTheDocument()
  })

  it('shows the sustain and release dates together once a name has accepted', () => {
    const data = agendaData()
    data.needs[1] = { ...data.needs[1], release_name: 'Sister Hale' }
    render(<CallingsManager date="2026-10-25" data={data} actions={actions()} timeZone="America/Denver" />)
    expect(within(need('Primary Teacher')).queryByLabelText('Release Brother Ivey on')).not.toBeInTheDocument()
    expect(within(need('RS Teacher')).getByLabelText('Release Sister Hale on')).toBeInTheDocument()
    expect(within(need('RS Teacher')).getByLabelText('Sustain Sister Moss on')).toBeInTheDocument()
  })

  it('takes no names for a release only', () => {
    const data = agendaData()
    data.needs[2] = { ...data.needs[2], release_on: null, release_only: true }
    render(<CallingsManager date="2026-10-25" data={data} actions={actions()} timeZone="America/Denver" />)
    const ss = need('Sunday School')
    expect(within(ss).getByLabelText('Release Sister Kemp on')).toBeInTheDocument()
    expect(within(ss).getByText('Release only')).toBeInTheDocument()
    expect(within(ss).queryByRole('button', { name: 'Add a name' })).not.toBeInTheDocument()
  })

  it('opens the name box from Add a name', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={a} timeZone="America/Denver" />)

    const primary = need('Primary Teacher')
    expect(within(primary).queryByLabelText('Name to consider for Primary Teacher')).not.toBeInTheDocument()
    await user.click(within(primary).getByRole('button', { name: 'Add a name' }))
    await user.type(within(primary).getByLabelText('Name to consider for Primary Teacher'), 'Brother Hale{Enter}')
    expect(a.addCandidate).toHaveBeenCalledWith('n1', 'Brother Hale')
    expect(within(primary).queryByLabelText('Name to consider for Primary Teacher')).not.toBeInTheDocument()
  })

  it('adds the person being released after the calling was created', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={a} timeZone="America/Denver" />)

    const rs = need('RS Teacher')
    await user.click(within(rs).getByRole('button', { name: "Add who's being released" }))
    await user.type(within(rs).getByLabelText('Releasing from RS Teacher'), 'Sister Hale{Enter}')
    expect(a.updateNeed).toHaveBeenCalledWith('n2', { release_name: 'Sister Hale' })
  })

  it('removes a calling only after confirming', async () => {
    const user = userEvent.setup()
    const a = actions()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={a} timeZone="America/Denver" />)

    const remove = async () => {
      await user.click(within(need('Sunday School')).getByRole('button', { name: 'More for Sunday School' }))
      await user.click(screen.getByRole('menuitem', { name: 'Remove calling' }))
    }
    await remove()
    expect(a.deleteNeed).not.toHaveBeenCalled()
    await remove()
    expect(a.deleteNeed).toHaveBeenCalledWith('n3')
    confirm.mockRestore()
  })

  it('moves a calling to Waiting to be set apart on the Sunday its name is sustained', async () => {
    const user = userEvent.setup()
    const a = actions()
    const data = agendaData()
    render(<CallingsManager date="2026-11-01" data={data} actions={a} timeZone="America/Denver" />)
    expect(screen.queryByRole('article', { name: 'RS Teacher' })).not.toBeInTheDocument()
    expect(need('Primary Teacher')).toBeInTheDocument()

    const waiting = screen.getByRole('region', { name: 'Waiting to be set apart' })
    expect(within(waiting).getByText('Sister Moss')).toBeInTheDocument()
    await user.click(within(waiting).getByRole('button', { name: 'Sister Moss was set apart' }))
    expect(a.setApart).toHaveBeenCalledWith(data.candidates[0])
  })

  it('marks a calling no longer needed only after confirming', async () => {
    const user = userEvent.setup()
    const a = actions()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={a} timeZone="America/Denver" />)

    const cancel = async () => {
      await user.click(within(need('Sunday School')).getByRole('button', { name: 'More for Sunday School' }))
      await user.click(screen.getByRole('menuitem', { name: 'No longer needed' }))
    }
    await cancel()
    expect(a.updateNeed).not.toHaveBeenCalled()
    await cancel()
    expect(a.updateNeed).toHaveBeenCalledWith('n3', { status: 'cancelled' })
    confirm.mockRestore()
  })

  it('does everything the callings tab did', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={a} timeZone="America/Denver" />)

    await user.click(screen.getByRole('button', { name: 'More for Sister Nash' }))
    await user.click(screen.getByRole('menuitem', { name: 'Declined' }))
    expect(a.updateCandidate).toHaveBeenCalledWith('c3', { status: 'declined' })

    await user.click(within(need('Sunday School')).getByRole('button', { name: 'Add a name' }))
    await user.type(within(need('Sunday School')).getByLabelText('Name to consider for Sunday School'), 'Brother Hale')
    await user.click(within(need('Sunday School')).getByRole('button', { name: 'Add' }))
    expect(a.addCandidate).toHaveBeenCalledWith('n3', 'Brother Hale')

    await user.selectOptions(screen.getByLabelText('Attach Brother Vale to a calling'), 'Primary Teacher')
    expect(a.updateCandidate).toHaveBeenCalledWith('c2', { need_id: 'n1', status: 'discussing' })

  })

  it('adds a calling from a dialog with its release and first names', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={a} timeZone="America/Denver" />)

    await user.click(screen.getByRole('button', { name: 'Add a calling' }))
    const dialog = screen.getByRole('dialog', { name: 'Add a calling' })
    await user.type(within(dialog).getByLabelText(/^Calling/), 'Ward Librarian')
    await user.type(within(dialog).getByLabelText("Who's being released (optional)"), 'Sister Ames')
    await user.type(within(dialog).getByLabelText('Name to consider (optional)'), 'Brother Hale')
    await user.click(within(dialog).getByRole('button', { name: 'Another name' }))
    await user.type(within(dialog).getByLabelText('Another name to consider'), 'Sister Dunn')
    // The rarer choices wait behind More options.
    expect(within(dialog).queryByLabelText('Notes')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'More options' }))
    await user.type(within(dialog).getByLabelText('Notes'), 'Library opens in January')
    await user.click(within(dialog).getByRole('button', { name: 'Add calling' }))

    expect(a.addNeed).toHaveBeenCalledWith({
      id: expect.any(String),
      calling_title: 'Ward Librarian',
      release_name: 'Sister Ames',
      release_on: null,
      release_only: false,
      notes: 'Library opens in January',
      names: ['Brother Hale', 'Sister Dunn'],
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('starts in the Calling box, but leaves a field someone already moved to alone', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<CallingsManager date="2026-10-25" data={agendaData()} actions={actions()} timeZone="America/Denver" />)
    await user.click(screen.getByRole('button', { name: 'Add a calling' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Calling/ })).toHaveFocus())
    unmount()

    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={actions()} timeZone="America/Denver" />)
    await user.click(screen.getByRole('button', { name: 'Add a calling' }))
    const released = screen.getByLabelText("Who's being released (optional)")
    await user.click(released)
    await new Promise((r) => setTimeout(r, 400))
    expect(released).toHaveFocus()
  })

  it('adds a release-only calling, which needs who is released and takes no names', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={a} timeZone="America/Denver" />)

    await user.click(screen.getByRole('button', { name: 'Add a calling' }))
    const dialog = screen.getByRole('dialog', { name: 'Add a calling' })
    await user.type(within(dialog).getByLabelText(/^Calling/), 'Ward Librarian')
    await user.click(within(dialog).getByRole('button', { name: 'More options' }))
    await user.click(within(dialog).getByLabelText(/Release only/))
    expect(within(dialog).queryByLabelText('Name to consider (optional)')).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Add calling' }))
    expect(a.addNeed).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText(/^Who's being released/), 'Sister Ames')
    fireEvent.change(within(dialog).getByLabelText('Release Sister Ames on'), { target: { value: '2026-11-08' } })
    await user.click(within(dialog).getByRole('button', { name: 'Add calling' }))
    expect(a.addNeed).toHaveBeenCalledWith(expect.objectContaining({ release_name: 'Sister Ames', release_on: '2026-11-08', release_only: true, names: [] }))
  })

  it('lists the newest calling first', () => {
    const data = agendaData()
    data.needs = data.needs.map((n, i) => ({ ...n, created_at: `2026-10-0${i + 1}T00:00:00Z` }))
    render(<CallingsManager date="2026-10-25" data={data} actions={actions()} timeZone="America/Denver" />)
    const titles = within(screen.getByRole('region', { name: 'Callings to fill' }))
      .getAllByRole('article')
      .map((el) => el.getAttribute('aria-label'))
    expect(titles).toEqual(['Sunday School', 'RS Teacher', 'Primary Teacher'])
  })

  it('shows and edits a calling\'s notes', async () => {
    const user = userEvent.setup()
    const a = actions()
    const data = agendaData()
    data.needs[0] = { ...data.needs[0], notes: 'Sunbeams class' }
    render(<CallingsManager date="2026-10-25" data={data} actions={a} timeZone="America/Denver" />)

    expect(within(need('Primary Teacher')).getByText('Sunbeams class')).toBeInTheDocument()
    await user.click(within(need('Primary Teacher')).getByRole('button', { name: 'More for Primary Teacher' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit notes' }))
    const box = screen.getByLabelText('Notes for Primary Teacher')
    await user.clear(box)
    await user.type(box, 'CTR 7 class')
    await user.click(within(need('Primary Teacher')).getByRole('button', { name: 'Save' }))
    expect(a.updateNeed).toHaveBeenCalledWith('n1', { notes: 'CTR 7 class' })
  })

  it('suggests titles from the calling list, including ones added by the ward', async () => {
    const user = userEvent.setup()
    render(<CallingsManager date="2026-10-25" data={agendaData()} actions={actions()} timeZone="America/Denver" />)

    await user.click(screen.getByRole('button', { name: 'Add a calling' }))
    const dialog = screen.getByRole('dialog', { name: 'Add a calling' })
    await user.type(within(dialog).getByLabelText(/^Calling/), 'teacher')
    const list = screen.getByRole('listbox')
    expect(within(list).getByText('Added by the ward')).toBeInTheDocument()
    expect(within(list).getByRole('option', { name: 'RS Teacher' })).toBeInTheDocument()
    expect(within(list).getByRole('option', { name: 'Relief Society Teacher' })).toBeInTheDocument()
  })

  it('shows who asked for a calling and lets the bishopric mark the request received', async () => {
    const a = actions()
    const data = agendaData()
    data.profiles = [...data.profiles, { id: 'lead', email: 'leader@ward.test', display_name: 'Sister Reyes', short_name: null }]
    data.callingRequests = [
      { id: 'cr1', requested_by: 'lead', kind: 'replace', calling_title: 'Primary Teacher', organization: 'Primary', release_name: 'Brother Ivey', needed_by: '2026-12-01', notes: 'Sunbeams need one', need_id: 'n1', routed_to: ['o'], received_by: null, received_at: null, created_at: '2026-10-20T10:00:00Z' },
    ]
    data.candidates = [...data.candidates, { ...data.candidates[2], id: 'c9', person_name: 'Sister Vale', status: 'suggested', suggested_by: 'lead', request_id: 'cr1' }]
    render(<CallingsManager date="2026-10-25" data={data} actions={a} timeZone="America/Denver" />)

    const primary = need('Primary Teacher')
    expect(within(primary).getByText('Asked for by Sister Reyes (Primary) · needed by December 1st · not marked received yet')).toBeInTheDocument()
    expect(within(primary).getByText('“Sunbeams need one”')).toBeInTheDocument()
    expect(within(primary).getByText('Considering · suggested by Sister Reyes')).toBeInTheDocument()

    const request = screen.getByRole('article', { name: 'Release Brother Ivey and call someone new as Primary Teacher' })
    await userEvent.click(within(request).getByRole('button', { name: 'Got it' }))
    expect(a.receiveCallingRequest).toHaveBeenCalledWith('cr1')
  })
})
