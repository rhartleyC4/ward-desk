import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { meeting, profiles, programItem } from '../test/fixtures'
import { MeetingSummary } from './MeetingSummary'

describe('MeetingSummary', () => {
  it('shows an unplanned Sunday', () => {
    render(<MeetingSummary date="2026-11-22" meeting={undefined} items={[]} profiles={profiles} absences={[]} />)
    expect(screen.getByText('November 22nd')).toBeInTheDocument()
    expect(screen.getByText('Not planned yet.')).toBeInTheDocument()
  })

  it('lists the program in order with hymns and statuses', () => {
    const m = meeting('2026-11-15')
    const items = [
      programItem(m.id, 3, { person_name: 'Sister Fry', status: 'invited' }),
      programItem(m.id, 1, { person_name: 'Brother Ellis' }),
      programItem(m.id, 2, { kind: 'intermediate_hymn', person_name: null, hymn_number: 98 }),
    ]
    render(<MeetingSummary date={m.meeting_date} meeting={m} items={items} profiles={profiles} absences={[]} />)

    const lines = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(lines).toEqual(['Brother Ellis', 'Intermediate hymn  #98', 'Sister Fryinvited'])
    expect(screen.getByText(/#85 \/ #173 \/ #301/)).toBeInTheDocument()
  })

  it('warns when whoever is conducting is away that Sunday', () => {
    const m = meeting('2026-11-22', { conducting_id: 'o' })
    render(
      <MeetingSummary
        date={m.meeting_date}
        meeting={m}
        items={[]}
        profiles={profiles}
        absences={[{ id: 'a', user_id: 'o', starts_on: '2026-11-20', ends_on: '2026-11-23', location: 'Denver', created_at: '' }]}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Ortiz is away (Denver) this Sunday.')
  })

  it('shows only the label for a conference Sunday', () => {
    const m = meeting('2027-03-07', { meeting_type: 'stake_conference' })
    render(<MeetingSummary date={m.meeting_date} meeting={m} items={[]} profiles={profiles} absences={[]} />)
    expect(screen.getByText('Stake Conference')).toBeInTheDocument()
    expect(screen.queryByText(/Presiding/)).not.toBeInTheDocument()
  })
})
