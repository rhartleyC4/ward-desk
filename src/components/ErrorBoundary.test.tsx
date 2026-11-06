import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as errorReport from '../lib/errorReport'
import { ErrorBoundary } from './ErrorBoundary'

function Broken(): never {
  throw new Error('page broke')
}

describe('ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the page when nothing goes wrong', () => {
    render(<ErrorBoundary>Agenda</ErrorBoundary>)
    expect(screen.getByText('Agenda')).toBeInTheDocument()
  })

  it('shows a reload button and reports the error when the page crashes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const report = vi.spyOn(errorReport, 'reportError').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(report).toHaveBeenCalledWith('render', expect.objectContaining({ message: 'page broke' }), expect.any(String))
  })
})
