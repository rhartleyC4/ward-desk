import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LeaderChangePage } from './LeaderChangePage'

const q = vi.hoisted(() => ({
  loadLeadershipPeople: vi.fn(),
  loadCallingList: vi.fn(),
  loadLeadershipWork: vi.fn(),
  changeLeader: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../lib/queries', () => q)

beforeEach(() => {
  Object.values(q).forEach((f) => f.mockReset())
  q.loadLeadershipPeople.mockResolvedValue([
    { id: 'young', display_name: 'Sister Young', email: 'y@ward.test', office: null, organization: 'Relief Society' },
    { id: 'okafor', display_name: 'Sister Okafor', email: 'o@ward.test', office: null, organization: null },
    { id: 'lane', display_name: 'Brother Lane', email: 'l@ward.test', office: 'first_counselor', organization: null },
  ])
  q.loadCallingList.mockResolvedValue([{ id: '1', title: 'Primary President', organization: 'Primary' }, { id: '2', title: 'Relief Society President', organization: 'Relief Society' }])
  q.loadLeadershipWork.mockResolvedValue({ requests: 1, appointments: 0, calling_requests: 2, rotations: 0, stewardships: 0, secretary_links: 0, conducting: 0, reminders: 0, agendas: 1, has_hours: false })
  q.changeLeader.mockResolvedValue('h1')
})

const next = () => userEvent.click(screen.getByRole('button', { name: 'Next' }))

describe('LeaderChangePage', () => {
  it('names a new leader and moves the old one\'s open work', async () => {
    render(<MemoryRouter><LeaderChangePage /></MemoryRouter>)
    await userEvent.selectOptions(await screen.findByLabelText('Organization'), 'Relief Society')
    expect(screen.getByText('Led now by Sister Young.')).toBeInTheDocument()
    await next()
    const picker = screen.getByLabelText('New leader of Relief Society')
    expect(picker).not.toHaveTextContent('Brother Lane')
    await userEvent.selectOptions(picker, 'okafor')
    await next()
    await userEvent.click(screen.getByLabelText(/Has another leader calling/))
    await next()
    expect(await screen.findByText('2 calling requests')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Make the change' }))
    expect(q.changeLeader).toHaveBeenCalledWith({}, { organization: 'Relief Society', person: 'okafor', email: undefined, outgoingBecomes: 'leader' })
    expect(await screen.findByText('Relief Society has a new leader')).toBeInTheDocument()
  })
})
