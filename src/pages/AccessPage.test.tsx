import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addInvite, deleteAccount, loadAccess, removeInvite, updateInvite } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { AccessPage } from './AccessPage'

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ profile: { email: 'Me@Ward.test' } }) }))
vi.mock('../lib/supabase', () => ({ supabase: { client: true } }))
vi.mock('../lib/errorReport')
vi.mock('../lib/queries')

const invite = (email: string, profile_id: string | null, more = {}) => ({ email, profile_id, initial_roles: [], initial_office: null, initial_organization: null, ...more })

const data = {
  organizations: ['Primary', 'Sunday School'],
  invites: [
    invite('me@ward.test', 'me', { initial_roles: ['admin'] }),
    invite('quinn@ward.test', 'quinn', { initial_roles: ['bishopric', 'leader'], initial_office: 'ward_clerk', initial_organization: 'Scouts' }),
    invite('new@ward.test', null),
  ],
  accounts: [
    { id: 'me', email: 'me@ward.test', display_name: 'Avery', removed_at: null },
    { id: 'quinn', email: 'quinn@ward.test', display_name: null, removed_at: null },
    { id: 'gone', email: 'gone@ward.test', display_name: 'Sister Gone', removed_at: '2026-01-15T12:00:00Z' },
    { id: 'gone2', email: 'gone2@ward.test', display_name: null, removed_at: null },
  ],
}

