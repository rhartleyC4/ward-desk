import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AppointmentsData } from '../lib/queries'
import { agendaData, profiles } from '../test/fixtures'
import { AppointmentsView, WhoSchedules, type AppointmentsActions } from './AppointmentsView'

const ts = '2026-10-01T00:00:00Z'

function actions(): AppointmentsActions {
  return { schedule: vi.fn(), complete: vi.fn(), cancel: vi.fn(), add: vi.fn(), setSecretary: vi.fn() }
}

function data(): AppointmentsData {
  const { needs, candidates } = agendaData()
  const appt = (id: string, interviewer: string, name: string, extra: Partial<AppointmentsData['appointments'][number]> = {}) => ({
    id, interviewer_id: interviewer, scheduled_at: null, person_name: name, purpose: 'calling' as const, candidate_id: null,
    location: null, status: 'scheduled' as const, notes: null, created_at: ts, duration_minutes: 10, offered_at: null, offered_times: [], is_youth: false, parent_name: null,
    confirmed_at: null, reminded_at: null, missed_at: null, report_note: null, reported_at: null, reported_by: null, ...extra,
  })
  return {
    appointments: [
      appt('a1', 'l', 'Sister Nash', { candidate_id: 'c3' }),
      appt('a2', 'b', 'Brother Ward', { purpose: 'temple_recommend' }),
      appt('a3', 'o', 'Sister Reed', { purpose: 'ppi', scheduled_at: '2026-11-08T17:00:00Z' }),
    ],
    assignments: [
      { leader_id: 'b', secretary_id: 'exec', created_at: ts },
      { leader_id: 'l', secretary_id: 'asst', created_at: ts },
      { leader_id: 'o', secretary_id: 'asst', created_at: ts },
    ],
    needs,
    candidates,
    bishopric: profiles,
    secretaries: [
      { id: 'exec', email: 'secretary@ward.test', display_name: 'Brother Quinn', short_name: 'Quinn', office: 'executive_secretary' },
      { id: 'asst', email: 'assistant@ward.test', display_name: 'Brother Tate', short_name: 'Tate', office: null },
    ],
    profiles,
  }
}

const card = (title: string | RegExp) => screen.getByRole('heading', { name: title }).closest('section') as HTMLElement

