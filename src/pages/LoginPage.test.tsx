import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

vi.mock('../lib/supabase', () => ({ supabase: { auth: {} } }))

describe('LoginPage practice accounts', () => {
  // Tests run in dev mode, where the practice-account picker shows.
  it('shows each account’s name with its role', async () => {
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('combobox', { name: /email/i }))
    expect(screen.getByRole('option', { name: /leader@ward\.test/ })).toHaveTextContent('Sister Reyes · Other called leader')
  })

  it('finds an account by the person’s name', async () => {
    render(<LoginPage />)
    await userEvent.type(screen.getByRole('combobox', { name: /email/i }), 'Reyes')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['leader@ward.testSister Reyes · Other called leader'])
  })
})
