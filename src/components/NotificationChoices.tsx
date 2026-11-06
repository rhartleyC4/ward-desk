import Switch from '@mui/material/Switch'
import { useEffect, useState } from 'react'
import type { AppRole } from '../lib/access'
import type { Enums } from '../lib/database.types'
import { notificationsFor, type NotificationKind } from '../lib/notifications'
import { GroupedList, GroupedRow } from './Grouped'
import { ErrorNote, Loading } from './Layout'

export type ChoiceActions = {
  /** The kinds this person turned off. */
  load: () => Promise<NotificationKind[]>
  set: (kind: NotificationKind, on: boolean) => Promise<void>
}

/** A switch for each kind of notification this person could be sent. They apply on every device. */
export function NotificationChoices({ roles, office, actions }: { roles: AppRole[]; office: Enums<'bishopric_office'> | null; actions: ChoiceActions }) {
  const [off, setOff] = useState<Set<NotificationKind> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<NotificationKind | null>(null)

  useEffect(() => {
    let cancelled = false
    actions
      .load()
      .then((kinds) => !cancelled && setOff(new Set(kinds)))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [actions])

  const groups = notificationsFor(roles, office)
  if (!groups.length) return null
  if (!off) return error ? <ErrorNote error={error} /> : <Loading />

  const toggle = async (kind: NotificationKind, on: boolean) => {
    const before = off
    const next = new Set(off)
    if (on) next.delete(kind)
    else next.add(kind)
    // Show the change straight away, and put it back if it didn't save.
    setOff(next)
    setSaving(kind)
    setError(null)
    try {
      await actions.set(kind, on)
    } catch (e) {
      setOff(before)
      setError((e as Error).message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <>
      <ErrorNote error={error} />
      {groups.map(({ group, items }, i) => (
        <GroupedList key={group} title={group} footer={i === groups.length - 1 ? 'These apply on every device you’ve turned notifications on for.' : undefined}>
          {items.map((n) => (
            <GroupedRow
              key={n.kind}
              label={n.label}
              hint={n.hint}
              value={
                <Switch
                  edge="end"
                  checked={!off.has(n.kind)}
                  disabled={saving === n.kind}
                  onChange={(_, on) => void toggle(n.kind, on)}
                  slotProps={{ input: { 'aria-label': n.label } }}
                />
              }
            />
          ))}
        </GroupedList>
      ))}
    </>
  )
}
