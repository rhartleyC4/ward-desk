import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { CallingField } from './CallingField'

function Harness() {
  const [value, setValue] = useState('')
  return (
    <>
      <CallingField value={value} onChange={setValue} />
      <output>{value}</output>
    </>
  )
}

describe('CallingField', () => {
  it('suggests common callings as you type', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Calling'), 'primary pre')
    expect(screen.getByText('Primary')).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Primary President' }))
    expect(screen.getByRole('status')).toHaveTextContent('Primary President')
  })

  it('keeps a title that is not in the list', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Calling'), 'Stake Bike Captain')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    await user.tab()
    expect(screen.getByRole('status')).toHaveTextContent('Stake Bike Captain')
  })
})
