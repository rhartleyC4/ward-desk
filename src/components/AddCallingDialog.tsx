import AddIcon from '@mui/icons-material/Add'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { useRef, useState, type FormEvent } from 'react'
import type { ListedCalling } from '../lib/callings'
import { CallingField } from './CallingField'

/** A calling to fill, as the dialog hands it over. The id is made here so the list can find the new card. */
export type NewCalling = {
  id: string
  calling_title: string
  release_name: string | null
  release_on: string | null
  release_only: boolean
  notes: string | null
  /** Names to consider, added under the calling as it's made. */
  names: string[]
}

const EMPTY = { calling_title: '', release_name: '', release_on: '', release_only: false, notes: '', names: [''] }

/**
 * Adds a calling to fill with everything known about it at once: the calling, who's released and
 * the first names to consider. The rarer choices (release only, the release date, notes) wait
 * behind More options. Full screen on phones, with Cancel and Add at the top like an iOS sheet.
 */
export function AddCallingDialog({ open, onClose, onAdd, callings }: { open: boolean; onClose: () => void; onAdd: (calling: NewCalling) => void; callings: ListedCalling[] }) {
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [form, setForm] = useState(EMPTY)
  const [more, setMore] = useState(false)
  const callingRef = useRef<HTMLInputElement>(null)
  const set = (changes: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...changes }))

  const releasing = form.release_name.trim()
  const ready = !!form.calling_title.trim() && (!form.release_only || !!releasing)

  const reset = () => {
    setForm(EMPTY)
    setMore(false)
  }
  const close = () => {
    onClose()
    reset()
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!ready) return
    onAdd({
      id: crypto.randomUUID(),
      calling_title: form.calling_title.trim(),
      release_name: releasing || null,
      release_on: (releasing && form.release_on) || null,
      release_only: form.release_only,
      notes: form.notes.trim() || null,
      names: form.release_only ? [] : form.names.map((n) => n.trim()).filter(Boolean),
    })
    close()
  }

  const setName = (i: number, name: string) => set({ names: form.names.map((n, j) => (j === i ? name : n)) })

  const addButton = (
    <Button type="submit" variant="contained">
      Add calling
    </Button>
  )
  const cancelButton = <Button onClick={close}>Cancel</Button>

  return (
    <Dialog
      open={open}
      onClose={close}
      fullScreen={phone}
      fullWidth
      maxWidth="sm"
      aria-labelledby="add-calling-title"
      // The dialog focuses itself as it opens; once it's in, start in the Calling box.
      slotProps={{ transition: { onEntered: () => callingRef.current?.focus() } }}
    >
      <Box component="form" onSubmit={submit} aria-label="Add a calling to fill" sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
        {phone ? (
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1, px: 1, py: 1, borderBottom: 1, borderColor: 'divider' }}>
            {cancelButton}
            <Typography id="add-calling-title" component="h2" variant="h3" sx={{ flex: 1, textAlign: 'center' }}>
              Add a calling
            </Typography>
            {addButton}
          </Stack>
        ) : (
          <DialogTitle id="add-calling-title">Add a calling</DialogTitle>
        )}
        <DialogContent sx={phone ? { pt: 2 } : undefined}>
          <Stack spacing={2} sx={{ pt: phone ? 0 : 1 }}>
            <CallingField callings={callings} value={form.calling_title} onChange={(calling_title) => set({ calling_title })} required inputRef={callingRef} />
            <TextField
              label={form.release_only ? "Who's being released" : "Who's being released (optional)"}
              value={form.release_name}
              onChange={(e) => set({ release_name: e.target.value })}
              required={form.release_only}
              helperText={form.release_only ? undefined : 'Leave blank if no one has it now'}
            />
            {!form.release_only && (
              <Stack spacing={1} role="group" aria-label="Names to consider">
                {form.names.map((name, i) => (
                  <TextField
                    key={i}
                    label={i === 0 ? 'Name to consider (optional)' : 'Another name to consider'}
                    value={name}
                    onChange={(e) => setName(i, e.target.value)}
                  />
                ))}
                <Button size="small" startIcon={<AddIcon />} onClick={() => set({ names: [...form.names, ''] })} sx={{ alignSelf: 'flex-start' }}>
                  Another name
                </Button>
              </Stack>
            )}
            {more ? (
              <Stack spacing={2}>
                <FormControlLabel
                  control={<Checkbox checked={form.release_only} onChange={(e) => set({ release_only: e.target.checked })} />}
                  label="Release only — no one new is called"
                />
                {!!releasing && (
                  <TextField
                    type="date"
                    label={`Release ${releasing} on`}
                    value={form.release_on}
                    onChange={(e) => set({ release_on: e.target.value })}
                    slotProps={{ inputLabel: { shrink: true } }}
                    helperText={form.release_only ? 'Moves to Releases that day' : 'Moves to Releases that day. Leave blank to set it when someone accepts.'}
                  />
                )}
                <TextField label="Notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} multiline minRows={2} />
              </Stack>
            ) : (
              <Button size="small" startIcon={<ExpandMoreIcon />} onClick={() => setMore(true)} sx={{ alignSelf: 'flex-start' }}>
                More options
              </Button>
            )}
          </Stack>
        </DialogContent>
        {!phone && (
          <DialogActions>
            {cancelButton}
            {addButton}
          </DialogActions>
        )}
      </Box>
    </Dialog>
  )
}
