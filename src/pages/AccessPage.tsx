import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ErrorNote, Loading, Muted, SectionCard } from '../components/Layout'
import type { AppRole } from '../lib/access'
import type { Enums } from '../lib/database.types'
import { longDate, todayIso } from '../lib/dates'
import { addInvite, deleteAccount, loadAccess, removeInvite, updateInvite, type Account, type InviteAccess } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'
import { nativeSelect } from '../theme'

const ROLES: { role: AppRole; label: string; help: string }[] = [
  { role: 'bishopric', label: 'Bishopric', help: 'Plans meetings and sees callings' },
  { role: 'leader', label: 'Ward leader', help: 'Suggests names for callings' },
  { role: 'admin', label: 'Admin', help: 'Manages meetings and who can sign in' },
]

const OFFICES: { office: Enums<'bishopric_office'>; label: string }[] = [
  { office: 'bishop', label: 'Bishop' },
  { office: 'first_counselor', label: 'First Counselor' },
  { office: 'second_counselor', label: 'Second Counselor' },
  { office: 'executive_secretary', label: 'Executive Secretary' },
  { office: 'assistant_executive_secretary', label: 'Assistant Executive Secretary' },
  { office: 'ward_clerk', label: 'Ward Clerk' },
]

const NOBODY: InviteAccess = { initial_roles: [], initial_office: null }

/** A position only goes with the bishopric role, so turning that off clears it. */
function toggleRole(access: InviteAccess, role: AppRole): InviteAccess {
  const roles = access.initial_roles
  const initial_roles = roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role]
  return { initial_roles, initial_office: initial_roles.includes('bishopric') ? access.initial_office : null }
}

/** Role chips, plus the bishopric position once Bishopric is on. */
function AccessFields({ who, access, onChange, locked }: { who: string; access: InviteAccess; onChange: (access: InviteAccess) => void; locked?: AppRole }) {
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        {ROLES.map(({ role, label, help }) => {
          const on = access.initial_roles.includes(role)
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
                  onClick={() => onChange(toggleRole(access, role))}
                />
              </span>
            </Tooltip>
          )
        })}
      </Stack>
      {access.initial_roles.includes('bishopric') && (
        <TextField
          select
          size="small"
          label="Position"
          slotProps={{ ...nativeSelect, htmlInput: { 'aria-label': `Position for ${who}` } }}
          sx={{ maxWidth: 260 }}
          value={access.initial_office ?? ''}
          onChange={(e) => onChange({ ...access, initial_office: (e.target.value || null) as InviteAccess['initial_office'] })}
        >
          <option value="">No position</option>
          {OFFICES.map(({ office, label }) => (
            <option key={office} value={office}>
              {label}
            </option>
          ))}
        </TextField>
      )}
    </Stack>
  )
}

/** Asks before deleting an account, saying what goes and what stays. */
function DeleteAccountDialog({ account, busy, error, onCancel, onDelete }: { account: Account | null; busy: boolean; error: string | null; onCancel: () => void; onDelete: (id: string) => void }) {
  const name = account?.display_name || account?.email
  return (
    <Dialog open={!!account} onClose={onCancel} aria-labelledby="delete-account-title">
      <DialogTitle id="delete-account-title">Delete account?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1.5 }}>
          This deletes {name}&rsquo;s sign-in, profile, away dates, appointment hours and notification settings, and takes {account?.email} off the list.
        </DialogContentText>
        <DialogContentText>
          Requests and calling requests they were part of stay, showing &ldquo;Former member&rdquo;. This can't be undone.
        </DialogContentText>
        <ErrorNote error={error} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button color="error" variant="contained" disabled={busy} onClick={() => account && onDelete(account.id)}>
          Delete account
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const friendly = (message: string) => (/duplicate key/i.test(message) ? 'That email can already sign in.' : message)

