import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { longDate, sundaysFrom } from '../lib/dates'
import { wardToday } from '../lib/wardToday'
import { loadBishopric, loadProfiles, loadSacrament, saveMeeting } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { SacramentPage } from './SacramentPage'

const stub = vi.hoisted(() => ({ roles: ['bishopric'] as string[], editor: {} as Record<string, (arg?: unknown) => unknown> }))

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ roles: stub.roles }) }))
vi.mock('../lib/supabase', () => ({ supabase: { client: true }, WARD_TIME_ZONE: 'America/Denver' }))
vi.mock('../lib/errorReport')
vi.mock('../lib/queries')
vi.mock('../components/MeetingEditor', () => ({
  MeetingEditor: (p: Record<string, (arg?: unknown) => unknown>) => {
    stub.editor = p
    return <div>editor</div>
  },
}))
vi.mock('../components/MeetingSummary', () => ({
  meetingLabel: (m?: { label?: string }) => m?.label ?? null,
  MeetingSummary: ({ items }: { items: unknown[] }) => <div>{`summary of ${items.length}`}</div>,
}))

const [first, second] = sundaysFrom(wardToday(), 12)
const meeting = { id: 'm1', meeting_date: first, label: 'Fast Sunday' }
const form = { meeting: { id: 'm1' }, items: [{ id: 'i' }] }

const open = async () => {
  render(<SacramentPage />)
  await screen.findByRole('heading', { name: 'Sacrament meetings' })
}

beforeEach(() => {
  vi.resetAllMocks()
  stub.roles = ['bishopric']
  vi.mocked(loadSacrament).mockResolvedValue({ meetings: [meeting], items: [{ id: 'i1', meeting_id: 'm1' }, { id: 'i2', meeting_id: 'other' }], absences: [] } as never)
  vi.mocked(loadProfiles).mockResolvedValue([])
  vi.mocked(loadBishopric).mockResolvedValue([])
  vi.mocked(saveMeeting).mockResolvedValue(undefined as never)
})

describe('SacramentPage', () => {
  it('shows why when it can\'t load', async () => {
    vi.mocked(loadSacrament).mockRejectedValue(new Error('load failed'))
    render(<SacramentPage />)
    expect(await screen.findByText('load failed')).toBeInTheDocument()
  })

  it('loads twelve Sundays from this one', async () => {
    await open()
    const sundays = sundaysFrom(wardToday(), 12)
    expect(loadSacrament).toHaveBeenCalledWith(supabase, sundays[0], sundays[11])
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(12)
  })

  it('shows a planned Sunday\'s label and only its own items', async () => {
    await open()
    expect(screen.getByText('Fast Sunday')).toBeInTheDocument()
    expect(screen.getByText('summary of 1')).toBeInTheDocument()
    expect(screen.getAllByText('summary of 0')).toHaveLength(11)
  })

  it('offers Edit on a planned Sunday and Plan on an empty one', async () => {
    await open()
    expect(screen.getByRole('button', { name: `Edit ${longDate(first)}` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Plan ${longDate(second)}` })).toBeInTheDocument()
  })

  it('offers neither to someone who can\'t plan, but still shows the label', async () => {
    stub.roles = ['admin']
    await open()
    expect(screen.queryByRole('button', { name: /^(Edit|Plan) / })).not.toBeInTheDocument()
    expect(screen.getByText('Fast Sunday')).toBeInTheDocument()
  })

  const edit = async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: `Edit ${longDate(first)}` }))
    expect(screen.getByText('editor')).toBeInTheDocument()
  }

  it('opens the editor in place, hiding its own Edit button', async () => {
    await edit()
    expect(screen.queryByRole('button', { name: `Edit ${longDate(first)}` })).not.toBeInTheDocument()
  })

  it('closes the editor on cancel', async () => {
    await edit()
    act(() => void stub.editor.onCancel())
    expect(screen.queryByText('editor')).not.toBeInTheDocument()
  })

  it('saves, closes and refreshes', async () => {
    await edit()
    await act(async () => {
      await stub.editor.onSave(form)
    })
    expect(saveMeeting).toHaveBeenCalledWith(supabase, form.meeting, form.items)
    expect(screen.queryByText('editor')).not.toBeInTheDocument()
    await waitFor(() => expect(loadSacrament).toHaveBeenCalledTimes(2))
  })

  it('stays open with the reason when saving fails', async () => {
    vi.mocked(saveMeeting).mockRejectedValue(new Error('refused'))
    await edit()
    await act(async () => {
      await stub.editor.onSave(form)
    })
    expect(screen.getByText('refused')).toBeInTheDocument()
    expect(screen.getByText('editor')).toBeInTheDocument()
    expect(loadSacrament).toHaveBeenCalledOnce()
  })
})
