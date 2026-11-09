import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ErrorNote, Loading, Muted, SectionCard } from '../components/Layout'
import type { AppRole } from '../lib/access'
import { accessPeople, findPeople } from '../lib/accessList'
import { addDays, longDate, todayIso } from '../lib/dates'
import { OFFICES } from '../lib/leadership'
import { addInvite, deleteAccount, loadAccess, removeInvite, updateInvite, updateInviteName, type Account, type Invite, type InviteAccess, type InviteName } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'
import { nativeSelect } from '../theme'

const ROLES: { role: AppRole; label: string; help: string }[] = [
  { role: 'bishopric', label: 'Bishopric', help: 'Plans meetings and sees callings' },
  { role: 'leader', label: 'Ward leader', help: 'Suggests names for callings' },
  { role: 'admin', label: 'Admin', help: 'Manages meetings and who can sign in' },
]

/** How long an account stays after its last role is taken away (purge_old_records in the database). */
const REMOVED_ACCOUNT_DAYS = 180

const NOBODY: InviteAccess = { initial_roles: [], initial_office: null, initial_organization: null }
const NO_NAME: InviteName = { first: '', last: '' }

/** A position only goes with the bishopric role, and an organization with the leader role. */
function toggleRole(access: InviteAccess, role: AppRole): InviteAccess {
  const roles = access.initial_roles
  const initial_roles = roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role]
  return {
    initial_roles,
    initial_office: initial_roles.includes('bishopric') ? access.initial_office : null,
    initial_organization: initial_roles.includes('leader') ? access.initial_organization : null,
  }
}

/** Role chips, plus the bishopric position once Bishopric is on. */
function AccessFields({ who, access, onChange, locked, organizations }: { who: string; access: InviteAccess; onChange: (access: InviteAccess) => void; locked?: AppRole; organizations: string[] }) {
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
      {access.initial_roles.includes('leader') && (
        <TextField
          select
          size="small"
          label="Organization"
          slotProps={{ ...nativeSelect, htmlInput: { 'aria-label': `Organization for ${who}` } }}
          sx={{ maxWidth: 260 }}
          value={access.initial_organization ?? ''}
          onChange={(e) => onChange({ ...access, initial_organization: e.target.value || null })}
        >
          <option value="">No organization</option>
          {[...new Set([...organizations, ...(access.initial_organization ? [access.initial_organization] : [])])].map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </TextField>
      )}
    </Stack>
  )
}

function NameFields({ who, name, onChange, onBlur }: { who: string; name: InviteName; onChange: (name: InviteName) => void; onBlur?: () => void }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5 }}>
      <TextField
        size="small"
        fullWidth
        label="First name"
        autoComplete="off"
        slotProps={{ htmlInput: { 'aria-label': `First name for ${who}`, maxLength: 60 } }}
        value={name.first}
        onChange={(e) => onChange({ ...name, first: e.target.value })}
        onBlur={onBlur}
      />
      <TextField
        size="small"
        fullWidth
        label="Last name"
        autoComplete="off"
        slotProps={{ htmlInput: { 'aria-label': `Last name for ${who}`, maxLength: 60 } }}
        value={name.last}
        onChange={(e) => onChange({ ...name, last: e.target.value })}
        onBlur={onBlur}
      />
    </Stack>
  )
}

