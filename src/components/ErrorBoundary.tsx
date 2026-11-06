import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../lib/errorReport'

type Props = { children: ReactNode }
type State = { failed: boolean }

/**
 * Shows a short apology with a reload button in place of a part of the app that crashed, and
 * reports the error. Layout puts one around each page (keyed by path, so moving to another page
 * clears it) and main.tsx one around everything.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError('render', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <Card sx={{ m: 2 }}>
        <CardContent>
          <Typography variant="h6" component="h2" gutterBottom>
            Something went wrong
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            This page hit a problem and couldn't show. It has been reported. Reloading usually fixes it.
          </Typography>
          <Button variant="contained" onClick={() => location.reload()}>
            Reload
          </Button>
        </CardContent>
      </Card>
    )
  }
}
