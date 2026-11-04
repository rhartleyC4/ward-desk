import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { agendaData, profiles } from '../test/fixtures'
import { SecretaryHome, type SecretaryHomeActions, type SecretaryHomeData } from './SecretaryHome'

const TZ = 'America/Denver'
// Today is Sunday 2026-11-08, 8:00 AM in Denver.
const TODAY = '2026-11-08'
const NOW = new Date('2026-11-08T15:00:00Z')
const ts = '2026-11-05T12:00:00Z'

type Appt = SecretaryHomeData['appointments'][number]
const appt = (id: string, interviewer: string, name: string, extra: Partial<Appt> = {}): Appt => ({
  id, interviewer_id: interviewer, scheduled_at: null, person_name: name, purpose: 'calling', candidate_id: null,
  location: null, status: 'scheduled', notes: null, created_at: ts, duration_minutes: 10, offered_at: null, offered_times: [], is_youth: false, parent_name: null, ...extra,
})

function data(extra: Partial<SecretaryHomeData> = {}): SecretaryHomeData {
  const { needs, candidates } = agendaData()
  return {
    appointments: [
      appt('a1', 'b', 'Sister Nash', { candidate_id: 'c3' }),
      appt('a2', 'b', 'Brother Ward', { purpose: 'temple_recommend' }),
      appt('a3', 'o', 'Sister Reed'), // Ortiz has no secretary here and no hours
      // Booked with the bishop: 9:00–9:20 and 9:15–9:25 run into each other.
      appt('a4', 'b', 'Brother Hale', { purpose: 'ppi', scheduled_at: '2026-11-08T16:00:00Z', duration_minutes: 20 }),
      appt('a5', 'b', 'Sister Moss', { purpose: 'other', scheduled_at: '2026-11-08T16:15:00Z' }),
    ],
    assignments: [
      { leader_id: 'b', secretary_id: 'exec', created_at: ts },
      { leader_id: 'l', secretary_id: 'exec', created_at: ts },
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
    hours: [
      { id: 'h1', user_id: 'b', weekday: 0, starts_at: '09:00:00', ends_at: '10:00:00' },
      { id: 'h2', user_id: 'b', weekday: 3, starts_at: '19:00:00', ends_at: '20:00:00' },
      { id: 'h3', user_id: 'l', weekday: 2, starts_at: '19:00:00', ends_at: '20:00:00' },
    ],
    changes: [],
    absences: [{ id: 'x', user_id: 'l', starts_on: '2026-11-10', ends_on: '2026-11-10', location: 'Moab', created_at: ts }],
    leaders: profiles,
    templates: [
      { id: 't1', name: 'Offer times', kind: 'offer', audience: 'member', body: 'Hi {first_name}, {leader} would like to meet for {length}:\n{times}\n{my_name}' },
      { id: 't2', name: 'Confirm time', kind: 'confirm', audience: 'member', body: 'Hi {first_name}, see {leader} on {time}.' },
      { id: 't3', name: 'Offer to a parent', kind: 'offer', audience: 'parent', body: 'Hi {parent_name}, {leader} would like to meet with {first_name}:\n{times}' },
    ],
    ...extra,
  }
}

function actions(): SecretaryHomeActions {
  return { book: vi.fn().mockResolvedValue(true), setLength: vi.fn(), complete: vi.fn(), offer: vi.fn(), setYouth: vi.fn(), saveTemplate: vi.fn().mockResolvedValue(true), deleteTemplate: vi.fn() }
}

const view = (d = data(), userId = 'exec') => {
  const a = actions()
  render(
    <MemoryRouter>
      <SecretaryHome data={d} userId={userId} myName="Brother Quinn" today={TODAY} now={NOW} timeZone={TZ} actions={a} busy={false} />
    </MemoryRouter>,
  )
  return a
}

const section = (title: RegExp) => screen.getByRole('heading', { name: title }).closest('section')!

describe('SecretaryHome', () => {
  it('lists who needs an appointment with the leaders this secretary covers', () => {
    view()
    const needs = section(/Needs an appointment/)
    expect(within(needs).getByText('Sister Nash')).toBeInTheDocument()
    expect(within(needs).getByText('Brother Ward')).toBeInTheDocument()
    expect(within(needs).queryByText('Sister Reed')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Needs an appointment (2)' })).toBeInTheDocument()
    expect(within(needs).getAllByText(/waiting 3 days/)).toHaveLength(2)
  })

  it('offers open times around the booked ones and books the one picked at the length chosen', async () => {
    const a = view()
    const nash = screen.getByRole('article', { name: 'Sister Nash' })
    await userEvent.click(within(nash).getByRole('button', { name: 'Find a time' }))
    // Sunday 9–10: 9:00–9:25 is booked, so the 10-minute times are 9:25, 9:35, 9:45.
    const sunday = within(nash).getByText('Sun, November 8th').parentElement!
    expect(within(sunday).getAllByRole('button').map((b) => b.textContent)).toEqual(['9:25 AM', '9:35 AM', '9:45 AM'])

    await userEvent.click(within(nash).getByRole('button', { name: 'Shorter for Sister Nash' }))
    expect(within(sunday).getAllByRole('button')).toHaveLength(7) // 5-minute times from 9:25 to 9:55

    await userEvent.click(within(nash).getByRole('button', { name: 'Wed, November 11th at 7 PM' }))
    await userEvent.click(within(nash).getByRole('button', { name: 'Book Wed, November 11th at 7 PM' }))
    expect(a.book).toHaveBeenCalledWith('a1', '2026-11-12T02:00:00.000Z', 5)
  })

  it('writes a message offering the times picked, ready to copy or open in Messages', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const a = view()
    const nash = screen.getByRole('article', { name: 'Sister Nash' })
    await userEvent.click(within(nash).getByRole('button', { name: 'Find a time' }))
    await userEvent.click(within(nash).getByRole('button', { name: 'Sun, November 8th at 9:25 AM' }))
    await userEvent.click(within(nash).getByRole('button', { name: 'Wed, November 11th at 7 PM' }))
    expect(within(nash).queryByRole('button', { name: /^Book/ })).not.toBeInTheDocument()

    await userEvent.click(within(nash).getByRole('button', { name: 'Message these 2 times' }))
    const text = 'Hi Sister Nash, Bishop Avery would like to meet for 10 minutes:\n• Sun, November 8th at 9:25 AM\n• Wed, November 11th at 7 PM\nBrother Quinn'
    expect(within(nash).getByLabelText('Message')).toHaveValue(text)
    expect(within(nash).getByRole('link', { name: 'Open Messages' })).toHaveAttribute('href', `sms:?&body=${encodeURIComponent(text)}`)

    await userEvent.click(within(nash).getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(text)
    expect(a.offer).toHaveBeenCalledWith('a1', ['2026-11-08T16:25:00.000Z', '2026-11-12T02:00:00.000Z'])
    expect(within(nash).getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('selects the text to copy by hand when the browser refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
    const a = view()
    const nash = screen.getByRole('article', { name: 'Sister Nash' })
    await userEvent.click(within(nash).getByRole('button', { name: 'Find a time' }))
    await userEvent.click(within(nash).getByRole('button', { name: 'Sun, November 8th at 9:25 AM' }))
    await userEvent.click(within(nash).getByRole('button', { name: 'Message this time' }))
    await userEvent.click(within(nash).getByRole('button', { name: 'Copy' }))
    expect(within(nash).getByText(/wouldn't copy/)).toBeInTheDocument()
    expect(within(nash).getByLabelText('Message')).toHaveFocus()
    expect(a.offer).not.toHaveBeenCalled()
  })

  it('writes to a parent for a youth', async () => {
    view(data({ appointments: [appt('y1', 'b', 'Avery Quinn', { is_youth: true, parent_name: 'Sister Quinn' })] }))
    const avery = screen.getByRole('article', { name: 'Avery Quinn' })
    expect(within(avery).getByText('youth · text parent')).toBeInTheDocument()
    await userEvent.click(within(avery).getByRole('button', { name: 'Find a time' }))
    await userEvent.click(within(avery).getByRole('button', { name: 'Sun, November 8th at 9 AM' }))
    await userEvent.click(within(avery).getByRole('button', { name: 'Message this time' }))
    expect(within(avery).getByLabelText('Message')).toHaveValue('Hi Sister Quinn, Bishop Avery would like to meet with Avery:\n• Sun, November 8th at 9 AM')
  })

  it('marks someone a youth and saves the parent\'s name', async () => {
    const a = view()
    const nash = screen.getByRole('article', { name: 'Sister Nash' })
    await userEvent.click(within(nash).getByRole('button', { name: 'Find a time' }))
    await userEvent.click(within(nash).getByRole('checkbox', { name: /Youth under 18/ }))
    expect(a.setYouth).toHaveBeenCalledWith('a1', true, null)
  })

  it('saves a parent\'s name when the field is left', async () => {
    const a = view(data({ appointments: [appt('y1', 'b', 'Avery Quinn', { is_youth: true })] }))
    const avery = screen.getByRole('article', { name: 'Avery Quinn' })
    await userEvent.click(within(avery).getByRole('button', { name: 'Find a time' }))
    await userEvent.type(within(avery).getByLabelText("Parent's name for Avery Quinn"), ' Brother Quinn {Enter}')
    expect(a.setYouth).toHaveBeenCalledWith('y1', true, 'Brother Quinn')
  })

  it('marks times already offered and when', async () => {
    view(data({ appointments: [appt('a1', 'b', 'Sister Nash', { offered_at: '2026-11-06T18:00:00Z', offered_times: ['2026-11-08T16:20:00+00:00'] })] }))
    const nash = screen.getByRole('article', { name: 'Sister Nash' })
    expect(nash).toHaveTextContent('offered Fri, November 6th')
    await userEvent.click(within(nash).getByRole('button', { name: 'Find a time' }))
    expect(within(nash).getByRole('button', { name: 'Sun, November 8th at 9:20 AM, offered' })).toHaveTextContent('• 9:20 AM')
  })

  it('writes a confirmation for a booked time', async () => {
    view(data({ appointments: [appt('a4', 'b', 'Brother Hale', { scheduled_at: '2026-11-11T02:30:00Z' })] }))
    const hale = screen.getByRole('article', { name: 'Brother Hale' })
    await userEvent.click(within(hale).getByRole('button', { name: 'Message' }))
    expect(within(hale).getByLabelText('Message')).toHaveValue('Hi Brother Hale, see Bishop Avery on Tue, November 10th at 7:30 PM.')
  })

  it('lets the secretary add a template and warns about a mistyped variable', async () => {
    const a = view()
    const card = section(/Message templates/)
    await userEvent.click(within(card).getByRole('button', { name: 'Add a template' }))
    const form = within(card).getByRole('form', { name: 'New template' })
    await userEvent.type(within(form).getByLabelText('Name'), 'Short')
    await userEvent.type(within(form).getByLabelText('Text'), 'Hi {{frist_name}')
    expect(within(form).getByText(/Not a variable: \{frist_name\}/)).toBeInTheDocument()
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }))
    expect(a.saveTemplate).toHaveBeenCalledWith({ name: 'Short', kind: 'offer', audience: 'member', body: 'Hi {frist_name}' })
  })

  it('keeps a temple recommend interview at 10 minutes or more', async () => {
    view()
    const ward = screen.getByRole('article', { name: 'Brother Ward' })
    await userEvent.click(within(ward).getByRole('button', { name: 'Find a time' }))
    expect(within(ward).getByRole('button', { name: 'Shorter for Brother Ward' })).toBeDisabled()
  })

  it('shows booked times with their length, and flags ones that run into each other', async () => {
    const a = view()
    const hale = screen.getByRole('article', { name: 'Brother Hale' })
    expect(hale).toHaveTextContent('Sun, November 8th 9–9:20 AM')
    expect(within(hale).getByText(/Runs into another appointment/)).toBeInTheDocument()

    await userEvent.click(within(hale).getByRole('button', { name: 'Shorter for Brother Hale' }))
    expect(a.setLength).toHaveBeenCalledWith('a4', 15)
    await userEvent.click(within(hale).getByRole('button', { name: 'Done' }))
    expect(a.complete).toHaveBeenCalledWith('a4')
  })

  it('marks a booked time that has passed without being marked done', () => {
    view(data({ appointments: [appt('p1', 'b', 'Brother Late', { scheduled_at: '2026-11-01T16:00:00Z' })] }))
    expect(within(screen.getByRole('article', { name: 'Brother Late' })).getByText(/Already past/)).toBeInTheDocument()
  })

  it('shows each covered leader\'s hours this week', () => {
    view()
    const week = section(/Bishopric this week/)
    expect(week).toHaveTextContent('Sun, November 8th: 9–10 AM')
    expect(week).toHaveTextContent('Tue, November 10th: Away (Moab)')
    expect(week).not.toHaveTextContent('Brother Ortiz')
  })

  it('covers every leader for the only executive secretary when no one else was picked', () => {
    view(data({ assignments: [] }))
    expect(screen.queryByText(/aren't assigned to schedule for anyone/)).not.toBeInTheDocument()
    expect(within(section(/Needs an appointment/)).getByText('Sister Reed')).toBeInTheDocument()
    expect(section(/Bishopric this week/)).toHaveTextContent('Brother Ortiz')
  })

  it('shows everyone to a secretary not yet assigned, and says so', () => {
    view(data(), 'someone-else')
    expect(screen.getByText(/aren't assigned to schedule for anyone/)).toBeInTheDocument()
    expect(within(section(/Needs an appointment/)).getByText('Sister Reed')).toBeInTheDocument()
    expect(section(/Bishopric this week/)).toHaveTextContent('Brother OrtizHours not set yet')
  })
})
