import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { agendaData, bishopricTemplate, wardCouncilTemplate } from '../test/fixtures'
import { AgendaView, type AgendaActions } from './AgendaView'

function actions(): AgendaActions {
  return {
    saveHeader: vi.fn(),
    addItem: vi.fn(),
    resolveItem: vi.fn(),
    addPrayerName: vi.fn(),
    removePrayerName: vi.fn(),
    addInterview: vi.fn(),
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

    expect(within(section('Interviews & appointments')).getByText('Brother Park (calling)')).toBeInTheDocument()
    expect(within(section('Interviews & appointments')).getByText('10:00 AM')).toBeInTheDocument()
    expect(within(section('Interviews & appointments')).getByText(/PPI: YW President/)).toBeInTheDocument()

    expect(within(section('Upcoming sacrament meetings')).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '11/1 (Ortiz) - FAST SUNDAY',
      '11/8 (Ortiz) - Brother Cole (Stake), Sister Diaz',
    ])

    const callings = section('Callings needed (to discuss)')
    const rows = within(callings).getAllByRole('row').slice(1).map((r) => r.textContent)
    expect(rows).toEqual(['Primary TeacherBrother Ivey', 'RS TeacherSister MossY', 'Sunday SchoolSister Kemp'])
    expect(within(callings).getByText(/Brother Vale for Primary Teacher/)).toBeInTheDocument()

    expect(within(section(/Releases today/)).getByText('Sister Kemp, Sunday School')).toBeInTheDocument()
    expect(within(section(/Sustainings today/)).getByText('Sister Moss, RS Teacher')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Away today: Lane (Denver)')
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
    expect(a.addItem).toHaveBeenCalledWith(bishopricTemplate.sections[1], 'Ward website / bulletin', null)
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
    expect(a.addItem).toHaveBeenCalledWith(bishopricTemplate.sections[3], 'Tithing declaration', '2026-11-22')
  })

  it('schedules an interview for the agenda date', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<AgendaView template={bishopricTemplate} date="2026-11-01" data={agendaData()} actions={a} timeZone="America/Denver" />)

    const form = screen.getByRole('form', { name: 'Add interview' })
    await user.selectOptions(within(form).getByLabelText('Interviewer'), 'Brother Ortiz')
    await user.type(within(form).getByLabelText('Time'), '12:40')
    await user.type(within(form).getByLabelText('Name'), 'Sister Reed')
    await user.selectOptions(within(form).getByLabelText('Purpose'), 'temple_recommend')
    await user.click(within(form).getByRole('button', { name: 'Add interview' }))

    expect(a.addInterview).toHaveBeenCalledWith({
      interviewer_id: 'o',
      scheduled_at: new Date('2026-11-01T12:40').toISOString(),
      person_name: 'Sister Reed',
      purpose: 'temple_recommend',
    })
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
    expect(screen.queryByRole('form', { name: 'Add interview' })).not.toBeInTheDocument()

    expect(within(section('Upcoming assignments')).getByText('PPI: YW President — YW President')).toBeInTheDocument()
    expect(within(section('Relief Society')).getByText('Room for the combined lesson')).toBeInTheDocument()
    expect(within(section('General business')).getByText('Nothing open.')).toBeInTheDocument()

    await user.type(within(section('Relief Society')).getByLabelText('New item for Relief Society'), 'Teacher council room')
    await user.click(within(section('Relief Society')).getByRole('button', { name: 'Add' }))
    expect(a.addItem).toHaveBeenCalledWith(wardCouncilTemplate.sections[3], 'Teacher council room', null)
  })
})
