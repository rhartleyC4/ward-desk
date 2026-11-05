import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link } from 'react-router'
import { Muted, SectionCard } from './Layout'

type Leader = { id: string; display_name: string | null }
type Area = { id: string; user_id: string; area: string }

/**
 * Which organizations each leader looks after, from the bishopric assignments: a reference for
 * when someone asks for "whoever has the youth". Folded away, since it rarely changes.
 */
export function WhoCovers({ leaders, stewardships }: { leaders: Leader[]; stewardships: Area[] }) {
  const [open, setOpen] = useState(false)
  if (!stewardships.length) return null
  return (
    <SectionCard
      title="Who covers what"
      action={
        <Button size="small" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="who-covers">
          {open ? 'Hide' : 'Show'}
        </Button>
      }
    >
      <Collapse in={open} id="who-covers">
        {leaders.map((l) => {
          const areas = stewardships.filter((s) => s.user_id === l.id).sort((a, b) => a.area.localeCompare(b.area))
          return (
            <Box key={l.id} sx={{ py: 0.75 }}>
              <Typography sx={{ fontWeight: 600, mb: 0.5 }}>{l.display_name}</Typography>
              <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                {areas.length ? areas.map((a) => <Chip key={a.id} size="small" label={a.area} />) : <Muted>No areas yet</Muted>}
              </Stack>
            </Box>
          )
        })}
        <Button component={Link} to="/schedule" state={{ back: { to: '/home', label: 'Home' } }} size="small" sx={{ mt: 1 }}>
          Change in the standing schedule
        </Button>
      </Collapse>
      {!open && <Muted>Each leader's organizations, for when someone asks who to see.</Muted>}
    </SectionCard>
  )
}
