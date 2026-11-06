import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { Link } from 'react-router'
import { personLabel } from '../lib/agenda'
import type { ShortSunday } from '../lib/coverage'
import { longDate } from '../lib/dates'
import type { Profile } from '../lib/queries'

/** "Bishop Hale", "Brother Ames and Brother Ruiz". */
const names = (ids: string[], people: Profile[]) => {
  const labels = ids.map((id) => personLabel(id, people) || 'someone')
  return labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}` : labels[0] ?? ''
}

function sundayLine(s: ShortSunday, leaderIds: string[], people: Profile[]): string {
  const day = `Sunday, ${longDate(s.date)}`
  if (s.level === 'none') return `${day}: no one in the bishopric will be there.`
  const here = leaderIds.filter((id) => !s.awayIds.includes(id))
  return `${day}: only ${names(here, people)} will be there.`
}

type Props = {
  sundays: ShortSunday[]
  leaderIds: string[]
  people: Profile[]
  /** Above the Sundays, e.g. "If you add these dates". */
  intro?: string
  /** Shows a button to the Away page. */
  linkToAway?: boolean
}

/**
 * Sundays the bishopric is short-handed: an error when no one will be there, a milder warning
 * when only one will. Renders nothing when every Sunday is covered.
 */
export function ShortSundaysNote({ sundays, leaderIds, people, intro, linkToAway }: Props) {
  const none = sundays.filter((s) => s.level === 'none')
  const one = sundays.filter((s) => s.level === 'one')
  const link = linkToAway && (
    <Button component={Link} to="/away" size="small" color="inherit">
      See away dates
    </Button>
  )
  return (
    <>
      {none.length > 0 && (
        <Alert severity="error" sx={{ mb: 1.5 }} action={link}>
          <AlertTitle>{intro ?? 'The whole bishopric is away'}</AlertTitle>
          {none.map((s) => (
            <Box key={s.date}>{sundayLine(s, leaderIds, people)}</Box>
          ))}
          Someone needs to change plans or arrange for another priesthood leader to preside.
        </Alert>
      )}
      {one.length > 0 && (
        <Alert severity="warning" sx={{ mb: 1.5 }} action={none.length ? undefined : link}>
          <AlertTitle>{none.length ? 'Also short-handed' : (intro ?? 'Only one of the bishopric there')}</AlertTitle>
          {one.map((s) => (
            <Box key={s.date}>{sundayLine(s, leaderIds, people)}</Box>
          ))}
        </Alert>
      )}
    </>
  )
}
