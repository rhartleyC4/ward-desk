import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { agendaData, bishopricTemplate, wardCouncilTemplate } from '../test/fixtures'
import { AgendaView, type AgendaActions } from './AgendaView'

function actions(): AgendaActions {
  return {
    saveAssignments: vi.fn().mockResolvedValue(true),
    recordAnswer: vi.fn().mockResolvedValue(true),
    addItem: vi.fn(),
    resolveItem: vi.fn(),
    setApart: vi.fn(),
    addPrayerName: vi.fn(),
    removePrayerName: vi.fn(),
    addNeed: vi.fn(),
    updateNeed: vi.fn(),
    deleteNeed: vi.fn(),
    addCandidate: vi.fn(),
    updateCandidate: vi.fn(),
    acceptCandidate: vi.fn(),
    approveCandidate: vi.fn(),
    assignAppointment: vi.fn(),
    receiveCallingRequest: vi.fn(),
    assignItem: vi.fn().mockResolvedValue(true),
  }
}

const section = (title: string | RegExp) => screen.getByRole('heading', { name: title }).closest('section') as HTMLElement

describe('AgendaView', () => {
  it('assembles the sections the weekly sheet tab used to hold', () => {
    render(<AgendaView template={bishopricTemplate} date="2026-11-01" data={agendaData()} actions={actions()} timeZone="America/Denver" />)

    expect(screen.getByText('November 1st')).toBeInTheDocument()
    expect(screen.getByText(/8:30 Bishopric meeting, 9:15 Welfare/)).toBeInTheDocument()
    const header = screen.getByRole('heading', { name: 'Bishopric Meeting Agenda' }).closest('section') as HTMLElement
    expect(header).toHaveTextContent('Opening prayer: Brother Ortiz')
    expect(header).toHaveTextContent('Spiritual thought: Handbook updates')

    expect(screen.queryByRole('heading', { name: 'Interviews & appointments' })).not.toBeInTheDocument()

    expect(within(section('Upcoming sacrament meetings')).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '11/1 (Ortiz) - FAST SUNDAY',
      '11/8 (Ortiz) - Brother Cole (Stake), Sister Diaz',
    ])

    const callings = section('Callings needed (to discuss)')
    const rows = within(callings).getAllByRole('row').slice(1).map((r) => r.textContent)
    // RS Teacher was accepted and is sustained today, so it's under Sustainings instead.
    expect(rows).toEqual(['Primary TeacherBrother IveySister NashY', 'Sunday SchoolSister Kemp'])
    expect(within(callings).getByText(/Brother Vale for Primary Teacher/)).toBeInTheDocument()

    expect(within(section(/Releases today/)).getByText('Sister Kemp, Sunday School')).toBeInTheDocument()
    expect(within(section(/Sustainings today/)).getByText('Sister Moss, RS Teacher')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Away today: Lane (Denver)')
  })

  it('shows who accepted each assignment and gives parts out from a list of leaders', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<AgendaView template={wardCouncilTemplate} date="2026-11-01" data={agendaData()} actions={a} timeZone="America/Denver" />)

    const header = screen.getByRole('heading', { name: 'Ward Council Agenda' }).closest('section') as HTMLElement
    expect(header).toHaveTextContent('Opening prayer: Brother OrtizAccepted')
    // The meeting has its own Closing prayer section, so the header leaves it out.
    expect(header).not.toHaveTextContent('Closing prayer')
    expect(screen.getByText('Closing prayer:').parentElement?.parentElement).toHaveTextContent('Closing prayer: Brother LaneWaiting for an answer')

    await user.click(within(header).getByRole('button', { name: 'Edit assignments' }))
    const form = within(header).getByRole('form', { name: 'Assignments' })
    expect(within(form).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(within(form).getByText('Typed in before: Handbook updates')).toBeInTheDocument()
    await user.selectOptions(within(form).getByLabelText('Spiritual thought'), 'Bishop Avery')
    await user.selectOptions(within(form).getByLabelText('Closing prayer'), 'No one yet')
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(a.saveAssignments).toHaveBeenCalledWith([
      { part: 'spiritual_thought', to: 'b' },
      { part: 'closing_prayer', to: null },
    ])
  })

  it('keeps confirming by text or email out of the way until it’s opened', async () => {
    const user = userEvent.setup()
    const a = actions()
    const data = agendaData()
    data.assignments[0] = { ...data.assignments[0], answered_by: 'b' }
    render(<AgendaView template={{ ...wardCouncilTemplate, start_time: '09:15:00' }} date="2026-11-08" data={data} actions={a} timeZone="America/Denver" me={{ id: 'b', name: 'Bishop Avery' }} />)

    const header = screen.getByRole('heading', { name: 'Ward Council Agenda' }).closest('section') as HTMLElement
    expect(header).toHaveTextContent('recorded by Bishop Avery')
    expect(within(header).queryByRole('button', { name: 'They said yes' })).not.toBeInTheDocument()
    await user.click(within(header).getByRole('button', { name: 'Not using the app? Confirm for them' }))

    const lane = within(header).getByRole('article', { name: 'Closing prayer: Brother Lane' })
    expect(within(lane).getByLabelText('Message')).toHaveValue(
      "Hi Brother Lane, would you be willing to give the closing prayer in Ward Council on Sunday, November 8th at 9:15 AM? Please let me know either way, or if you'll be away that day.\n\nThanks!\nBishop Avery",
    )
    expect(within(lane).getByRole('link', { name: 'Text' })).toHaveAttribute('href', expect.stringMatching(/^sms:\?&body=Hi%20Brother%20Lane/))
    expect(within(lane).getByRole('link', { name: 'Email' })).toHaveAttribute('href', expect.stringMatching(/^mailto:first@ward\.test\?subject=Ward%20Council%2C%20November%208th/))
    await user.click(within(lane).getByRole('button', { name: 'They said yes' }))
    expect(a.recordAnswer).toHaveBeenCalledWith('as2', 'accepted')

    const ortiz = within(header).getByRole('article', { name: 'Opening prayer: Brother Ortiz' })
    expect(within(ortiz).queryByRole('button', { name: 'They said yes' })).not.toBeInTheDocument()
    await user.click(within(ortiz).getByRole('button', { name: 'They said no' }))
    await user.type(within(ortiz).getByLabelText(/What they said/), 'Traveling')
    await user.click(within(ortiz).getByRole('button', { name: 'Record no' }))
    expect(a.recordAnswer).toHaveBeenCalledWith('as1', 'declined', 'Traveling')
  })

  it('offers no confirming when every part is your own', () => {
    const data = agendaData({ assignments: [] })
    render(<AgendaView template={wardCouncilTemplate} date="2026-11-08" data={data} actions={actions()} timeZone="America/Denver" me={{ id: 'b', name: 'Bishop Avery' }} />)
    expect(screen.queryByRole('button', { name: /Confirm for them/ })).not.toBeInTheDocument()
  })

  it('adds and resolves discussion items', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<AgendaView template={bishopricTemplate} date="2026-11-01" data={agendaData()} actions={a} timeZone="America/Denver" />)

    const discussion = section('Action / discussion items')
    await user.click(within(discussion).getByRole('button', { name: 'Done' }))
    expect(a.resolveItem).toHaveBeenCalledWith('d1')

    await user.type(within(discussion).getByLabelText('New item for Action / discussion items'), 'Ward website / bulletin')
    await user.click(within(discussion).getByRole('button', { name: 'Add' }))
    expect(a.addItem).toHaveBeenCalledWith(bishopricTemplate.sections[0], 'Ward website / bulletin', null)
  })

  it('adds a calendar item with its date', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<AgendaView template={bishopricTemplate} date="2026-11-01" data={agendaData()} actions={a} timeZone="America/Denver" />)

    const calendar = section('Calendar')
    expect(within(calendar).getByText(/Ward Christmas party/)).toBeInTheDocument()
    await user.type(within(calendar).getByLabelText('Date'), '2026-11-22')
    await user.type(within(calendar).getByLabelText('New item for Calendar'), 'Tithing declaration')
    await user.click(within(calendar).getByRole('button', { name: 'Add' }))
    expect(a.addItem).toHaveBeenCalledWith(bishopricTemplate.sections[2], 'Tithing declaration', '2026-11-22')
  })

  it('works callings right on the agenda for the bishopric', () => {
    render(<AgendaView template={bishopricTemplate} date="2026-11-01" data={agendaData()} actions={actions()} timeZone="America/Denver" canEditCallings />)

    const callings = section('Callings needed (to discuss)')
    expect(within(callings).queryByRole('table')).not.toBeInTheDocument()
    expect(within(callings).getByLabelText('Status for Sister Nash')).toHaveValue('approved')
    expect(within(callings).getByRole('form', { name: 'Add a calling to fill' })).toBeInTheDocument()
  })

  it('lets the bishopric move a sustaining or release to another Sunday', () => {
    const a = actions()
    render(<AgendaView template={bishopricTemplate} date="2026-11-01" data={agendaData()} actions={a} timeZone="America/Denver" canEditCallings />)

    const sustain = within(section(/Sustainings today/)).getByLabelText('Date for Sister Moss, RS Teacher')
    expect(sustain).toHaveValue('2026-11-01')
    fireEvent.change(sustain, { target: { value: '2026-11-08' } })
    expect(a.updateCandidate).toHaveBeenLastCalledWith('c1', { sustain_on: '2026-11-08' })

    const release = within(section(/Releases today/)).getByLabelText('Date for Sister Kemp, Sunday School')
    fireEvent.change(release, { target: { value: '2026-11-08' } })
    expect(a.updateNeed).toHaveBeenLastCalledWith('n3', { release_on: '2026-11-08' })
  })

  it('manages the prayer roll', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<AgendaView template={bishopricTemplate} date="2026-11-01" data={agendaData()} actions={a} timeZone="America/Denver" />)

    const roll = section('Prayer roll')
    await user.click(within(roll).getByRole('button', { name: 'Remove' }))
    expect(a.removePrayerName).toHaveBeenCalledWith('p1')
    await user.type(within(roll).getByLabelText('Prayer roll name'), 'Another family')
    await user.click(within(roll).getByRole('button', { name: 'Add' }))
    expect(a.addPrayerName).toHaveBeenCalledWith('Another family')
  })

  it('lays out another meeting from its template', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<AgendaView template={wardCouncilTemplate} date="2026-11-08" data={agendaData({ agenda: null })} actions={a} timeZone="America/Denver" />)

    expect(screen.getByRole('heading', { name: 'Ward Council Agenda' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Prayer roll',
      'General business',
      'Upcoming assignments',
      'Relief Society',
    ])
    expect(screen.queryByRole('heading', { name: /Callings needed/ })).not.toBeInTheDocument()

    expect(within(section('Upcoming assignments')).getByText('PPI: YW President — YW President')).toBeInTheDocument()
    expect(within(section('Relief Society')).getByText('Room for the combined lesson')).toBeInTheDocument()
    expect(within(section('General business')).getByText('Nothing open.')).toBeInTheDocument()

    await user.type(within(section('Relief Society')).getByLabelText('New item for Relief Society'), 'Teacher council room')
    await user.click(within(section('Relief Society')).getByRole('button', { name: 'Add' }))
    expect(a.addItem).toHaveBeenCalledWith(wardCouncilTemplate.sections[3], 'Teacher council room', null)
  })

  it('follows up on open requests and those just finished', () => {
    const template = { ...bishopricTemplate, sections: [...bishopricTemplate.sections, { id: 'bishopric-fu', template_id: 'bishopric', position: 11, kind: 'follow_ups' as const, title: 'Follow-ups' }] }
    const base = { from_id: 'b', to_id: 'l', details: null, due_on: null, reply: null, agenda_item_id: null, seen_at: null, created_at: '2026-10-25T10:00:00Z', updated_at: '2026-10-25T10:00:00Z' }
    const requests = [
      { ...base, id: 'q1', title: 'Order the program covers', status: 'seen' as const, closed_at: null },
      { ...base, id: 'q2', title: 'Visit the Lees', status: 'done' as const, reply: 'Went Tuesday', closed_at: '2026-10-28T10:00:00Z' },
      { ...base, id: 'q3', title: 'Old news', status: 'done' as const, closed_at: '2026-09-01T10:00:00Z' },
    ]
    render(<AgendaView template={template} date="2026-11-01" data={agendaData({ requests })} actions={actions()} timeZone="America/Denver" />)

    const followUps = section('Follow-ups')
    expect(within(followUps).getByText('Order the program covers')).toBeInTheDocument()
    expect(within(followUps).getByText('Bishop Avery asked Brother Lane · Seen')).toBeInTheDocument()
    expect(within(followUps).getByText('Bishop Avery asked Brother Lane · Done · “Went Tuesday”')).toBeInTheDocument()
    expect(within(followUps).queryByText('Old news')).not.toBeInTheDocument()
  })

  it('hands an item to someone as a request and shows where it stands', async () => {
    const user = userEvent.setup()
    const a = actions()
    const recipients = [{ id: 'l', display_name: 'Brother Lane', office: 'first_counselor' as const, in_bishopric: true }]
    const requests = [
      { id: 'q1', from_id: 'b', to_id: 'o', title: 'Ward Christmas party', details: null, due_on: null, status: 'seen' as const, reply: null, agenda_item_id: 'e1', seen_at: null, closed_at: null, created_at: '2026-10-25T10:00:00Z', updated_at: '2026-10-25T10:00:00Z' },
    ]
    render(<AgendaView template={bishopricTemplate} date="2026-11-01" data={agendaData({ recipients, requests })} actions={a} timeZone="America/Denver" />)

    expect(within(section('Calendar')).getByText('Asked Brother Ortiz · Seen')).toBeInTheDocument()

    const items = section('Action / discussion items')
    await user.click(within(items).getByRole('button', { name: 'Ask someone to do Fifth Sunday topic' }))
    await user.selectOptions(within(items).getByRole('combobox', { name: /Who/ }), 'l')
    await user.click(within(items).getByRole('button', { name: 'Send request' }))
    expect(a.assignItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1', body: 'Fifth Sunday topic' }), 'l', null)
  })

  it('offers no Assign button to someone who can’t send requests', () => {
    render(<AgendaView template={bishopricTemplate} date="2026-11-01" data={agendaData()} actions={actions()} timeZone="America/Denver" />)
    expect(screen.queryByRole('button', { name: /Ask someone to do/ })).not.toBeInTheDocument()
  })
})
