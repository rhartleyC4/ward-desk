// Guided steps: one question per screen with Back, Next and Cancel always in the same place, and
// the big labelled buttons that start them. Shared by Home and Requests.

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import { Muted } from './Layout'

/** One question per screen, with Back, Next and Cancel always in the same place. */
export function StepFrame({ step, of, question, children, onBack, onCancel, nextLabel, canNext, busy, onNext }: {
  step: number
  of: number
  question: string
  children: ReactNode
  onBack: () => void
  onCancel: () => void
  nextLabel: string
  canNext: boolean
  busy: boolean
  onNext: () => void
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (canNext && !busy) onNext()
  }
  return (
    <Box component="form" onSubmit={submit} aria-label={question}>
      <Typography variant="body2" color="text.secondary">
        Step {step} of {of}
      </Typography>
      <Typography variant="h2" sx={{ mt: 0.5, mb: 1.5 }}>
        {question}
      </Typography>
      {children}
      <Stack direction="row" useFlexGap sx={{ mt: 2, gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button type="submit" variant="contained" size="large" disabled={!canNext || busy}>
          {nextLabel}
        </Button>
        {step > 1 && (
          <Button size="large" variant="outlined" onClick={onBack}>
            Back
          </Button>
        )}
        <Button size="large" onClick={onCancel}>
          Cancel
        </Button>
      </Stack>
    </Box>
  )
}

export function Choices<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <RadioGroup aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <FormControlLabel
          key={o.value}
          value={o.value}
          control={<Radio />}
          label={
            <Box sx={{ py: 0.5 }}>
              <Typography>{o.label}</Typography>
              {o.hint && <Muted>{o.hint}</Muted>}
            </Box>
          }
        />
      ))}
    </RadioGroup>
  )
}

export function ActionButton({ icon, label, hint, onClick, to, back = { to: '/home', label: 'Home' }, disabled }: {
  icon: ReactNode
  label: string
  hint: string
  onClick?: () => void
  to?: string
  /** Where the opened page's back button returns to. */
  back?: { to: string; label: string }
  disabled?: boolean
}) {
  const link = to ? { component: Link, to, state: { back } } : {}
  return (
    <Button
      {...link}
      onClick={onClick}
      disabled={disabled}
      variant="outlined"
      fullWidth
      startIcon={icon}
      sx={{ justifyContent: 'flex-start', textAlign: 'left', py: 1.5, px: 2, textTransform: 'none', '& .MuiButton-startIcon': { mr: 1.5 } }}
    >
      <Box>
        <Typography sx={{ fontWeight: 600, color: 'text.primary' }}>{label}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {hint}
        </Typography>
      </Box>
    </Button>
  )
}