/** The name of someone who hasn't signed in yet, saved when you leave a field. */
function WaitingName({ invite, onSave }: { invite: Invite; onSave: (name: InviteName) => void }) {
  const [name, setName] = useState<InviteName>({ first: invite.first_name ?? '', last: invite.last_name ?? '' })
  const save = () => {
    if (name.first.trim() !== (invite.first_name ?? '') || name.last.trim() !== (invite.last_name ?? '')) onSave(name)
  }
  return <NameFields who={invite.email} name={name} onChange={setName} onBlur={save} />
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

const friendly = (message: string) => {
  if (/duplicate key/i.test(message)) return 'That email can already sign in.'
  if (/allowlist_name_length/i.test(message)) return 'First and last name together need to fit in 60 characters.'
  return message
}

/** Admins decide which emails may sign in, and each person's roles and bishopric position. */
export function AccessPage() {
  const { profile } = useAuth()
  const { data, error, reload } = useAsync(() => loadAccess(supabase), [])
  const save = useAction()
  const [email, setEmail] = useState('')
  const [access, setAccess] = useState<InviteAccess>(NOBODY)
  const [name, setName] = useState<InviteName>(NO_NAME)
  const [deleting, setDeleting] = useState<Account | null>(null)
  const [find, setFind] = useState('')
  const [openEmail, setOpenEmail] = useState<string | null>(null)

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
    if (await run(() => addInvite(supabase, email, access, name))) {
      setEmail('')
      setAccess(NOBODY)
      setName(NO_NAME)
    }
  }

  const isMe = (inviteEmail: string) => inviteEmail.toLowerCase() === profile?.email.toLowerCase()
  const linked = new Set(data.invites.map((i) => i.profile_id))
  const removed = data.accounts.filter((a) => !linked.has(a.id))
  const people = findPeople(accessPeople(data.invites, data.accounts, data.notSignedIn), find)

  const confirmDelete = async (id: string) => {
    if (await run(() => deleteAccount(supabase, id))) setDeleting(null)
  }
  const deleteButton = (account: Account) => (
    <Button size="small" color="error" aria-label={`Delete account for ${account.email}`} disabled={save.busy} onClick={() => setDeleting(account)}>
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
          <NameFields who="the new email" name={name} onChange={setName} />
          <AccessFields who="the new email" access={access} onChange={setAccess} organizations={data.organizations} />
          <Box>
            <Button type="submit" variant="contained" disabled={save.busy}>
              Add
            </Button>
          </Box>
        </Stack>
      </SectionCard>

      <SectionCard title={`Who can sign in (${data.invites.length})`}>
        <TextField label="Find someone" type="search" size="small" fullWidth autoComplete="off" sx={{ mb: 1 }} value={find} onChange={(e) => setFind(e.target.value)} />
        {people.length === 0 && <Muted>Nobody matches that.</Muted>}
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
          {people.map(({ invite, account, signedIn, name, summary }) => {
            const me = isMe(invite.email)
            const open = openEmail === invite.email
            const panelId = `access-${invite.email}`
            return (
              <Box key={invite.email}>
                <ButtonBase
                  aria-expanded={open}
                  aria-controls={open ? panelId : undefined}
                  onClick={() => setOpenEmail(open ? null : invite.email)}
                  sx={{ display: 'flex', width: 'calc(100% + 16px)', mx: -1, px: 1, minHeight: 56, py: 0.75, gap: 1, justifyContent: 'space-between', textAlign: 'left', borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <Box component="span" sx={{ minWidth: 0 }}>
                    <Typography component="span" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                      {name}
                      {me ? ' (you)' : ''}
                    </Typography>
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                      {summary}
                      {!signedIn && " · Hasn't signed in yet"}
                    </Typography>
                  </Box>
                  <ExpandMoreIcon fontSize="small" color="action" sx={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
                </ButtonBase>
                <Collapse in={open} unmountOnExit>
                  <Stack id={panelId} spacing={1.5} sx={{ pt: 1, pb: 2 }}>
                    {name !== invite.email && (
                      <Box sx={{ overflowWrap: 'anywhere' }}>
                        <Muted>{invite.email}</Muted>
                      </Box>
                    )}
                    {!account && <WaitingName invite={invite} onSave={(next) => void run(() => updateInviteName(supabase, invite.email, next))} />}
                    <AccessFields
                      who={invite.email}
                      access={{ initial_roles: invite.initial_roles, initial_office: invite.initial_office, initial_organization: invite.initial_organization }}
                      organizations={data.organizations}
                      locked={me ? 'admin' : undefined}
                      onChange={(next) => run(() => updateInvite(supabase, invite.email, next))}
                    />
                    <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', ml: -0.5 }}>
                      <Tooltip title={me ? "You can't remove yourself" : ''}>
                        <span>
                          <Button
                            size="small"
                            color="error"
                            aria-label={`Remove access for ${invite.email}`}
                            disabled={me || save.busy}
                            onClick={() => {
                              if (window.confirm(`Remove ${invite.email}? They won't be able to use the app until they're added again. Their account is deleted after 180 days unless they're added back.`))
                                run(() => removeInvite(supabase, invite.email))
                            }}
                          >
                            Remove access
                          </Button>
                        </span>
                      </Tooltip>
                      {account && !me && deleteButton(account)}
                    </Stack>
                  </Stack>
                </Collapse>
              </Box>
            )
          })}
        </Stack>
      </SectionCard>

      {removed.length > 0 && (
        <SectionCard title={`Removed, account kept (${removed.length})`}>
          <Box sx={{ mb: 1.5 }}>
            <Muted>These people can't use the app anymore. Their account and personal records are deleted automatically 180 days after they were removed, unless they're added back. Delete one now if it's no longer needed.</Muted>
          </Box>
          <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />} spacing={1.5}>
            {removed.map((account) => (
              <Box key={account.id}>
                <Typography sx={{ overflowWrap: 'anywhere' }}>{account.display_name || account.email}</Typography>
                <Muted>
                  {account.email}
                  {account.removed_at && ` · removed ${longDate(todayIso(new Date(account.removed_at)))}, deleted after ${longDate(addDays(todayIso(new Date(account.removed_at)), REMOVED_ACCOUNT_DAYS))}`}
                </Muted>
                <Box sx={{ mt: 1, ml: -0.5 }}>{deleteButton(account)}</Box>
              </Box>
            ))}
          </Stack>
        </SectionCard>
      )}

      <DeleteAccountDialog account={deleting} busy={save.busy} error={save.error} onCancel={() => setDeleting(null)} onDelete={(id) => void confirmDelete(id)} />
    </>
  )
}
