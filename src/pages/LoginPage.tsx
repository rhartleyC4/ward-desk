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
import { supabase } from '../lib/supabase'

// The seeded accounts in supabase/seed.sql. Keep the two in sync.
const PRACTICE_ACCOUNTS = [
  { email: 'bishop@ward.test', role: 'Bishop (admin)' },
  { email: 'first@ward.test', role: 'First counselor' },
  { email: 'second@ward.test', role: 'Second counselor' },
  { email: 'scheduler@ward.test', role: 'Scheduler' },
  { email: 'suggester@ward.test', role: 'Suggester' },
]

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
            <Typography variant="h1">Ward Desk</Typography>
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
