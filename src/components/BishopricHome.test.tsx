import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { bishopricTemplate, profiles, wardCouncilTemplate } from '../test/fixtures'
import { BishopricHome, type BishopricHomeActions, type BishopricHomeData } from './BishopricHome'

const TZ = 'America/Denver'
// Today is Sunday 2026-11-08.
const TODAY = '2026-11-08'
const ts = '2026-11-05T12:00:00Z'

type Appt = BishopricHomeData['appointments'][number]
const appt = (id: string, name: string, extra: Partial<Appt> = {}): Appt => ({
  id, interviewer_id: 'b', scheduled_at: null, person_name: name, purpose: 'other', candidate_id: null,
  location: null, status: 'scheduled', notes: null, created_at: ts, duration_minutes: 10, offered_at: null, offered_times: [], is_youth: false, parent_name: null, ...extra,
})

function data(extra: Partial<BishopricHomeData> = {}): BishopricHomeData {
  return {
    appointments: [
      appt('a1', 'Brother Hale', { purpose: 'temple_recommend', scheduled_at: '2026-11-08T16:00:00Z', duration_minutes: 15 }), // 9:00 AM
      appt('a2', 'Sister Moss', { purpose: 'youth', is_youth: true, scheduled_at: '2026-11-11T02:00:00Z' }), // Tue 7:00 PM
      appt('a3', 'Sister Reed', { purpose: 'ppi' }),
      appt('a4', 'Brother Ward', { interviewer_id: 'l', scheduled_at: '2026-11-08T16:30:00Z' }),
    ],
    assignments: [],
    secretaries: [{ id: 'exec', email: 'secretary@ward.test', display_name: 'Brother Quinn', short_name: 'Quinn', office: 'executive_secretary' }],
    bishopric: profiles,
    templates: [bishopricTemplate],
    agendaItems: [{ id: 'i1', section_id: 'bishopric-s1', body: 'Budget', event_date: null, resolved_on: null, created_at: ts }],
    sacrament: [{ meeting_date: TODAY, meeting_type: 'regular', title: null, conducting_id: 'b' }],
    ...extra,
  }
}

function setup(d = data(), userId = 'b') {
  const actions: BishopricHomeActions = { requestInterview: vi.fn(async () => true), addItem: vi.fn(async () => true) }
  render(
    <MemoryRouter>
      <BishopricHome data={d} userId={userId} today={TODAY} timeZone={TZ} actions={actions} busy={false} />
    </MemoryRouter>,
  )
  return { actions, user: userEvent.setup() }
}

const card = (title: string) => screen.getByRole('heading', { name: title }).closest('section')!

describe('BishopricHome', () => {
  it("shows today's meetings, conducting and my appointments only", () => {
    setup()
    const today = within(card('Today'))
    expect(today.getByText("You're conducting")).toBeInTheDocument()
    expect(today.getByText('Bishopric Meeting')).toBeInTheDocument()
    expect(today.getByText('1 open item')).toBeInTheDocument()
    expect(today.getByRole('link', { name: 'Open agenda' })).toHaveAttribute('href', '/agenda/bishopric/2026-11-08')
    expect(today.getByText('Brother Hale')).toBeInTheDocument()
    expect(today.getByText('9–9:15 AM')).toBeInTheDocument()
    expect(today.queryByText('Brother Ward')).not.toBeInTheDocument()
  })

  it('lists the rest of the week and the requests still waiting for a time', () => {
    setup()
    const week = within(card('Coming up'))
    expect(week.getByText('Tuesday, November 10th')).toBeInTheDocument()
    expect(week.getByText('Sister Moss')).toBeInTheDocument()
    const waiting = within(card('Waiting for a time'))
    expect(waiting.getByText('Sister Reed')).toBeInTheDocument()
    expect(waiting.getByText('Brother Quinn will find a time for these.')).toBeInTheDocument()
  })

  it('points to the next thing when today is empty', () => {
    const d = data({ templates: [], sacrament: [] })
    setup({ ...d, appointments: d.appointments.slice(1) })
    const today = within(card('Today'))
    expect(today.getByText('Nothing on your calendar today.')).toBeInTheDocument()
    expect(today.getByText('Next: Tuesday, 7–7:10 PM, Sister Moss')).toBeInTheDocument()
  })

  it('asks for an interview one question at a time', async () => {
    const { actions, user } = setup()
    await user.click(screen.getByRole('button', { name: /Ask for an interview/ }))
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    await user.type(screen.getByLabelText('Their name'), 'Sister Ames')
    await user.click(screen.getByLabelText(/under 18/))
    await user.type(screen.getByLabelText("Parent's name"), 'Brother Ames')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByLabelText('Youth interview'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByLabelText('Me (Bishop Avery)')).toBeChecked()
    await user.click(screen.getByLabelText('Brother Lane'))
    await user.click(screen.getByRole('button', { name: 'Ask for this interview' }))
    expect(actions.requestInterview).toHaveBeenCalledWith({ person_name: 'Sister Ames', purpose: 'youth', interviewer_id: 'l', is_youth: true, parent_name: 'Brother Ames' })
    expect(await screen.findByText('Brother Quinn will find a time for Sister Ames to meet with Brother Lane.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to home' }))
    expect(screen.getByRole('heading', { name: 'What would you like to do?' })).toBeInTheDocument()
  })

  it('goes back a step and cancels without saving', async () => {
    const { actions, user } = setup()
    await user.click(screen.getByRole('button', { name: /Ask for an interview/ }))
    await user.type(screen.getByLabelText('Their name'), 'Sister Ames')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText('Their name')).toHaveValue('Sister Ames')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(actions.requestInterview).not.toHaveBeenCalled()
  })

  it('adds an item to the meeting and section chosen', async () => {
    const { actions, user } = setup(data({ templates: [bishopricTemplate, wardCouncilTemplate] }))
    await user.click(screen.getByRole('button', { name: /Add something to a meeting/ }))
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    await user.click(screen.getByLabelText(/Ward Council/))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByLabelText('Relief Society'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.type(screen.getByLabelText('Item'), 'Plan the service project')
    await user.click(screen.getByRole('button', { name: 'Add to the agenda' }))
    expect(actions.addItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'council-s4' }), 'Plan the service project', null)
    expect(await screen.findByText('Added to “Relief Society” for Ward Council today.')).toBeInTheDocument()
  })

  it('skips the meeting question when there is only one', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /Add something to a meeting/ }))
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Which part of the Bishopric Meeting agenda?' })).toBeInTheDocument()
  })

  it("can't add to a meeting when none are set up", () => {
    setup(data({ templates: [] }))
    expect(screen.getByRole('button', { name: /Add something to a meeting/ })).toBeDisabled()
  })
})
