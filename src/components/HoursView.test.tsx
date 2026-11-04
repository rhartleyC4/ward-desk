import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { profiles } from '../test/fixtures'
import { HoursView, type HoursActions, type HoursData } from './HoursView'

// 2026-11-08 is a Sunday.
const FROM = '2026-11-08'

function actions(): HoursActions {
  return { addUsual: vi.fn().mockResolvedValue(true), deleteUsual: vi.fn(), addDay: vi.fn().mockResolvedValue(true), dayOff: vi.fn(), resetDay: vi.fn() }
}

function data(): HoursData {
  return {
    hours: [
      { id: 'h1', user_id: 'b', weekday: 0, starts_at: '09:00:00', ends_at: '11:00:00' },
      { id: 'h2', user_id: 'b', weekday: 3, starts_at: '19:00:00', ends_at: '20:30:00' },
    ],
    changes: [{ id: 'x1', user_id: 'b', on_date: '2026-11-18', starts_at: null, ends_at: null }],
    absences: [{ id: 'a1', user_id: 'b', starts_on: '2026-11-15', ends_on: '2026-11-15', location: 'Denver', created_at: '' }],
    leaders: profiles,
  }
}

const view = (extra: Partial<Parameters<typeof HoursView>[0]> = {}) => {
  const a = actions()
  render(<HoursView data={data()} leaderId="b" onLeader={vi.fn()} from={FROM} firstTime={false} actions={a} busy={false} {...extra} />)
  return a
}

const dayRow = (name: RegExp) => screen.getByText(name).closest('div')!.parentElement!.parentElement as HTMLElement

describe('HoursView', () => {
  it('lists the usual hours by weekday', () => {
    view()
    const usual = screen.getByRole('heading', { name: 'Usual hours' }).closest('section')!
    expect(within(usual).getByText('9–11 AM').parentElement).toHaveTextContent('Sunday9–11 AM')
    expect(within(usual).getByText('7–8:30 PM').parentElement).toHaveTextContent('Wednesday7–8:30 PM')
  })

  it('shows each of the next two weeks with changed and away days marked', () => {
    view()
    expect(within(dayRow(/Sun, November 8th/)).getByText('9–11 AM')).toBeInTheDocument()
    expect(within(dayRow(/Sun, November 15th/)).getByText('Away (Denver)')).toBeInTheDocument()
    expect(within(dayRow(/Wed, November 18th/)).getAllByText('Not available').length).toBeGreaterThan(0)
    expect(screen.getByText(/Sat, November 21st/)).toBeInTheDocument()
    expect(screen.queryByText(/Sun, November 22nd/)).not.toBeInTheDocument()
  })

  it('adds usual hours and rejects ones that overlap', async () => {
    const a = view()
    const usual = screen.getByRole('heading', { name: 'Usual hours' }).closest('section')!
    await userEvent.selectOptions(within(usual).getByLabelText('Day'), 'Sunday')
    await userEvent.type(within(usual).getByLabelText('From'), '10:00')
    await userEvent.type(within(usual).getByLabelText('To'), '12:00')
    await userEvent.click(within(usual).getByRole('button', { name: 'Add' }))
    expect(screen.getByText(/overlaps hours already set/)).toBeInTheDocument()
    expect(a.addUsual).not.toHaveBeenCalled()

    await userEvent.selectOptions(within(usual).getByLabelText('Day'), 'Tuesday')
    await userEvent.click(within(usual).getByRole('button', { name: 'Add' }))
    expect(a.addUsual).toHaveBeenCalledWith(2, { starts_at: '10:00', ends_at: '12:00' })
  })

  it('takes a day out and puts it back', async () => {
    const a = view()
    await userEvent.click(within(dayRow(/Wed, November 11th/)).getByRole('button', { name: 'Not available' }))
    expect(a.dayOff).toHaveBeenCalledWith('2026-11-11')

    await userEvent.click(within(dayRow(/Wed, November 18th/)).getByRole('button', { name: 'Undo' }))
    expect(a.resetDay).toHaveBeenCalledWith('2026-11-18')
  })

  it('changes the hours on one date', async () => {
    const a = view()
    const row = dayRow(/Sun, November 8th/)
    await userEvent.click(within(row).getByRole('button', { name: 'Change' }))
    expect(within(row).getByText(/replace the usual hours for this day only/)).toBeInTheDocument()
    await userEvent.type(within(row).getByLabelText('From'), '12:00')
    await userEvent.type(within(row).getByLabelText('To'), '12:30')
    await userEvent.click(within(row).getByRole('button', { name: 'Add' }))
    expect(a.addDay).toHaveBeenCalledWith('2026-11-08', { starts_at: '12:00', ends_at: '12:30' })
  })

  it('welcomes a leader sent here on sign-in', () => {
    view({ firstTime: true, data: { ...data(), hours: [] } })
    expect(screen.getByText(/usually free for appointments/)).toBeInTheDocument()
    expect(screen.getByText(/No usual hours yet/)).toBeInTheDocument()
  })
})
