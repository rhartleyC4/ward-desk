import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HandoverPage } from './HandoverPage'

const q = vi.hoisted(() => ({
  loadLeadershipPeople: vi.fn(),
  loadCallingList: vi.fn(),
  loadLeadershipWork: vi.fn(),
  runHandover: vi.fn(),
}))
const reloadMentoring = vi.hoisted(() => vi.fn())

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ reloadMentoring }) }))
vi.mock('../lib/supabase', () => ({ supabase: {}, WARD_TIME_ZONE: 'America/Denver' }))
vi.mock('../lib/queries', () => q)

const people = [
  { id: 'avery', display_name: 'Bishop Avery', email: 'a@ward.test', office: 'bishop', organization: null },
  { id: 'lane', display_name: 'Brother Lane', email: 'l@ward.test', office: 'first_counselor', organization: null },
  { id: 'ortiz', display_name: 'Brother Ortiz', email: 'o@ward.test', office: 'second_counselor', organization: null },
  { id: 'quinn', display_name: 'Brother Quinn', email: 'q@ward.test', office: 'executive_secretary', organization: null },
  { id: 'reyes', display_name: 'Sister Reyes', email: 'r@ward.test', office: null, organization: 'Sunday School' },
]

beforeEach(() => {
  Object.values(q).forEach((f) => f.mockReset())
  q.loadLeadershipPeople.mockResolvedValue(people)
  q.loadCallingList.mockResolvedValue([{ id: 'c', title: 'Primary President', organization: 'Primary' }])
  q.loadLeadershipWork.mockResolvedValue({ requests: 2, appointments: 1, calling_requests: 0, rotations: 0, stewardships: 0, secretary_links: 0, conducting: 0, reminders: 0, agendas: 0, has_hours: false })
  q.runHandover.mockResolvedValue('h1')
})

const next = () => userEvent.click(screen.getByRole('button', { name: 'Next' }))

describe('HandoverPage', () => {
  it('walks through each office, the people leaving and mentoring, then makes the change', async () => {
    render(<MemoryRouter><HandoverPage /></MemoryRouter>)
    await screen.findByText("Who's the new bishop?")
    await userEvent.selectOptions(screen.getByLabelText('Bishop'), 'lane')
    await next()
    expect(screen.getByLabelText('First Counselor')).toHaveValue('empty')
    await userEvent.selectOptions(screen.getByLabelText('First Counselor'), 'reyes')
    await next()
    expect(screen.getByText('Who is second counselor?')).toBeInTheDocument()
    await next()
    await userEvent.selectOptions(screen.getByLabelText('Assistant Executive Secretary'), 'new')
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Their email'), 'new@ward.test')
    await next()

    expect(screen.getByText('The people leaving')).toBeInTheDocument()
    expect(screen.getByText(/Bishop Avery, Bishop/)).toBeInTheDocument()
    await next()

    expect(screen.getByText('Help for the new bishop')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Include callings'))
    await next()

    expect(screen.getByText('Check and confirm')).toBeInTheDocument()
    expect(await screen.findAllByText('2 open requests')).not.toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Make the change' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Make the change' }))

    expect(q.runHandover).toHaveBeenCalledOnce()
    const args = q.runHandover.mock.calls[0][1]
    expect(args.seats.bishop).toEqual({ kind: 'person', id: 'lane' })
    expect(args.seats.first_counselor).toEqual({ kind: 'person', id: 'reyes' })
    expect(args.seats.assistant_executive_secretary).toEqual({ kind: 'new', email: 'new@ward.test' })
    expect(args.leaving).toEqual({ avery: { becomes: 'released', organization: 'Primary' } })
    expect(args.mentorEndsAt).toBeTruthy()
    expect(args.mentorSeesCallings).toBe(true)
    expect(await screen.findByText('The new bishopric is set')).toBeInTheDocument()
    expect(screen.getByText(/new@ward.test/)).toBeInTheDocument()
  })

  it('won\'t move on without a bishop', async () => {
    render(<MemoryRouter><HandoverPage /></MemoryRouter>)
    await screen.findByText("Who's the new bishop?")
    await userEvent.selectOptions(screen.getByLabelText('Bishop'), 'new')
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})
