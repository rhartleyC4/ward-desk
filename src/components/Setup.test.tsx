import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { SetupStep } from '../lib/setup'
import { SetupChecklist } from './Setup'

const step = (id: SetupStep['id'], done: boolean): SetupStep => ({ id, label: `Do ${id}`, hint: `Why ${id}`, to: `/${id}`, done })

describe('SetupChecklist', () => {
  it('counts what is done and links the steps still to do', () => {
    render(
      <MemoryRouter>
        <SetupChecklist steps={[step('passkey', true), step('hours', false), step('notifications', false)]} />
      </MemoryRouter>,
    )
    const list = screen.getByRole('region', { name: 'Finish setting up' })
    expect(within(list).getByText('Finish setting up · 1 of 3')).toBeInTheDocument()
    expect(within(list).queryByRole('link', { name: /Do passkey/ })).not.toBeInTheDocument()
    expect(within(list).getByRole('link', { name: /Do hours/ })).toHaveAttribute('href', '/hours')
    expect(within(list).getByRole('link', { name: /Do hours/ })).toHaveTextContent('Next')
    expect(within(list).getByRole('link', { name: /Do notifications/ })).not.toHaveTextContent('Next')
  })

  it('goes away once everything is done', () => {
    const { container } = render(<SetupChecklist steps={[step('hours', true)]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
