import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { bishopricTemplate, profiles, wardCouncilTemplate } from '../test/fixtures'
import { BishopricHome, type BishopricHomeActions, type BishopricHomeData } from './BishopricHome'

const TZ = 'America/Denver'
// Today is Sunday 2026-11-08.
const TODAY = '2026-11-08'
// 7:00 AM, before anything on the day.
const MORNING = new Date('2026-11-08T14:00:00Z')
const ts = '2026-11-05T12:00:00Z'

type Appt = BishopricHomeData['appointments'][number]
const appt = (id: string, name: string, extra: Partial<Appt> = {}): Appt => ({
  id, interviewer_id: 'b', scheduled_at: null, person_name: name, purpose: 'other', candidate_id: null,
  location: null, status: 'scheduled', notes: null, created_at: ts, duration_minutes: 10, offered_at: null, offered_times: [], is_youth: false, parent_name: null,
  confirmed_at: null, reminded_at: null, missed_at: null, report_note: null, reported_at: null, reported_by: null, ...extra,
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
    rotations: [],
    absences: [],
    ...extra,
  }
}

function setup(d = data(), userId = 'b', now = MORNING) {
  const actions: BishopricHomeActions = { requestInterview: vi.fn(async () => true), addItem: vi.fn(async () => true), report: vi.fn(async () => true) }
  render(
    <MemoryRouter>
      <BishopricHome data={d} userId={userId} today={TODAY} now={now} timeZone={TZ} actions={actions} busy={false} />
    </MemoryRouter>,
  )
  return { actions, user: userEvent.setup() }
}

const card = (title: string) => screen.getByRole('heading', { name: title }).closest('section')!

describe('BishopricHome', () => {
  describe('reporting how appointments went', () => {
    // 9:20 AM: Brother Hale (9–9:15) is over; Brother Ward is someone else's.
    const AFTER = new Date('2026-11-08T16:20:00Z')

    it('asks only about my appointments that are over', () => {
      setup(data(), 'b', MORNING)
      expect(screen.queryByRole('heading', { name: 'How did these go?' })).not.toBeInTheDocument()
      setup(data(), 'b', AFTER)
      const report = within(card('How did these go?'))
      expect(report.getByRole('article', { name: 'Brother Hale' })).toHaveTextContent('Sunday, November 8th · 9–9:15 AM')
      expect(report.queryByText('Brother Ward')).not.toBeInTheDocument()
      expect(report.queryByText('Sister Moss')).not.toBeInTheDocument()
    })

    it('marks one done', async () => {
      const { actions, user } = setup(data(), 'b', AFTER)
      await user.click(within(card('How did these go?')).getByRole('button', { name: 'Done' }))
      expect(actions.report).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), { outcome: 'done' })
    })

    it('sends a missed one back to the secretary for a new time, with an optional note', async () => {
      const { actions, user } = setup(data(), 'b', AFTER)
      const hale = within(screen.getByRole('article', { name: 'Brother Hale' }))
      await user.click(hale.getByRole('button', { name: "Didn't come" }))
      expect(hale.getByRole('radio', { name: /Find a new time/ })).toBeChecked()
      expect(hale.getByText('Brother Quinn will reach out and book another time.')).toBeInTheDocument()
      await user.type(hale.getByLabelText('Note for the secretary (optional)'), 'Evenings')
      await user.click(hale.getByRole('button', { name: 'Send back to Brother Quinn' }))
      expect(actions.report).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), { outcome: 'reschedule', note: 'Evenings' })
    })

    it("needs a note when the leader will handle a missed one", async () => {
      const { actions, user } = setup(data(), 'b', AFTER)
      const hale = within(screen.getByRole('article', { name: 'Brother Hale' }))
      await user.click(hale.getByRole('button', { name: "Didn't come" }))
      await user.click(hale.getByRole('radio', { name: /I'll take care of it/ }))
      expect(hale.getByRole('button', { name: 'Save' })).toBeDisabled()
      await user.type(hale.getByLabelText('How will you handle it?'), 'See him after church')
      await user.click(hale.getByRole('button', { name: 'Save' }))
      expect(actions.report).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), { outcome: 'handled', note: 'See him after church' })
    })

    it('marks them all done at once', async () => {
      const d = data()
      d.appointments.push(appt('a5', 'Sister Early', { scheduled_at: '2026-11-08T15:00:00Z' }))
      const { actions, user } = setup(d, 'b', AFTER)
      await user.click(screen.getByRole('button', { name: 'Mark all done' }))
      expect(actions.report).toHaveBeenCalledTimes(2)
    })
  })

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

  it('puts my rotations on their day and lists the month', () => {
    const anyTime = { weekday: null, week_of_month: null }
    setup(
      data({
        rotations: [
          { title: 'Primary message', months: [11], assignee_id: 'b', assignee_label: null, weekday: 0, week_of_month: 2 },
          { title: 'Ward council message', months: [11], assignee_id: 'l', assignee_label: null, weekday: 0, week_of_month: 2 },
          { title: 'PPI: YW President', months: [11], assignee_id: null, assignee_label: 'YW President', ...anyTime },
          { title: 'PPI: EQ President', months: [2], assignee_id: null, assignee_label: 'EQ President', ...anyTime },
        ],
      }),
    )
    const today = within(card('Today'))
    expect(today.getByText('Primary message')).toBeInTheDocument()
    expect(today.getByText('Your turn')).toBeInTheDocument()
    expect(screen.queryByText('Ward council message')).not.toBeInTheDocument() // Lane's turn
    const month = within(card('This month'))
    expect(month.getByText('Sunday, November 8th (today)')).toBeInTheDocument()
    expect(month.getByText('PPI: YW President')).toBeInTheDocument()
    expect(month.getByText('Any time this month')).toBeInTheDocument()
    expect(month.queryByText('PPI: EQ President')).not.toBeInTheDocument()
  })

  it('leaves out This month when nothing is due', () => {
    setup()
    expect(screen.queryByRole('heading', { name: 'This month' })).not.toBeInTheDocument()
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

  it('warns when the whole bishopric is away on a Sunday, and more mildly when only one is there', () => {
    const away = (user_id: string, date: string) => ({ user_id, starts_on: date, ends_on: date, location: null })
    setup(data({ absences: [away('b', '2026-11-15'), away('l', '2026-11-15'), away('o', '2026-11-15'), away('b', '2026-11-22'), away('o', '2026-11-22')] }))
    expect(screen.getByText('The whole bishopric is away')).toBeInTheDocument()
    expect(screen.getByText('Sunday, November 15th: no one in the bishopric will be there.')).toBeInTheDocument()
    expect(screen.getByText('Sunday, November 22nd: only Lane will be there.')).toBeInTheDocument()
  })

  it('says nothing when every Sunday has two or more there', () => {
    setup(data({ absences: [{ user_id: 'b', starts_on: '2026-11-15', ends_on: '2026-11-15', location: null }] }))
    expect(screen.queryByText(/bishopric will be there|will be there\./)).not.toBeInTheDocument()
  })
})
