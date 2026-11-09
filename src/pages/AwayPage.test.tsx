import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, upcomingSunday } from '../lib/dates'
import { wardToday } from '../lib/wardToday'
import { addAbsence, deleteAbsence, loadAbsences, loadBishopric, loadProfiles } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { AwayPage } from './AwayPage'

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }))
vi.mock('../lib/supabase', () => ({ supabase: { client: true }, WARD_TIME_ZONE: 'America/Denver' }))
vi.mock('../lib/errorReport')
vi.mock('../lib/queries')

const people = [
  { id: 'me', display_name: 'Avery', short_name: null, email: 'a@ward.test' },
  { id: 'lane', display_name: 'Lane', short_name: null, email: 'l@ward.test' },
  { id: 'ortiz', display_name: 'Ortiz', short_name: null, email: 'o@ward.test' },
]
// Far enough ahead that it's always in the future, whatever day the tests run.
const SUNDAY = upcomingSunday(addDays(wardToday(), 30))
const absence = (user_id: string, starts_on: string, ends_on = starts_on, location: string | null = null) => ({ id: `${user_id}-${starts_on}`, user_id, starts_on, ends_on, location })

const open = async () => {
  render(<AwayPage />)
  await screen.findByRole('heading', { name: 'Away dates' })
}
const fill = (label: RegExp, value: string) => userEvent.type(screen.getByLabelText(label), value)

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(loadAbsences).mockResolvedValue([])
  vi.mocked(loadProfiles).mockResolvedValue(people as never)
  vi.mocked(loadBishopric).mockResolvedValue(people as never)
})

describe('AwayPage', () => {
  it('shows why when it can\'t load', async () => {
    vi.mocked(loadAbsences).mockRejectedValue(new Error('load failed'))
    render(<AwayPage />)
    expect(await screen.findByText('load failed')).toBeInTheDocument()
  })

  it('says when no one is away', async () => {
    await open()
    expect(screen.getByText('No one is away.')).toBeInTheDocument()
  })

  it('adds one day when no end is given, and clears the form', async () => {
    await open()
    await fill(/From/, SUNDAY)
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(addAbsence).toHaveBeenCalledWith(supabase, { starts_on: SUNDAY, ends_on: SUNDAY, location: null })
    await waitFor(() => expect(screen.getByLabelText(/From/)).toHaveValue(''))
    expect(loadAbsences).toHaveBeenCalledTimes(2)
  })

  it('adds a range with where they will be', async () => {
    await open()
    const through = addDays(SUNDAY, 3)
    await fill(/From/, SUNDAY)
    await fill(/Through/, through)
    await fill(/Where/, '  Utah ')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(addAbsence).toHaveBeenCalledWith(supabase, { starts_on: SUNDAY, ends_on: through, location: 'Utah' })
  })

  it('keeps the dates and shows why when adding fails', async () => {
    vi.mocked(addAbsence).mockRejectedValue(new Error('refused'))
    await open()
    await fill(/From/, SUNDAY)
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('refused')).toBeInTheDocument()
    expect(screen.getByLabelText(/From/)).toHaveValue(SUNDAY)
  })

  it('warns before adding dates that leave a Sunday short', async () => {
    vi.mocked(loadAbsences).mockResolvedValue([absence('lane', SUNDAY)] as never)
    await open()
    expect(screen.queryByText(/With these dates/)).not.toBeInTheDocument()
    await fill(/From/, SUNDAY)
    expect(screen.getByText(/With these dates/)).toBeInTheDocument()
  })

  it('shows each person, their dates and where', async () => {
    vi.mocked(loadAbsences).mockResolvedValue([absence('lane', SUNDAY, addDays(SUNDAY, 2), 'Utah')] as never)
    await open()
    const row = screen.getByRole('row', { name: /Lane/ })
    expect(within(row).getByText('Utah')).toBeInTheDocument()
    expect(within(row).getByText(/ – /)).toBeInTheDocument()
  })

  it('shows one date for a single day', async () => {
    vi.mocked(loadAbsences).mockResolvedValue([absence('lane', SUNDAY)] as never)
    await open()
    expect(within(screen.getByRole('row', { name: /Lane/ })).queryByText(/ – /)).not.toBeInTheDocument()
  })

  it('lets you remove only your own', async () => {
    vi.mocked(loadAbsences).mockResolvedValue([absence('me', SUNDAY), absence('lane', addDays(SUNDAY, 7))] as never)
    await open()
    expect(within(screen.getByRole('row', { name: /Lane/ })).queryByRole('button')).not.toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('row', { name: /Avery/ })).getByRole('button', { name: 'Remove' }))
    expect(deleteAbsence).toHaveBeenCalledWith(supabase, `me-${SUNDAY}`)
    await waitFor(() => expect(loadAbsences).toHaveBeenCalledTimes(2))
  })

  it('does not refresh when removing fails', async () => {
    vi.mocked(deleteAbsence).mockRejectedValue(new Error('refused'))
    vi.mocked(loadAbsences).mockResolvedValue([absence('me', SUNDAY)] as never)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('refused')).toBeInTheDocument()
    expect(loadAbsences).toHaveBeenCalledOnce()
  })
})