describe('AppointmentsView', () => {
  it('starts with the leaders this secretary schedules for', async () => {
    const user = userEvent.setup()
    render(<AppointmentsView data={data()} userId="asst" actions={actions()} timeZone="America/Denver" />)

    const waiting = card('To schedule (1)')
    expect(within(waiting).getByRole('article', { name: 'Sister Nash' })).toHaveTextContent('Extend call: Primary Teacher')
    expect(within(waiting).getByText('with Lane')).toBeInTheDocument()
    expect(within(card('Scheduled')).getByText(/Sun, Nov 8, 10:00 AM/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Everyone' }))
    expect(within(card('To schedule (2)')).getByRole('article', { name: 'Brother Ward' })).toHaveTextContent('Temple recommend')
  })

  it('shows everyone to someone who schedules for no one', () => {
    render(<AppointmentsView data={data()} userId="b" actions={actions()} timeZone="America/Denver" />)
    expect(screen.queryByRole('group', { name: 'Whose appointments' })).not.toBeInTheDocument()
    expect(card('To schedule (2)')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Who schedules for whom' })).not.toBeInTheDocument()
  })

  it('books, finishes and drops appointments', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<AppointmentsView data={data()} userId="asst" actions={a} timeZone="America/Denver" />)

    const nash = screen.getByRole('article', { name: 'Sister Nash' })
    await user.type(within(nash).getByLabelText('Date for Sister Nash'), '2026-11-15')
    await user.type(within(nash).getByLabelText('Time for Sister Nash'), '10:30')
    await user.click(within(nash).getByRole('button', { name: 'Save' }))
    expect(a.schedule).toHaveBeenCalledWith('a1', new Date('2026-11-15T10:30').toISOString())

    const reed = screen.getByRole('article', { name: 'Sister Reed' })
    await user.click(within(reed).getByRole('button', { name: 'Done' }))
    expect(a.complete).toHaveBeenCalledWith('a3')
    await user.click(within(reed).getByRole('button', { name: 'Reschedule' }))
    expect(within(reed).getByLabelText('Date for Sister Reed')).toHaveValue('2026-11-08')

    await user.click(within(nash).getByRole('button', { name: 'Not needed' }))
    expect(a.cancel).toHaveBeenCalledWith('a1')
  })

  it('adds an appointment that can be scheduled later', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<AppointmentsView data={data()} userId="asst" actions={a} timeZone="America/Denver" />)

    const form = screen.getByRole('form', { name: 'Add an appointment' })
    await user.type(within(form).getByLabelText('Name'), 'Sister Ames')
    await user.selectOptions(within(form).getByLabelText('With'), 'Bishop Avery')
    await user.selectOptions(within(form).getByLabelText('Purpose'), 'temple_recommend')
    await user.click(within(form).getByRole('button', { name: 'Add' }))
    expect(a.add).toHaveBeenCalledWith({ interviewer_id: 'b', person_name: 'Sister Ames', purpose: 'temple_recommend', scheduled_at: null })
  })

  it('changes who schedules for whom', async () => {
    const user = userEvent.setup()
    const a = actions()
    render(<WhoSchedules data={data()} onChange={a.setSecretary} />)

    const bishop = screen.getByRole('group', { name: 'Who schedules for Bishop' })
    expect(within(bishop).getByLabelText('Brother Quinn')).toBeChecked()
    expect(within(bishop).getByLabelText('Brother Tate')).not.toBeChecked()
    await user.click(within(bishop).getByLabelText('Brother Tate'))
    expect(a.setSecretary).toHaveBeenCalledWith('b', 'asst', true)
    await user.click(within(bishop).getByLabelText('Brother Quinn'))
    expect(a.setSecretary).toHaveBeenCalledWith('b', 'exec', false)
  })

  it('skips the switch when the only executive secretary does it all', () => {
    const d = { ...data(), assignments: [{ leader_id: 'b', secretary_id: 'exec', created_at: ts }] }
    render(<AppointmentsView data={d} userId="exec" actions={actions()} timeZone="America/Denver" />)
    expect(screen.queryByRole('group', { name: 'Whose appointments' })).not.toBeInTheDocument()
    // He covers the counselors by default, so their appointments are on his list.
    expect(screen.getByRole('article', { name: 'Sister Nash' })).toBeInTheDocument()
  })

  it('asks who schedules for whom once there is an assistant, defaulting to the executive secretary', () => {
    const d = {
      ...data(),
      assignments: [],
      secretaries: [
        { id: 'exec', email: 'secretary@ward.test', display_name: 'Brother Quinn', short_name: 'Quinn', office: 'executive_secretary' as const },
        { id: 'asst', email: 'assistant@ward.test', display_name: 'Brother Tate', short_name: 'Tate', office: 'assistant_executive_secretary' as const },
        { id: 'clerk', email: 'clerk@ward.test', display_name: 'Brother Pike', short_name: 'Pike', office: 'ward_clerk' as const },
      ],
    }
    render(<WhoSchedules data={d} onChange={vi.fn()} />)
    const bishop = screen.getByRole('group', { name: 'Who schedules for Bishop' })
    expect(bishop).toHaveTextContent('No one picked, so Brother Quinn schedules')
    expect(within(bishop).getByLabelText('Brother Tate')).not.toBeChecked()
    expect(within(bishop).queryByLabelText('Brother Pike')).not.toBeInTheDocument()
  })

  it('says who covers a leader no one was picked for', () => {
    const d = { ...data(), assignments: [{ leader_id: 'o', secretary_id: 'asst', created_at: ts }] }
    render(<WhoSchedules data={d} onChange={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Who schedules for Bishop' })).toHaveTextContent('No one picked, so Brother Quinn schedules')
    expect(screen.getByRole('group', { name: 'Who schedules for Ortiz' })).not.toHaveTextContent('No one picked')
  })
})
