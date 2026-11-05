import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { CallingRequest, MyCallingRequest, Request } from '../lib/requests'
import { RequestsView, type RequestsActions, type RequestsData } from './Requests'

const ts = '2026-11-03T15:00:00Z'
const profile = (id: string, display_name: string) => ({ id, email: `${id}@ward.test`, display_name, short_name: null })
const people = [profile('bishop', 'Bishop Avery'), profile('sec', 'Brother Quinn'), profile('second', 'Brother Ortiz'), profile('leader', 'Sister Reyes')]

const request = (over: Partial<Request>): Request => ({
  id: 'r1',
  from_id: 'bishop',
  to_id: 'sec',
  title: 'Call the Lees',
  details: 'About Sunday',
  due_on: null,
  status: 'sent',
  reply: null,
  agenda_item_id: null,
  seen_at: null,
  closed_at: null,
  created_at: ts,
  updated_at: ts,
  ...over,
})

const callingRequest: CallingRequest = {
  id: 'c1',
  requested_by: 'leader',
  kind: 'fill',
  calling_title: 'Primary Teacher',
  organization: 'Primary',
  release_name: null,
  needed_by: '2026-12-01',
  notes: 'Sunbeams need one',
  need_id: 'n1',
  routed_to: ['second'],
  received_by: null,
  received_at: null,
  created_at: ts,
}

function data(over: Partial<RequestsData> = {}): RequestsData {
  return { requests: [], people, recipients: [], callingRequests: [], candidates: [], myCallingRequests: [], callings: [{ id: 'l1', title: 'Primary Teacher', organization: 'Primary' }], ...over }
}

function actions(): RequestsActions {
  return { send: vi.fn().mockResolvedValue(true), answer: vi.fn().mockResolvedValue(true), takeBack: vi.fn(), receive: vi.fn(), sendCallingRequest: vi.fn().mockResolvedValue(true) }
}

const view = (props: Partial<Parameters<typeof RequestsView>[0]>) =>
  render(
    <MemoryRouter>
      <RequestsView data={data()} userId="sec" today="2026-11-04" canSend={false} canAskCallings={false} actions={actions()} busy={false} {...props} />
    </MemoryRouter>,
  )

describe('RequestsView', () => {
  it('lets the person asked say they got it, then that it’s done with a note', async () => {
    const a = actions()
    view({ data: data({ requests: [request({})] }), actions: a, canSend: true })

    const card = screen.getByRole('article', { name: 'Call the Lees' })
    expect(within(card).getByText('From Bishop Avery · Not seen yet')).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Got it' }))
    expect(a.answer).toHaveBeenCalledWith('r1', 'seen')

    await userEvent.click(within(card).getByRole('button', { name: "It's done" }))
    await userEvent.type(within(card).getByLabelText('Anything to add? (optional)'), 'Called them')
    await userEvent.click(within(card).getByRole('button', { name: 'Mark done' }))
    expect(a.answer).toHaveBeenCalledWith('r1', 'done', 'Called them')
  })

  it('shows the sender where each request stands, and flags one still unread', () => {
    view({
      userId: 'bishop',
      canSend: true,
      data: data({ requests: [request({ created_at: '2026-11-01T10:00:00Z' }), request({ id: 'r2', title: 'Plan the fireside', status: 'done', reply: 'All set', closed_at: ts })] }),
    })
    const sent = screen.getByRole('heading', { name: 'You asked' }).closest('section') as HTMLElement
    expect(within(sent).getByText(/Not opened after 2 days/)).toBeInTheDocument()
    expect(within(sent).getByText('“All set”')).toBeInTheDocument()
  })

  it('sends a request in two steps', async () => {
    const a = actions()
    view({ userId: 'bishop', canSend: true, actions: a, data: data({ recipients: [{ id: 'sec', display_name: 'Brother Quinn', office: 'executive_secretary', in_bishopric: true }] }) })

    await userEvent.click(screen.getByRole('button', { name: /Ask someone to do something/ }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Who is it for/ }), 'sec')
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await userEvent.type(screen.getByLabelText(/In a few words/), 'Set up chairs')
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }))

    expect(a.send).toHaveBeenCalledWith({ to_id: 'sec', title: 'Set up chairs', details: null, due_on: null })
    expect(await screen.findByRole('status')).toHaveTextContent('Brother Quinn will see it')
  })

  it('shows the bishopric new calling requests with the names that came with them', async () => {
    const a = actions()
    view({ userId: 'second', canSend: true, actions: a, data: data({ callingRequests: [callingRequest], candidates: [{ request_id: 'c1', person_name: 'Sister Vale' }] }) })

    const row = screen.getByRole('article', { name: 'Fill Primary Teacher' })
    expect(within(row).getByText('From Sister Reyes (Primary) · sent 11/3 · needed by December 1st')).toBeInTheDocument()
    expect(within(row).getByText('Suggested: Sister Vale')).toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: 'Got it' }))
    expect(a.receive).toHaveBeenCalledWith('c1')
  })

  it('walks a leader through a calling request', async () => {
    const a = actions()
    view({ userId: 'leader', canAskCallings: true, actions: a })

    await userEvent.click(screen.getByRole('button', { name: /Ask for a calling change/ }))
    await userEvent.click(screen.getByLabelText(/Release someone and call someone new/))
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))

    const next = screen.getByRole('button', { name: 'Next' })
    await userEvent.type(screen.getByRole('combobox', { name: /Calling/ }), 'Primary Teacher')
    expect(next).toBeDisabled() // still needs who's released
    await userEvent.type(screen.getByLabelText(/Who should be released/), 'Brother Hale')
    await userEvent.click(next)

    await userEvent.type(screen.getByLabelText('Name (optional)'), 'Sister Vale')
    await userEvent.click(screen.getByRole('button', { name: 'Add another name' }))
    await userEvent.type(screen.getByLabelText('Another name'), 'Brother Moss')
    await userEvent.click(screen.getByRole('button', { name: 'Send to the bishopric' }))

    expect(a.sendCallingRequest).toHaveBeenCalledWith({
      kind: 'replace',
      calling_title: 'Primary Teacher',
      organization: 'Primary',
      release_name: 'Brother Hale',
      needed_by: null,
      notes: null,
      names: ['Sister Vale', 'Brother Moss'],
    })
  })

  it('tells a leader how far along their request is, without the bishopric’s decisions', () => {
    const mine: MyCallingRequest = {
      id: 'c1',
      kind: 'fill',
      calling_title: 'Primary Teacher',
      organization: 'Primary',
      release_name: null,
      needed_by: null,
      notes: null,
      names: ['Sister Vale'],
      created_at: ts,
      received_at: ts,
      received_by_name: 'Brother Ortiz',
      stage: 'in_progress',
    }
    view({ userId: 'leader', canAskCallings: true, data: data({ myCallingRequests: [mine] }) })
    const row = screen.getByRole('article', { name: 'Fill Primary Teacher' })
    expect(within(row).getByText('Being worked on')).toBeInTheDocument()
    expect(within(row).getByText('Sent 11/3 · received by Brother Ortiz')).toBeInTheDocument()
    expect(within(row).getByText('You suggested Sister Vale')).toBeInTheDocument()
  })
})