const open = async () => {
  render(<AccessPage />)
  await screen.findByRole('heading', { name: 'Access' })
}
const chip = (name: string) => screen.getByRole('button', { name })

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(loadAccess).mockResolvedValue(data as never)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('AccessPage', () => {
  it('shows why when it can\'t load', async () => {
    vi.mocked(loadAccess).mockRejectedValue(new Error('load failed'))
    render(<AccessPage />)
    expect(await screen.findByText('load failed')).toBeInTheDocument()
  })

  it('shows who has signed in', async () => {
    await open()
    expect(screen.getByText('Avery (you)')).toBeInTheDocument()
    expect(screen.getByText('Signed in')).toBeInTheDocument()
    expect(screen.getByText("Hasn't signed in yet")).toBeInTheDocument()
    expect(screen.getByText('Who can sign in (3)')).toBeInTheDocument()
  })

  it('won\'t let you remove yourself or your own admin access, matching email in any case', async () => {
    await open()
    expect(screen.getByRole('button', { name: 'Remove me@ward.test' })).toBeDisabled()
    expect(chip('Admin for me@ward.test')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByRole('button', { name: 'Delete account for me@ward.test' })).not.toBeInTheDocument()
  })

  describe('adding someone', () => {
    const form = () => screen.getByRole('button', { name: 'Add' }).closest('form') as HTMLFormElement

    it('adds them with the roles and position chosen, then clears the form', async () => {
      await open()
      await userEvent.type(screen.getByLabelText(/Email/), 'x@ward.test')
      await userEvent.click(chip('Bishopric for the new email'))
      await userEvent.selectOptions(screen.getByLabelText('Position for the new email'), 'bishop')
      await userEvent.click(chip('Ward leader for the new email'))
      await userEvent.selectOptions(screen.getByLabelText('Organization for the new email'), 'Primary')
      await userEvent.click(within(form()).getByRole('button', { name: 'Add' }))
      expect(addInvite).toHaveBeenCalledWith(supabase, 'x@ward.test', { initial_roles: ['bishopric', 'leader'], initial_office: 'bishop', initial_organization: 'Primary' })
      await waitFor(() => expect(screen.getByLabelText(/Email/)).toHaveValue(''))
      expect(screen.queryByLabelText('Position for the new email')).not.toBeInTheDocument()
    })

    it('drops the position and organization when their role is turned off', async () => {
      await open()
      await userEvent.type(screen.getByLabelText(/Email/), 'x@ward.test')
      await userEvent.click(chip('Bishopric for the new email'))
      await userEvent.selectOptions(screen.getByLabelText('Position for the new email'), 'bishop')
      await userEvent.click(chip('Bishopric for the new email'))
      await userEvent.click(chip('Ward leader for the new email'))
      await userEvent.selectOptions(screen.getByLabelText('Organization for the new email'), 'Primary')
      await userEvent.click(chip('Ward leader for the new email'))
      await userEvent.click(within(form()).getByRole('button', { name: 'Add' }))
      expect(addInvite).toHaveBeenCalledWith(supabase, 'x@ward.test', { initial_roles: [], initial_office: null, initial_organization: null })
    })

    it('keeps the form and explains a duplicate', async () => {
      vi.mocked(addInvite).mockRejectedValue(new Error('duplicate key value'))
      await open()
      await userEvent.type(screen.getByLabelText(/Email/), 'me@ward.test')
      await userEvent.click(within(form()).getByRole('button', { name: 'Add' }))
      expect(await screen.findByText('That email can already sign in.')).toBeInTheDocument()
      expect(screen.getByLabelText(/Email/)).toHaveValue('me@ward.test')
    })

    it('passes on any other error as it is', async () => {
      vi.mocked(addInvite).mockRejectedValue(new Error('offline'))
      await open()
      await userEvent.type(screen.getByLabelText(/Email/), 'y@ward.test')
      await userEvent.click(within(form()).getByRole('button', { name: 'Add' }))
      expect(await screen.findByText('offline')).toBeInTheDocument()
    })
  })

  describe('changing someone', () => {
    const who = 'quinn@ward.test'

    it('saves a role as soon as it changes', async () => {
      await open()
      await userEvent.click(chip(`Admin for ${who}`))
      expect(updateInvite).toHaveBeenCalledWith(supabase, who, { initial_roles: ['bishopric', 'leader', 'admin'], initial_office: 'ward_clerk', initial_organization: 'Scouts' })
    })

    it('clears the position with the role', async () => {
      await open()
      await userEvent.click(chip(`Bishopric for ${who}`))
      expect(updateInvite).toHaveBeenCalledWith(supabase, who, { initial_roles: ['leader'], initial_office: null, initial_organization: 'Scouts' })
    })

    it('saves no position when none is picked', async () => {
      await open()
      await userEvent.selectOptions(screen.getByLabelText(`Position for ${who}`), '')
      expect(updateInvite).toHaveBeenCalledWith(supabase, who, expect.objectContaining({ initial_office: null }))
    })

    it('saves no organization when none is picked', async () => {
      await open()
      await userEvent.selectOptions(screen.getByLabelText(`Organization for ${who}`), '')
      expect(updateInvite).toHaveBeenCalledWith(supabase, who, expect.objectContaining({ initial_organization: null }))
    })

    it('keeps offering an organization no longer on the list', async () => {
      await open()
      expect(within(screen.getByLabelText(`Organization for ${who}`)).getByRole('option', { name: 'Scouts' })).toBeInTheDocument()
    })

    it('removes them after asking', async () => {
      await open()
      await userEvent.click(screen.getByRole('button', { name: `Remove ${who}` }))
      expect(removeInvite).toHaveBeenCalledWith(supabase, who)
    })

    it('keeps them when the answer is no', async () => {
      vi.mocked(window.confirm).mockReturnValue(false)
      await open()
      await userEvent.click(screen.getByRole('button', { name: `Remove ${who}` }))
      expect(removeInvite).not.toHaveBeenCalled()
    })
  })

  describe('removed accounts', () => {
    it('lists accounts no longer on the list, with when they go', async () => {
      await open()
      expect(screen.getByText('Removed, account kept (2)')).toBeInTheDocument()
      expect(screen.getByText('Sister Gone')).toBeInTheDocument()
      expect(screen.getByText(/gone@ward\.test · removed .*, deleted after /)).toBeInTheDocument()
    })

    it('has no such section when everyone is on the list', async () => {
      vi.mocked(loadAccess).mockResolvedValue({ ...data, accounts: data.accounts.slice(0, 2) } as never)
      await open()
      expect(screen.queryByText(/Removed, account kept/)).not.toBeInTheDocument()
    })
  })

  describe('deleting an account', () => {
    const startDelete = async (email = 'gone@ward.test') => {
      await open()
      await userEvent.click(screen.getByRole('button', { name: `Delete account for ${email}` }))
      return screen.getByRole('dialog')
    }
    const confirm = (dialog: HTMLElement) => userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))

    it('says who, deletes, and closes', async () => {
      const dialog = await startDelete()
      expect(within(dialog).getByText(/This deletes Sister Gone/)).toBeInTheDocument()
      await confirm(dialog)
      expect(deleteAccount).toHaveBeenCalledWith(supabase, 'gone')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('uses the email for an account with no name', async () => {
      const dialog = await startDelete('gone2@ward.test')
      expect(within(dialog).getByText(/This deletes gone2@ward\.test/)).toBeInTheDocument()
    })

    it('stays open with the error when it fails', async () => {
      vi.mocked(deleteAccount).mockRejectedValue(new Error('refused'))
      const dialog = await startDelete()
      await confirm(dialog)
      expect(await within(dialog).findByText('refused')).toBeInTheDocument()
    })

    it('can be cancelled', async () => {
      const dialog = await startDelete()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(deleteAccount).not.toHaveBeenCalled()
    })
  })
})
