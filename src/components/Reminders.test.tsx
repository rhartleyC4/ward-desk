import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { Reminders, type RemindersProps } from './Reminders'

const DATE = '2026-11-08'
const event = { id: 'e1', title: 'Ward Council', weekday: 0, week_of_month: 2, start_time: '09:15:00', reminder_by: 'exec', agenda_template_id: 'wc' }
const templates: RemindersProps['templates'] = [
  { id: 't1', name: 'Group', kind: 'meeting', audience: 'member', body: 'Hi all, {meeting} is {when}.\n{assignments}\n{my_name}' },
  { id: 't2', name: 'Opening prayer', kind: 'meeting', audience: 'member', body: 'Hi {opening_prayer}, you have the opening prayer at {meeting}.' },
]

function setup(extra: Partial<RemindersProps> = {}) {
  const actions = { remind: vi.fn(), remindMeeting: vi.fn(), setYouth: vi.fn() }
  render(
    <MemoryRouter>
      <Reminders
        date={DATE}
        appointments={[]}
        meetings={[event]}
        sent={[]}
        agendas={[{ template_id: 'wc', opening_prayer: 'Brother Ortiz', spiritual_thought: null, closing_prayer: 'Sister Young' }]}
        agendaTemplates={[{ id: 'wc', slug: 'ward-council', name: 'Ward Council' }]}
        templates={templates}
        leaderName={() => 'Bishop Avery'}
        myName="Brother Quinn"
        timeZone="America/Denver"
        actions={actions}
        busy={false}
        {...extra}
      />
    </MemoryRouter>,
  )
  return { actions, user: userEvent.setup() }
}

describe('Reminders', () => {
  it("fills in who has each assignment from that day's agenda", () => {
    setup()
    const row = within(screen.getByRole('article', { name: 'Ward Council' }))
    expect(row.getByText('Spiritual thought: (not assigned yet)')).toBeInTheDocument()
    expect(row.getByRole('link', { name: 'Change on the agenda' })).toHaveAttribute('href', '/agenda/ward-council/2026-11-08')
    expect(row.getByLabelText('Message')).toHaveValue('Hi all, Ward Council is Sunday, November 8th at 9:15 AM.\nOpening prayer: Brother Ortiz\nClosing prayer: Sister Young\nBrother Quinn')
    expect(row.getByText('No one is down for spiritual thought on the agenda yet.')).toBeInTheDocument()
  })

  it('writes to the person with an assignment using another template', async () => {
    const { user } = setup()
    const row = within(screen.getByRole('article', { name: 'Ward Council' }))
    await user.selectOptions(row.getByLabelText('Template'), 'Opening prayer')
    expect(row.getByLabelText('Message')).toHaveValue('Hi Brother Ortiz, you have the opening prayer at Ward Council.')
    expect(row.queryByText(/No one is down/)).not.toBeInTheDocument()
  })

  it('marks a youth on the day before, so the reminder goes to a parent', async () => {
    const appointment = {
      id: 'a1', interviewer_id: 'b', scheduled_at: '2026-11-08T16:00:00Z', person_name: 'Avery Quinn', purpose: 'other' as const, candidate_id: null,
      location: null, status: 'scheduled' as const, notes: null, created_at: '2026-11-01T00:00:00Z', duration_minutes: 10, offered_at: null, offered_times: [],
      is_youth: false, parent_name: null, confirmed_at: null, reminded_at: null, missed_at: null, report_note: null, reported_at: null, reported_by: null,
    }
    const { actions, user } = setup({ meetings: [], appointments: [appointment] })
    const row = within(screen.getByRole('article', { name: 'Avery Quinn' }))
    await user.click(row.getByLabelText('Youth under 18: message a parent'))
    expect(actions.setYouth).toHaveBeenCalledWith('a1', true, null)
  })

  it('says appointment reminders are off, with the way to turn them on', () => {
    setup({ appointmentsOff: true })
    expect(screen.getByText(/turned appointment reminders off/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Send reminders in Settings' })).toHaveAttribute('href', '/settings')
  })

  it("says so when the meeting isn't linked to an agenda", () => {
    setup({ meetings: [{ ...event, agenda_template_id: null }] })
    expect(screen.getByText(/isn't linked to an agenda/)).toBeInTheDocument()
  })
})
