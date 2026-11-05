import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { longDate, weekday, type IsoDate } from '../lib/dates'
import { WEEKDAYS } from '../lib/availability'
import { myRotationsThisMonth, type Rotation } from '../lib/schedule'
import { Muted, SectionCard } from './Layout'

/** This person's rotations due this month (their Primary message, PPIs to hold), with the day when one is set. */
export function ThisMonth({ userId, today, rotations }: { userId: string; today: IsoDate; rotations: Rotation[] }) {
  const due = myRotationsThisMonth(userId, today, rotations)
  if (!due.length) return null
  return (
    <SectionCard title="This month">
      {due.map(({ rotation, date }, i) => (
        <Box key={i} sx={{ py: 0.75, opacity: date && date < today ? 0.6 : 1 }}>
          <Typography sx={{ fontWeight: 600 }}>{rotation.title}</Typography>
          <Muted>{date ? `${WEEKDAYS[weekday(date)]}, ${longDate(date)}${date < today ? ' (done)' : date === today ? ' (today)' : ''}` : 'Any time this month'}</Muted>
        </Box>
      ))}
    </SectionCard>
  )
}
