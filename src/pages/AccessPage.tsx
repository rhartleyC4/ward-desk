import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ErrorNote, Loading, Muted, SectionCard } from '../components/Layout'
import type { AppRole } from '../lib/access'
import { addInvite, loadAccess, removeInvite, setInviteRoles } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'

const ROLES: { role: AppRole; label: string; help: string }[] = [
  { role: 'bishopric', label: 'Bishopric', help: 'Plans meetings and sees callings' },
  { role: 'leader', label: 'Ward leader', help: 'Suggests names for callings' },
  { role: 'admin', label: 'Admin', help: 'Manages meetings and who can sign in' },
]

const toggle = (roles: AppRole[], role: AppRole) => (roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role])

function RoleChips({ who, roles, onToggle, locked }: { who: string; roles: AppRole[]; onToggle: (role: AppRole) => void; locked?: AppRole }) {
  return (
    <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
      {ROLES.map(({ role, label, help }) => {
        const on = roles.includes(role)
        return (
          <Tooltip key={role} describeChild title={role === locked ? "You can't remove your own admin access" : help}>
            <span>
              <Chip
                label={label}
                aria-label={`${label} for ${who}`}
                size="small"
                color={on ? 'primary' : 'default'}
                variant={on ? 'filled' : 'outlined'}
                aria-pressed={on}
                disabled={role === locked}
                onClick={() => onToggle(role)}
              />
            </span>
          </Tooltip>
        )
      })}
    </Stack>
  )
}

const friendly = (message: string) => (/duplicate key/i.test(message) ? 'That email can already sign in.' : message)

/** Admins decide which emails may sign in, and which roles each person has. */
export function AccessPage() {
  const { profile } = useAuth()
  const { data, error, reload } = useAsync(() => loadAccess(supabase), [])
  const save = useAction()
  const [email, setEmail] = useState('')
  const [roles, setRoles] = useState<AppRole[]>([])

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  const run = (fn: () => Promise<void>) =>
    save.act(async () => {
      try {
        await fn()
      } catch (e) {
        throw new Error(friendly((e as Error).message))
      }
    }).then((ok) => {
      reload()
      return ok
    })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (await run(() => addInvite(supabase, email, roles))) {
      setEmail('')
      setRoles([])
    }
  }

  const isMe = (inviteEmail: string) => inviteEmail.toLowerCase() === profile?.email.toLowerCase()
  const nameFor = (inviteEmail: string) => data.profiles.find((p) => p.email.toLowerCase() === inviteEmail.toLowerCase())?.display_name

  return (
    <>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Access
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Muted>Only these emails can sign in, with Google or an email link. Role changes apply right away, even for people who have already signed in.</Muted>
      </Box>
      <ErrorNote error={save.error} />

      <SectionCard title="Add someone">
        <Stack component="form" spacing={1.5} onSubmit={submit}>
          <TextField label="Email" type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          <RoleChips who="the new email" roles={roles} onToggle={(role) => setRoles(toggle(roles, role))} />
          <Box>
            <Button type="submit" variant="contained" disabled={save.busy}>
              Add
            </Button>
          </Box>
        </Stack>
      </SectionCard>

      <SectionCard title={`Who can sign in (${data.invites.length})`}>
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />} spacing={1.5}>
          {data.invites.map((invite) => {
            const name = nameFor(invite.email)
            const me = isMe(invite.email)
            return (
              <Stack key={invite.email} direction="row" sx={{ alignItems: 'flex-start', gap: 1 }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography sx={{ overflowWrap: 'anywhere' }}>{invite.email}</Typography>
                  <Muted>{name ? `${name}${me ? ' (you)' : ''}` : "Hasn't signed in yet"}</Muted>
                  <Box sx={{ mt: 1 }}>
                    <RoleChips
                      who={invite.email}
                      roles={invite.initial_roles}
                      locked={me ? 'admin' : undefined}
                      onToggle={(role) => run(() => setInviteRoles(supabase, invite.email, toggle(invite.initial_roles, role)))}
                    />
                  </Box>
                </Box>
                <Tooltip title={me ? "You can't remove yourself" : 'Remove'}>
                  <span>
                    <IconButton
                      size="small"
                      aria-label={`Remove ${invite.email}`}
                      disabled={me || save.busy}
                      onClick={() => {
                        if (window.confirm(`Remove ${invite.email}? They won't be able to use the app until they're added again.`))
                          run(() => removeInvite(supabase, invite.email))
                      }}
                    >
                      <DeleteOutlinedIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            )
          })}
        </Stack>
      </SectionCard>
    </>
  )
}