/** Admins decide which emails may sign in, and each person's roles and bishopric position. */
export function AccessPage() {
  const { profile } = useAuth()
  const { data, error, reload } = useAsync(() => loadAccess(supabase), [])
  const save = useAction()
  const [email, setEmail] = useState('')
  const [access, setAccess] = useState<InviteAccess>(NOBODY)
  const [deleting, setDeleting] = useState<Account | null>(null)

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
    if (await run(() => addInvite(supabase, email, access))) {
      setEmail('')
      setAccess(NOBODY)
    }
  }

  const isMe = (inviteEmail: string) => inviteEmail.toLowerCase() === profile?.email.toLowerCase()
  const accountOf = (id: string | null) => data.accounts.find((a) => a.id === id)
  const linked = new Set(data.invites.map((i) => i.profile_id))
  const removed = data.accounts.filter((a) => !linked.has(a.id))

  const confirmDelete = async (id: string) => {
    if (await run(() => deleteAccount(supabase, id))) setDeleting(null)
  }
  const deleteButton = (account: Account) => (
    <Button size="small" color="error" sx={{ mt: 1, ml: -0.5 }} aria-label={`Delete account for ${account.email}`} disabled={save.busy} onClick={() => setDeleting(account)}>
      Delete account
    </Button>
  )

  return (
    <>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Access
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Muted>
          Only these emails can sign in, with Google or an email link. Changes apply right away, even for people who have already signed in. The bishop and
          counselors appear in the Conducting and Interviewer pickers.
        </Muted>
      </Box>
      <ErrorNote error={save.error} />

      <SectionCard title="Add someone">
        <Stack component="form" spacing={1.5} onSubmit={submit}>
          <TextField label="Email" type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          <AccessFields who="the new email" access={access} onChange={setAccess} />
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
            const account = accountOf(invite.profile_id)
            const name = account?.display_name
            const me = isMe(invite.email)
            return (
              <Stack key={invite.email} direction="row" sx={{ alignItems: 'flex-start', gap: 1 }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography sx={{ overflowWrap: 'anywhere' }}>{invite.email}</Typography>
                  <Muted>{account ? `${name || 'Signed in'}${me ? ' (you)' : ''}` : "Hasn't signed in yet"}</Muted>
                  <Box sx={{ mt: 1 }}>
                    <AccessFields
                      who={invite.email}
                      access={{ initial_roles: invite.initial_roles, initial_office: invite.initial_office }}
                      locked={me ? 'admin' : undefined}
                      onChange={(next) => run(() => updateInvite(supabase, invite.email, next))}
                    />
                  </Box>
                  {account && !me && deleteButton(account)}
                </Box>
                <Tooltip title={me ? "You can't remove yourself" : 'Remove'}>
                  <span>
                    <IconButton
                      size="small"
                      aria-label={`Remove ${invite.email}`}
                      disabled={me || save.busy}
                      onClick={() => {
                        if (window.confirm(`Remove ${invite.email}? They won't be able to use the app until they're added again. Their account stays until you delete it.`))
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

      {removed.length > 0 && (
        <SectionCard title={`Removed, account kept (${removed.length})`}>
          <Box sx={{ mb: 1.5 }}>
            <Muted>These people can't use the app anymore, but their account and personal records are still here. Delete an account when it's no longer needed.</Muted>
          </Box>
          <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />} spacing={1.5}>
            {removed.map((account) => (
              <Box key={account.id}>
                <Typography sx={{ overflowWrap: 'anywhere' }}>{account.display_name || account.email}</Typography>
                <Muted>
                  {account.email}
                  {account.removed_at && ` · removed ${longDate(todayIso(new Date(account.removed_at)))}`}
                </Muted>
                <Box>{deleteButton(account)}</Box>
              </Box>
            ))}
          </Stack>
        </SectionCard>
      )}

      <DeleteAccountDialog account={deleting} busy={save.busy} error={save.error} onCancel={() => setDeleting(null)} onDelete={(id) => void confirmDelete(id)} />
    </>
  )
}
