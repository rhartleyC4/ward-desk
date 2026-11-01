import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { ErrorNote } from '../components/Layout'
import { ThemeToggle } from '../components/ThemeToggle'
import { friendlyAuthError } from '../lib/authErrors'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sendLink = async (e: FormEvent) => {
    e.preventDefault()
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

  // Local development only: seeded test accounts have a password so you can skip Mailpit.
  const devSignIn = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(friendlyAuthError(error.message))
  }

  const google = () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', px: 2, py: '10vh' }}>
      <Card sx={{ maxWidth: 400, mx: 'auto' }}>
        <CardContent>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h1">Ward Planner</Typography>
            <ThemeToggle />
          </Stack>
          {sent ? (
            <Alert severity="success">Check {email} for a sign-in link.</Alert>
          ) : (
            <Stack component="form" onSubmit={sendLink} spacing={1.5}>
              <TextField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <Button type="submit" variant="contained" disabled={busy}>
                Email me a sign-in link
              </Button>
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
          {import.meta.env.DEV && !sent && (
            <Accordion disableGutters elevation={0} sx={{ mt: 1, border: 1, borderColor: 'divider', '&::before': { display: 'none' } }}>
              <AccordionSummary>
                <Typography variant="body2" color="text.secondary">
                  Local test accounts
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack component="form" onSubmit={devSignIn} spacing={1.5}>
                  <TextField
                    label="Password (see supabase/seed.sql)"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Button type="submit" variant="outlined" disabled={busy || !email || !password}>
                    Sign in with password
                  </Button>
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
