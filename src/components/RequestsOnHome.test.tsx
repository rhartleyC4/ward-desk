import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays } from '../lib/dates'
import { wardToday } from '../lib/wardToday'
import * as q from '../lib/queries'
import { supabase } from '../lib/supabase'
import { RequestsOnHome } from './RequestsOnHome'

const stub = vi.hoisted(() => ({ roles: ['bishopric'] as string[], refresh: vi.fn() }))

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ profile: { id: 'me' }, roles: stub.roles }) }))
vi.mock('../lib/supabase', () => ({ supabase: { client: true }, WARD_TIME_ZONE: 'America/Denver' }))
vi.mock('../lib/errorReport')
vi.mock('../lib/queries')
vi.mock('./WaitingCount', () => ({ useRefreshWaiting: () => stub.refresh }))

const later = addDays(wardToday(), 5)
const request = (over = {}) => ({ id: 'r1', from_id: 'lane', to_id: 'me', title: 'Call the stake', status: 'sent', created_at: `${wardToday()}T12:00:00Z`, updated_at: `${wardToday()}T12:00:00Z`, due_on: null, reply: null, ...over })
const calling = (over = {}) => ({ id: 'c1', kind: 'fill', calling_title: 'Primary Teacher', organization: 'Primary', requested_by: 'lane', routed_to: ['me'], received_at: null, release_name: null, names: [], ...over })
const part = (over = {}) => ({ id: 'a1', part: 'opening_prayer', status: 'asked', meeting_date: later, template_name: 'Bishopric', ...over })

const open = () =>
  render(
    <MemoryRouter>
      <RequestsOnHome />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.resetAllMocks()
  stub.roles = ['bishopric']
  vi.mocked(q.loadRequests).mockResolvedValue([])
  vi.mocked(q.loadCallingRequests).mockResolvedValue([])
  vi.mocked(q.loadMyAssignments).mockResolvedValue([])
  vi.mocked(q.loadProfiles).mockResolvedValue([{ id: 'lane', display_name: 'Sister Lane' }] as never)
})

describe('RequestsOnHome', () => {
  it('shows nothing when nothing is waiting', async () => {
    const { container } = open()
    await waitFor(() => expect(q.loadMyAssignments).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('only asks the bishopric for calling requests', async () => {
    stub.roles = ['leader']
    vi.mocked(q.loadRequests).mockResolvedValue([request()] as never)
    open()
    await screen.findByText('Waiting for you')
    expect(q.loadCallingRequests).not.toHaveBeenCalled()
  })

  it('acknowledges a new request and tells the sender', async () => {
    vi.mocked(q.loadRequests).mockResolvedValue([request()] as never)
    open()
    expect(await screen.findByText(/From Sister Lane/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Got it: Call the stake' }))
    expect(q.answerRequest).toHaveBeenCalledWith(supabase, 'r1', 'seen')
    expect(q.pushAbout).toHaveBeenCalledWith(supabase, 'request_answered', 'r1')
    await waitFor(() => expect(q.loadRequests).toHaveBeenCalledTimes(2))
    expect(stub.refresh).toHaveBeenCalled()
  })

  it('has no button for one already seen', async () => {
    vi.mocked(q.loadRequests).mockResolvedValue([request({ status: 'seen' })] as never)
    open()
    await screen.findByText('Call the stake')
    expect(screen.queryByRole('button', { name: /Got it/ })).not.toBeInTheDocument()
  })

  it.each([
    [null, /From Former member/i],
    ['stranger', /From Someone/],
  ])('names a sender with id %s', async (from_id, line) => {
    vi.mocked(q.loadRequests).mockResolvedValue([request({ from_id })] as never)
    open()
    expect(await screen.findByText(line)).toBeInTheDocument()
  })

  it('shows why when an answer fails, and does not refresh', async () => {
    vi.mocked(q.answerRequest).mockRejectedValue(new Error('refused'))
    vi.mocked(q.loadRequests).mockResolvedValue([request()] as never)
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Got it: Call the stake' }))
    expect(await screen.findByText('refused')).toBeInTheDocument()
    expect(stub.refresh).not.toHaveBeenCalled()
    expect(q.pushAbout).not.toHaveBeenCalled()
  })

  it.each([
    ['Accept', 'accepted'],
    ['Decline', 'declined'],
  ])('can %s a meeting assignment', async (button, status) => {
    vi.mocked(q.loadMyAssignments).mockResolvedValue([part()] as never)
    open()
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${button}: `) }))
    expect(q.answerAssignment).toHaveBeenCalledWith(supabase, 'a1', status)
    expect(q.pushAbout).toHaveBeenCalledWith(supabase, 'assignment_answered', 'a1')
  })

  it('receives a calling request, naming who sent it and their organization', async () => {
    vi.mocked(q.loadCallingRequests).mockResolvedValue([calling()] as never)
    open()
    expect(await screen.findByText('Calling request from Sister Lane (Primary)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Got it: / }))
    expect(q.receiveCallingRequest).toHaveBeenCalledWith(supabase, 'c1', 'me')
    expect(q.pushAbout).toHaveBeenCalledWith(supabase, 'calling_request_received', 'c1')
  })

  it('leaves out the organization when there is none', async () => {
    vi.mocked(q.loadCallingRequests).mockResolvedValue([calling({ organization: null })] as never)
    open()
    expect(await screen.findByText('Calling request from Sister Lane')).toBeInTheDocument()
  })

  it('links to all of them', async () => {
    vi.mocked(q.loadRequests).mockResolvedValue([request()] as never)
    open()
    expect(await screen.findByRole('link', { name: 'Open requests' })).toHaveAttribute('href', '/requests')
  })

  it('shows the first three and counts the rest', async () => {
    vi.mocked(q.loadRequests).mockResolvedValue(['a', 'b', 'c', 'd'].map((id) => request({ id, title: `Task ${id}` })) as never)
    open()
    expect(await screen.findByRole('link', { name: 'See all 4' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Got it/ })).toHaveLength(3)
  })
})
