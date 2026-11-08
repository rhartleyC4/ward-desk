import FingerprintIcon from '@mui/icons-material/Fingerprint'
import Alert from '@mui/material/Alert'
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Divider from '@mui/material/Divider'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { ErrorNote } from '../components/Layout'
import { ThemeToggle } from '../components/ThemeToggle'
import { friendlyAuthError } from '../lib/authErrors'
import { isTrainingSite } from '../lib/env'
import { PasskeyCancelled, passkeysSupported, rememberPasskeyChoice } from '../lib/passkeys'
import { PRACTICE_ACCOUNTS, practicePassword, signInAsPractice } from '../lib/practiceAccounts'
import { signInWithPasskey } from '../lib/queries'
import { supabase } from '../lib/supabase'

/** "Sister Reyes · Other called leader", shown under a practice account's email. */
function practiceDetail(email: string) {
  const account = PRACTICE_ACCOUNTS.find((a) => a.email === email)
  return account ? `${account.name} · ${account.role}` : ''
}

const findAccount = createFilterOptions<string>({ stringify: (email) => `${email} ${practiceDetail(email)}` })

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [noPasskey, setNoPasskey] = useState(false)
  const [ownEmail, setOwnEmail] = useState(false)

  const sendLink = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setError(friendlyAuthError(error.message))
    else setSent(true)
  }

  const passwordSignIn = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(friendlyAuthError(error.message))
  }

  const practiceSignIn = async (account: string) => {
    setBusy(true)
    setError(null)
    const problem = await signInAsPractice(account)
    setBusy(false)
    if (problem) setError(problem)
  }

  const passkeySignIn = async () => {
    setBusy(true)
    setError(null)
    setNoPasskey(false)
    try {
      const userId = await signInWithPasskey(supabase)
      // This device has a passkey, so don't offer to set one up after signing in.
      rememberPasskeyChoice(userId, 'ready')
    } catch (e) {
      // Closing the prompt and having no passkey look the same to the browser.
      if (e instanceof PasskeyCancelled) setNoPasskey(true)
      else setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // The seeded @ward.test accounts can't receive email, so they sign in with the seed password:
  // locally to skip Mailpit, and on the training site so trainees can try each role.
  const practice = isTrainingSite()
  const withPassword = import.meta.env.DEV || practice
  const oneTap = !!practicePassword()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void (withPassword ? passwordSignIn() : sendLink())
  }

  const google = () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', px: 2, py: '10vh' }}>
      <Card sx={{ maxWidth: 400, mx: 'auto' }}>
        <CardContent>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h1">Sign in</Typography>
            <ThemeToggle />
          </Stack>
          {sent ? (
            <Alert severity="success">Check {email} for a sign-in link.</Alert>
          ) : oneTap && !ownEmail ? (
            <>
              <Typography variant="body2" color="text.secondary">
                Everything here is made up. Pick anyone to see Ward Desk as they do.
              </Typography>
              <List disablePadding aria-label="Practice people" sx={{ my: 1 }}>
                {PRACTICE_ACCOUNTS.map((a) => (
                  <ListItemButton key={a.email} disabled={busy} onClick={() => void practiceSignIn(a.email)} sx={{ borderRadius: 1 }}>
                    <ListItemText primary={a.name} secondary={a.role} />
                  </ListItemButton>
                ))}
              </List>
              <Button fullWidth disabled={busy} onClick={() => setOwnEmail(true)}>
                Use your own email
              </Button>
            </>
          ) : (
            <Stack component="form" onSubmit={submit} spacing={1.5}>
              {withPassword ? (
                <Autocomplete
                  freeSolo
                  openOnFocus
                  options={PRACTICE_ACCOUNTS.map((a) => a.email)}
                  // Typing a name or role finds the account too, not only its email.
                  filterOptions={findAccount}
                  inputValue={email}
                  onInputChange={(_, value) => setEmail(value)}
                  renderOption={({ key, ...props }, option) => (
                    <li key={key} {...props}>
                      <Box>
                        <Typography variant="body2">{option}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {practiceDetail(option)}
                        </Typography>
                      </Box>
                    </li>
                  )}
                  renderInput={(params) => <TextField {...params} label="Email" type="email" required autoComplete="off" />}
                />
              ) : (
                <TextField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              )}
              {withPassword && (
                <>
                  <TextField
                    label="Password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <Button type="submit" variant="contained" disabled={busy}>
                    Sign in
                  </Button>
                  <Divider>
                    <Typography variant="body2" color="text.secondary">
                      or
                    </Typography>
                  </Divider>
                </>
              )}
              {withPassword ? (
                <Button variant="outlined" disabled={busy || !email} onClick={() => void sendLink()}>
                  Email me a sign-in link
                </Button>
              ) : (
                <Button type="submit" variant="contained" disabled={busy}>
                  Email me a sign-in link
                </Button>
              )}
              {import.meta.env.VITE_ENABLE_GOOGLE === 'true' && (
                <Button variant="outlined" onClick={google}>
                  Sign in with Google
                </Button>
              )}
              {passkeysSupported() && (
                <Button variant="outlined" startIcon={<FingerprintIcon />} disabled={busy} onClick={() => void passkeySignIn()}>
                  Face ID or fingerprint
                </Button>
              )}
              {noPasskey && (
                <Typography variant="body2" color="text.secondary">
                  No Face ID or fingerprint sign-in on this device yet? Sign in another way first, then turn it on when asked.
                </Typography>
              )}
              {oneTap && <Button onClick={() => setOwnEmail(false)}>Back to the practice people</Button>}
            </Stack>
          )}
          <Box sx={{ mt: 1.5 }}>
            <ErrorNote error={error} />
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
