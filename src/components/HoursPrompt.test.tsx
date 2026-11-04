import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HoursPrompt } from './HoursPrompt'

let auth: { roles: string[]; office: string | null; hasHours: boolean }
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => auth }))

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <HoursPrompt />
    </MemoryRouter>,
  )

describe('HoursPrompt', () => {
  beforeEach(() => {
    auth = { roles: ['bishopric'], office: 'second_counselor', hasHours: false }
  })

  it('asks a counselor without hours on any page', () => {
    at('/sacrament')
    expect(screen.getByRole('link', { name: 'Set hours' })).toHaveAttribute('href', '/hours')
  })

  it('stays out of the way on the Hours page itself', () => {
    at('/hours')
    expect(screen.queryByText(/usually free/)).not.toBeInTheDocument()
  })

  it('goes away once hours are set', () => {
    auth.hasHours = true
    at('/sacrament')
    expect(screen.queryByText(/usually free/)).not.toBeInTheDocument()
  })

  it('never asks a secretary or clerk', () => {
    auth.office = 'executive_secretary'
    at('/sacrament')
    expect(screen.queryByText(/usually free/)).not.toBeInTheDocument()
  })
})
