import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import type { Pick } from '../lib/leadership'
import { officeLabel, validEmail } from '../lib/leadership'
import type { LeadershipPerson } from '../lib/queries'
import { nativeSelect } from '../theme'

const valueOf = (p: Pick) => (p.kind === 'person' ? p.id : p.kind)

/**
 * Who takes a position: whoever has it now, anyone with an account (bishopric first, then ward
 * leaders, then everyone else), someone new by email, or nobody.
 */
export function PersonPick({ label, people, value, onChange, current, allowEmpty = true, exclude = [] }: {
  label: string
  people: LeadershipPerson[]
  value: Pick
  onChange: (p: Pick) => void
  /** Whoever holds it now, offered first as "Keep …". */
  current?: LeadershipPerson | null
  allowEmpty?: boolean
  /** People who can't take it (already picked elsewhere). */
  exclude?: string[]
}) {
  const others = people.filter((p) => p.id !== current?.id && !exclude.includes(p.id))
  const groups = [
    { label: 'In the bishopric', list: others.filter((p) => p.office) },
    { label: 'Ward leaders', list: others.filter((p) => !p.office && p.organization) },
    { label: 'Everyone else', list: others.filter((p) => !p.office && !p.organization) },
  ].filter((g) => g.list.length)
  const describe = (p: LeadershipPerson) => `${p.display_name ?? p.email}${p.office ? ` (${officeLabel(p.office)})` : p.organization ? ` (${p.organization})` : ''}`

  const pick = (v: string) => onChange(v === 'new' ? { kind: 'new', email: '' } : v === 'empty' ? { kind: 'empty' } : { kind: 'person', id: v })

  return (
    <Box>
      <TextField select fullWidth label={label} value={valueOf(value)} onChange={(e) => pick(e.target.value)} slotProps={nativeSelect}>
        {current && <option value={current.id}>Keep {current.display_name ?? current.email}</option>}
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.list.map((p) => (
              <option key={p.id} value={p.id}>
                {describe(p)}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="new">Someone new, not in Ward Desk yet</option>
        {allowEmpty && <option value="empty">Leave it empty for now</option>}
      </TextField>
      {value.kind === 'new' && (
        <TextField
          fullWidth
          type="email"
          label="Their email"
          sx={{ mt: 1.5 }}
          value={value.email}
          onChange={(e) => onChange({ kind: 'new', email: e.target.value })}
          error={!!value.email && !validEmail(value.email)}
          helperText="The one they'll sign in with. Their work waits for them until they first sign in."
          autoComplete="off"
        />
      )}
    </Box>
  )
}
