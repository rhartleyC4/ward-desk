import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UNREVIEWED } from '../lib/callings'
import { addToCallingList, loadCallingList, mergeCalling, removeFromCallingList, updateCallingListEntry } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { CallingListPage } from './CallingListPage'

vi.mock('../lib/supabase', () => ({ supabase: { client: true } }))
vi.mock('../lib/errorReport')
vi.mock('../lib/queries')

const list = [
  { id: 'a', title: 'Primary President', organization: 'Primary' },
  { id: 'b', title: 'Sunday School Teacher', organization: 'Sunday School' },
  { id: 'c', title: 'Primry Pres', organization: null },
]

const open = async () => {
  render(<CallingListPage />)
  await screen.findByRole('heading', { name: 'Calling list' })
}
const titleBox = (title: string) => screen.getByLabelText(`Title for ${title}`)

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(loadCallingList).mockResolvedValue(list as never)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('CallingListPage', () => {
  it('shows why when the list can\'t load', async () => {
    vi.mocked(loadCallingList).mockRejectedValue(new Error('load failed'))
    render(<CallingListPage />)
    expect(await screen.findByText('load failed')).toBeInTheDocument()
  })

  it('puts titles waiting for review first', async () => {
    await open()
    expect(screen.getAllByRole('heading', { level: 2 }).slice(1)[0]).toHaveTextContent(`${UNREVIEWED} (1)`)
  })

  it('finds a calling by any part of its title', async () => {
    await open()
    await userEvent.type(screen.getByLabelText('Find a calling'), 'TEACHER')
    expect(titleBox('Sunday School Teacher')).toBeInTheDocument()
    expect(screen.queryByLabelText('Title for Primary President')).not.toBeInTheDocument()
  })

  it('says when nothing matches', async () => {
    await open()
    await userEvent.type(screen.getByLabelText('Find a calling'), 'zzz')
    expect(screen.getByText('No callings match.')).toBeInTheDocument()
  })

  it('adds a calling, then clears the title but keeps the organization', async () => {
    await open()
    const form = screen.getByRole('button', { name: 'Add' }).closest('form') as HTMLFormElement
    await userEvent.selectOptions(screen.getByLabelText('Organization for the new calling'), 'Primary')
    await userEvent.type(within(form).getByRole('textbox', { name: /Title/ }), 'Nursery Leader')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(addToCallingList).toHaveBeenCalledWith(supabase, { title: 'Nursery Leader', organization: 'Primary' })
    await waitFor(() => expect(within(form).getByRole('textbox', { name: /Title/ })).toHaveValue(''))
    expect(screen.getByLabelText('Organization for the new calling')).toHaveValue('Primary')
    expect(loadCallingList).toHaveBeenCalledTimes(2)
  })

  it('adds nothing for a blank title', async () => {
    await open()
    const form = screen.getByRole('button', { name: 'Add' }).closest('form') as HTMLFormElement
    await userEvent.type(within(form).getByRole('textbox', { name: /Title/ }), '   ')
    fireEvent.submit(form)
    expect(addToCallingList).not.toHaveBeenCalled()
  })

  it('keeps the title typed when adding fails, and explains a duplicate', async () => {
    vi.mocked(addToCallingList).mockRejectedValue(new Error('duplicate key value'))
    await open()
    const form = screen.getByRole('button', { name: 'Add' }).closest('form') as HTMLFormElement
    await userEvent.type(within(form).getByRole('textbox', { name: /Title/ }), 'Primary President')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('That title is already on the list. Merge this one into it instead.')).toBeInTheDocument()
    expect(within(form).getByRole('textbox', { name: /Title/ })).toHaveValue('Primary President')
  })

  it('renames a title on leaving the box', async () => {
    await open()
    const box = titleBox('Primry Pres')
    await userEvent.clear(box)
    await userEvent.type(box, 'Primary Secretary')
    await userEvent.tab()
    expect(updateCallingListEntry).toHaveBeenCalledWith(supabase, 'c', { title: 'Primary Secretary' })
  })

  it('renames on Enter', async () => {
    await open()
    const box = titleBox('Primry Pres')
    await userEvent.clear(box)
    await userEvent.type(box, 'Primary Secretary{Enter}')
    expect(updateCallingListEntry).toHaveBeenCalledWith(supabase, 'c', { title: 'Primary Secretary' })
  })

  it('saves nothing when the title didn\'t change', async () => {
    await open()
    await userEvent.click(titleBox('Primry Pres'))
    await userEvent.tab()
    expect(updateCallingListEntry).not.toHaveBeenCalled()
  })

  it('puts the title back when it is left blank', async () => {
    await open()
    const box = titleBox('Primry Pres')
    await userEvent.clear(box)
    await userEvent.tab()
    expect(box).toHaveValue('Primry Pres')
    expect(updateCallingListEntry).not.toHaveBeenCalled()
  })

  it('puts the title back when the rename is refused', async () => {
    vi.mocked(updateCallingListEntry).mockRejectedValue(new Error('no'))
    await open()
    const box = titleBox('Primry Pres')
    await userEvent.clear(box)
    await userEvent.type(box, 'Other{Enter}')
    await waitFor(() => expect(box).toHaveValue('Primry Pres'))
    expect(screen.getByText('no')).toBeInTheDocument()
  })

  it('files a title under an organization, or none', async () => {
    await open()
    await userEvent.selectOptions(screen.getByLabelText('Organization for Primry Pres'), 'Primary')
    expect(updateCallingListEntry).toHaveBeenCalledWith(supabase, 'c', { organization: 'Primary' })
    await userEvent.selectOptions(screen.getByLabelText('Organization for Primary President'), '')
    expect(updateCallingListEntry).toHaveBeenCalledWith(supabase, 'a', { organization: null })
  })

  it('removes a title after asking', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Primry Pres' }))
    expect(window.confirm).toHaveBeenCalled()
    expect(removeFromCallingList).toHaveBeenCalledWith(supabase, 'c')
  })

  it('keeps a title when the answer is no', async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Primry Pres' }))
    expect(removeFromCallingList).not.toHaveBeenCalled()
  })

  describe('merging', () => {
    const startMerge = async () => {
      await open()
      await userEvent.click(screen.getByRole('button', { name: 'Merge Primry Pres' }))
      return screen.getByLabelText('Merge Primry Pres into')
    }

    it('offers every other title, and needs one picked', async () => {
      const select = await startMerge()
      expect(within(select).queryByRole('option', { name: 'Primry Pres' })).not.toBeInTheDocument()
      expect(within(select).getByRole('option', { name: 'Primary President' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Merge' })).toBeDisabled()
    })

    it('merges into the title picked, after asking', async () => {
      const select = await startMerge()
      await userEvent.selectOptions(select, 'a')
      await userEvent.click(screen.getByRole('button', { name: 'Merge' }))
      expect(vi.mocked(window.confirm).mock.calls[0][0]).toContain('Merge Primry Pres into Primary President?')
      expect(mergeCalling).toHaveBeenCalledWith(supabase, 'c', 'a')
    })

    it('merges nothing when the answer is no', async () => {
      vi.mocked(window.confirm).mockReturnValue(false)
      const select = await startMerge()
      await userEvent.selectOptions(select, 'a')
      await userEvent.click(screen.getByRole('button', { name: 'Merge' }))
      expect(mergeCalling).not.toHaveBeenCalled()
    })

    it('can be cancelled', async () => {
      await startMerge()
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByLabelText('Merge Primry Pres into')).not.toBeInTheDocument()
    })
  })
})
