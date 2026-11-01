import { ThemeProvider } from '@mui/material/styles'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { theme } from '../theme'
import { ThemeToggle } from './ThemeToggle'

const renderToggle = () =>
  render(
    <ThemeProvider theme={theme} defaultMode="system">
      <ThemeToggle />
    </ThemeProvider>,
  )

describe('ThemeToggle', () => {
  it('starts by matching the device, then cycles light, dark, and back', async () => {
    const user = userEvent.setup()
    renderToggle()

    const button = await screen.findByRole('button', { name: 'Theme: match device' })
    await user.click(button)
    expect(screen.getByRole('button', { name: 'Theme: light' })).toBeInTheDocument()
    expect(document.documentElement).toHaveClass('light')

    await user.click(screen.getByRole('button', { name: 'Theme: light' }))
    expect(screen.getByRole('button', { name: 'Theme: dark' })).toBeInTheDocument()
    expect(document.documentElement).toHaveClass('dark')

    await user.click(screen.getByRole('button', { name: 'Theme: dark' }))
    expect(screen.getByRole('button', { name: 'Theme: match device' })).toBeInTheDocument()
  })

  it('remembers the choice across reloads', async () => {
    const user = userEvent.setup()
    const first = renderToggle()
    await user.click(await screen.findByRole('button', { name: 'Theme: match device' }))
    await user.click(screen.getByRole('button', { name: 'Theme: light' }))
    first.unmount()

    renderToggle()
    expect(await screen.findByRole('button', { name: 'Theme: dark' })).toBeInTheDocument()
  })
})
