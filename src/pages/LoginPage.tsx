import FingerprintIcon from '@mui/icons-material/Fingerprint'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { ErrorNote } from '../components/Layout'
import { ThemeToggle } from '../components/ThemeToggle'
import { friendlyAuthError } from '../lib/authErrors'
import { isTrainingSite } from '../lib/env'
import { PasskeyCancelled, passkeysSupported, rememberPasskeyChoice } from '../lib/passkeys'
import { signInWithPasskey } from '../lib/queries'
import { supabase } from '../lib/supabase'

// The seeded accounts in supabase/seed.sql. Keep the two in sync.
const PRACTICE_ACCOUNTS = [
  { email: 'bishop@ward.test', role: 'Bishop (admin)' },
  { email: 'first@ward.test', role: '1st counselor' },
  { email: 'second@ward.test', role: '2nd counselor' },
  { email: 'secretary@ward.test', role: 'Executive secretary' },
  { email: 'clerk@ward.test', role: 'Ward clerk' },
  { email: 'eqpres@ward.test', role: 'Elders Quorum president' },
  { email: 'rspres@ward.test', role: 'Relief Society president' },
  { email: 'ywpres@ward.test', role: 'Young Women president' },
  { email: 'primarypres@ward.test', role: 'Primary president' },
  { email: 'mission@ward.test', role: 'Ward mission leader' },
  { email: 'temple@ward.test', role: 'Temple and family history leader' },
  { email: 'activities@ward.test', role: 'Activities committee chair' },
  { email: 'leader@ward.test', role: 'Other called leader' },
]

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [noPasskey, setNoPasskey] = useState(false)

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
          ) : (
            <Stack component="form" onSubmit={submit} spacing={1.5}>
              {withPassword ? (
                <Autocomplete
                  freeSolo
                  openOnFocus
                  options={PRACTICE_ACCOUNTS.map((a) => a.email)}
                  inputValue={email}
                  onInputChange={(_, value) => setEmail(value)}
                  renderOption={({ key, ...props }, option) => (
                    <li key={key} {...props}>
                      <Box>
                        <Typography variant="body2">{option}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {PRACTICE_ACCOUNTS.find((a) => a.email === option)?.role}
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
