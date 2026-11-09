import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, todayIso } from '../lib/dates'
import { updateMentoring } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { MentorBanner } from './MentorBanner'
import { MentorChoice, YourMentors } from './Mentoring'

const stub = vi.hoisted(() => ({ auth: {} as Record<string, unknown> }))

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => stub.auth }))
vi.mock('../lib/supabase', () => ({ supabase: { client: true }, WARD_TIME_ZONE: 'America/Denver' }))
vi.mock('../lib/queries')

const switchActing = vi.fn(async () => {})
const reloadMentoring = vi.fn(async () => {})
const mid = (date: string) => `${date}T18:00:00Z`
const today = todayIso()

const mentee = { for_id: 'new', name: 'Bishop Lane', ends_at: mid(addDays(today, 20)), sees_callings: true }
const mentor = { id: 'd1', name: 'Bishop Avery', starts_at: mid(addDays(today, -3)), ends_at: mid(addDays(today, 20)), sees_callings: false }

beforeEach(() => {
  vi.resetAllMocks()
  switchActing.mockResolvedValue(undefined)
  reloadMentoring.mockResolvedValue(undefined)
  stub.auth = { mentoring: [], mentoredBy: [], actingFor: null, hasOwnRoles: true, switchActing, reloadMentoring }
})

describe('MentorChoice', () => {
  it('shows nothing to someone who is not mentoring', () => {
    const { container } = render(<MentorChoice />)
    expect(container).toBeEmptyDOMElement()
  })

  it('offers the bishop and yourself, starting on yourself', () => {
    stub.auth = { ...stub.auth, mentoring: [mentee] }
    render(<MentorChoice />)
    expect(screen.getByRole('radio', { name: /Yourself/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /For Bishop Lane/ })).toHaveAccessibleName(expect.stringContaining('callings included'))
  })

  it('names someone unnamed, and says when callings are left out', () => {
    stub.auth = { ...stub.auth, mentoring: [{ ...mentee, name: null, sees_callings: false }], hasOwnRoles: false }
    render(<MentorChoice />)
    expect(screen.getByRole('radio', { name: /For the bishop/ })).toHaveAccessibleName(expect.stringContaining('without callings'))
    expect(screen.getByRole('radio', { name: /You have no calling of your own/ })).toBeInTheDocument()
  })

  it('switches to acting for the bishop', async () => {
    stub.auth = { ...stub.auth, mentoring: [mentee] }
    render(<MentorChoice />)
    await userEvent.click(screen.getByRole('radio', { name: /For Bishop Lane/ }))
    expect(switchActing).toHaveBeenCalledWith('new')
  })

  it('switches back to yourself', async () => {
    stub.auth = { ...stub.auth, mentoring: [mentee], actingFor: mentee }
    render(<MentorChoice />)
    expect(screen.getByRole('radio', { name: /For Bishop Lane/ })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: /Yourself/ }))
    expect(switchActing).toHaveBeenCalledWith(null)
  })

  it('shows why a switch failed', async () => {
    switchActing.mockRejectedValue(new Error('refused'))
    stub.auth = { ...stub.auth, mentoring: [mentee] }
    render(<MentorChoice />)
    await userEvent.click(screen.getByRole('radio', { name: /For Bishop Lane/ }))
    expect(await screen.findByText('refused')).toBeInTheDocument()
  })
})

describe('YourMentors', () => {
  const show = (m = mentor) => {
    stub.auth = { ...stub.auth, mentoredBy: [m] }
    render(<YourMentors />)
  }
  const lastDay = () => screen.getByLabelText('Last day')

  it('shows nothing without a mentor', () => {
    const { container } = render(<YourMentors />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names an unnamed mentor', () => {
    show({ ...mentor, name: null as never })
    expect(screen.getByText('Your mentor')).toBeInTheDocument()
  })

  it('allows callings, then reloads', async () => {
    show()
    await userEvent.click(screen.getByRole('switch', { name: 'Can see callings' }))
    expect(updateMentoring).toHaveBeenCalledWith(supabase, 'd1', { sees_callings: true })
    await waitFor(() => expect(reloadMentoring).toHaveBeenCalled())
  })

  it('ends mentoring now', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'End mentoring now' }))
    expect(updateMentoring).toHaveBeenCalledWith(supabase, 'd1', { ended: true })
  })

  it('shows why a change failed, and does not reload', async () => {
    vi.mocked(updateMentoring).mockRejectedValue(new Error('refused'))
    show()
    await userEvent.click(screen.getByRole('button', { name: 'End mentoring now' }))
    expect(await screen.findByText('refused')).toBeInTheDocument()
    expect(reloadMentoring).not.toHaveBeenCalled()
  })

  it('needs a different day before changing the end', () => {
    show()
    expect(screen.getByRole('button', { name: 'Change' })).toBeDisabled()
  })

  it('moves the last day', async () => {
    show()
    fireEvent.change(lastDay(), { target: { value: addDays(today, 10) } })
    await userEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(updateMentoring).toHaveBeenCalledWith(supabase, 'd1', { ends_at: expect.any(String) })
  })

  it('refuses a day in the past, and says which days are allowed', () => {
    show()
    fireEvent.change(lastDay(), { target: { value: addDays(today, -1) } })
    expect(screen.getByRole('button', { name: 'Change' })).toBeDisabled()
    expect(screen.getByText(/Pick a day from today to /)).toBeInTheDocument()
  })
})

describe('MentorBanner', () => {
  const show = () =>
    render(
      <MemoryRouter>
        <MentorBanner />
      </MemoryRouter>,
    )

  it('shows nothing unless acting for someone', () => {
    const { container } = show()
    expect(container).toBeEmptyDOMElement()
  })

  it('says who for, with the way back', async () => {
    stub.auth = { ...stub.auth, actingFor: mentee }
    show()
    expect(screen.getByRole('status')).toHaveTextContent('Helping Bishop Lane')
    await userEvent.click(screen.getByRole('button', { name: 'Be yourself' }))
    expect(switchActing).toHaveBeenCalledWith(null)
  })

  it('links to the account page for someone with no role of their own', () => {
    stub.auth = { ...stub.auth, actingFor: { ...mentee, name: null }, hasOwnRoles: false }
    show()
    expect(screen.getByRole('status')).toHaveTextContent('Helping the bishop')
    expect(screen.getByRole('link', { name: 'More' })).toHaveAttribute('href', '/account')
  })
})
