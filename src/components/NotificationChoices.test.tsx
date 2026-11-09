import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { notificationsFor } from '../lib/notifications'
import { NotificationChoices } from './NotificationChoices'

const groups = notificationsFor(['bishopric'], 'bishop')
const [first, second] = groups.flatMap((g) => g.items)

const show = (load: () => Promise<never[] | string[]>, set = vi.fn(async () => {})) => {
  const actions = { load, set }
  return { ...render(<NotificationChoices roles={['bishopric']} office="bishop" actions={actions as never} />), set }
}

describe('NotificationChoices', () => {
  it('shows nothing for someone who gets no notifications', () => {
    const { container } = render(<NotificationChoices roles={[]} office={null} actions={{ load: async () => [], set: async () => {} }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says it is loading, then has a switch per kind, on unless turned off', async () => {
    show(async () => [first.kind])
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(await screen.findByRole('switch', { name: first.label })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: second.label })).toBeChecked()
  })

  it('notes that the choices apply on every device, once', async () => {
    show(async () => [])
    expect(await screen.findAllByText(/These apply on every device/)).toHaveLength(1)
  })

  it('shows why when the choices can\'t load', async () => {
    show(async () => {
      throw new Error('load failed')
    })
    expect(await screen.findByText('load failed')).toBeInTheDocument()
  })

  it('turns a kind off and on', async () => {
    const { set } = show(async () => [])
    const toggle = await screen.findByRole('switch', { name: first.label })
    await userEvent.click(toggle)
    expect(set).toHaveBeenLastCalledWith(first.kind, false)
    await waitFor(() => expect(toggle).toBeEnabled())
    expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)
    expect(set).toHaveBeenLastCalledWith(first.kind, true)
    await waitFor(() => expect(toggle).toBeChecked())
  })

  it('puts it back and says why when saving fails', async () => {
    const set = vi.fn(async () => {
      throw new Error('refused')
    })
    show(async () => [], set as never)
    const toggle = await screen.findByRole('switch', { name: first.label })
    await userEvent.click(toggle)
    expect(await screen.findByText('refused')).toBeInTheDocument()
    expect(toggle).toBeChecked()
  })
})
