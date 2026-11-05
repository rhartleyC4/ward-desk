import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import { Children, type ReactNode } from 'react'
import { Link } from 'react-router'

/** Palette colors for the small icon squares, like the iPhone's Settings app. */
export type TileColor = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error'

/** An inset, rounded list with a small heading above and an optional note below, like iOS Settings. */
export function GroupedList({ title, footer, children, label }: { title?: ReactNode; footer?: ReactNode; children: ReactNode; label?: string }) {
  const rows = Children.toArray(children).filter(Boolean)
  return (
    <Box component="section" aria-label={label ?? (typeof title === 'string' ? title : undefined)} sx={{ mb: 3 }}>
      {title && (
        <Typography component="h2" variant="body2" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.8125rem', px: 2, mb: 0.75 }}>
          {title}
        </Typography>
      )}
      <Box
        component="ul"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          borderRadius: 3,
          overflow: 'hidden',
          '& > li + li > *': { boxShadow: (t) => `inset 0 1px 0 ${t.vars?.palette.divider ?? t.palette.divider}` },
        }}
      >
        {rows.map((row, i) => (
          <li key={i}>{row}</li>
        ))}
      </Box>
      {footer && (
        <Typography variant="body2" sx={{ color: 'text.secondary', px: 2, mt: 0.75 }}>
          {footer}
        </Typography>
      )}
    </Box>
  )
}

export function IconTile({ color, children }: { color: TileColor; children: ReactNode }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 32,
        height: 32,
        borderRadius: 2,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        bgcolor: `${color}.main`,
        color: `${color}.contrastText`,
        '& svg': { fontSize: 20 },
      }}
    >
      {children}
    </Box>
  )
}

type RowProps = {
  label: ReactNode
  hint?: ReactNode
  /** Shown at the right, before the chevron. */
  value?: ReactNode
  /** Something on the left: an IconTile, an avatar, a check. */
  start?: ReactNode
  to?: string
  state?: unknown
  onClick?: () => void
  /** Text color for an action row such as "Sign out". */
  tone?: 'error' | 'primary'
  center?: boolean
}

/** One row of a GroupedList. With `to` or `onClick` it's a full-width tap target with a chevron. */
export function GroupedRow({ label, hint, value, start, to, state, onClick, tone, center }: RowProps) {
  const tappable = !!to || !!onClick
  const content = (
    <>
      {start}
      <Box sx={{ flex: 1, minWidth: 0, textAlign: center ? 'center' : 'left' }}>
        <Typography sx={{ fontWeight: 500, color: tone ? `${tone}.main` : 'text.primary' }}>{label}</Typography>
        {hint && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {hint}
          </Typography>
        )}
      </Box>
      {value !== undefined && (
        <Typography variant="body2" component="div" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
          {value}
        </Typography>
      )}
      {to && <ChevronRightIcon aria-hidden sx={{ color: 'text.secondary', opacity: 0.6, mr: -0.5 }} />}
    </>
  )
  const sx = { display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', minHeight: 52, px: 2, py: 1 } as const
  if (!tappable) return <Box sx={sx}>{content}</Box>
  const link = to ? { component: Link, to, state } : {}
  return (
    <ButtonBase {...link} onClick={onClick} sx={{ ...sx, justifyContent: 'flex-start', '&:hover, &.Mui-focusVisible': { bgcolor: 'action.hover' } }}>
      {content}
    </ButtonBase>
  )
}
