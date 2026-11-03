import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { ErrorNote, Loading, Muted, SectionCard } from '../components/Layout'
import { groupCallings, ORGANIZATIONS, tidyTitle, UNREVIEWED, type ListedCalling } from '../lib/callings'
import { addToCallingList, loadCallingList, removeFromCallingList, updateCallingListEntry } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'
import { nativeSelect } from '../theme'

const friendly = (message: string) => (/duplicate key/i.test(message) ? 'That title is already on the list. Remove the extra one instead.' : message)

/** Handbook organizations plus any an admin has used, for the organization picker. */
const organizationsIn = (list: ListedCalling[]) => [...new Set([...ORGANIZATIONS, ...list.flatMap((c) => (c.organization ? [c.organization] : []))])]

function OrganizationSelect({ label, value, organizations, onChange }: { label: string; value: string | null; organizations: string[]; onChange: (value: string | null) => void }) {
  return (
    <TextField
      select
      label="Organization"
      slotProps={{ ...nativeSelect, htmlInput: { 'aria-label': label } }}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">None yet</option>
      {organizations.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </TextField>
  )
}

function CallingRow({
  calling,
  organizations,
  busy,
  onSave,
  onRemove,
}: {
  calling: ListedCalling
  organizations: string[]
  busy: boolean
  onSave: (changes: { title?: string; organization?: string | null }) => Promise<boolean>
  onRemove: () => void
}) {
  const [title, setTitle] = useState(calling.title)
  const saveTitle = () => {
    const next = tidyTitle(title)
    if (!next) setTitle(calling.title)
    // A refused rename (a duplicate, say) puts the saved title back.
    else if (next !== calling.title) onSave({ title: next }).then((ok) => !ok && setTitle(calling.title))
  }
  return (
    <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
      <Box sx={{ flex: '1 1 220px' }}>
        <TextField
          label="Title"
          value={title}
          slotProps={{ htmlInput: { 'aria-label': `Title for ${calling.title}` } }}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              saveTitle()
            }
          }}
        />
      </Box>
      <Box sx={{ flex: '1 1 160px', maxWidth: { sm: 220 } }}>
        <OrganizationSelect
          label={`Organization for ${calling.title}`}
          value={calling.organization}
          organizations={organizations}
          onChange={(organization) => onSave({ organization })}
        />
      </Box>
      <Tooltip title="Remove">
        <span>
          <IconButton size="small" aria-label={`Remove ${calling.title}`} disabled={busy} onClick={onRemove}>
            <DeleteOutlinedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  )
}

/** Admins tidy the titles the Calling box suggests, including ones the bishopric typed in. */
export function CallingListPage() {
  const { data, error, reload } = useAsync(() => loadCallingList(supabase), [])
  const save = useAction()
  const [find, setFind] = useState('')
  const [form, setForm] = useState<{ title: string; organization: string | null }>({ title: '', organization: 'Other' })

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  const run = (fn: () => Promise<void>) =>
    save
      .act(async () => {
        try {
          await fn()
        } catch (e) {
          throw new Error(friendly((e as Error).message))
        }
      })
      .then((ok) => {
        reload()
        return ok
      })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!tidyTitle(form.title)) return
    if (await run(() => addToCallingList(supabase, form))) setForm({ title: '', organization: form.organization })
  }

  const organizations = organizationsIn(data)
  const needle = find.trim().toLowerCase()
  const groups = groupCallings(needle ? data.filter((c) => c.title.toLowerCase().includes(needle)) : data)
  // Titles waiting for review go first here, since tidying them is what this page is for.
  const ordered = [...groups.filter((g) => g.group === UNREVIEWED), ...groups.filter((g) => g.group !== UNREVIEWED)]

  return (
    <>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Calling list
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Muted>
          These are the titles the Calling box suggests. When the bishopric types a title that isn't here, it shows up under {UNREVIEWED}. Fix its spelling,
          file it under an organization, or remove it. Renaming a title also renames the open callings that use it. Filled ones keep the title they had.
        </Muted>
      </Box>
      <ErrorNote error={save.error} />

      <SectionCard title="Add a calling">
        <Stack component="form" onSubmit={submit} direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Box sx={{ flex: '1 1 220px' }}>
            <TextField label="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Box>
          <Box sx={{ flex: '1 1 160px', maxWidth: { sm: 220 } }}>
            <OrganizationSelect
              label="Organization for the new calling"
              value={form.organization}
              organizations={organizations}
              onChange={(organization) => setForm({ ...form, organization })}
            />
          </Box>
          <Button type="submit" variant="contained" disabled={save.busy}>
            Add
          </Button>
        </Stack>
      </SectionCard>

      <Box sx={{ mb: 1.5 }}>
        <TextField label="Find a calling" type="search" value={find} onChange={(e) => setFind(e.target.value)} />
      </Box>

      {ordered.length === 0 && <Muted>No callings match.</Muted>}
      {ordered.map(({ group, callings }) => (
        <SectionCard key={group} title={`${group} (${callings.length})`}>
          <Stack spacing={1.5}>
            {callings.map((calling) => (
              <CallingRow
                // Keyed on the title too, so the box picks up a saved rename.
                key={`${calling.id}-${calling.title}`}
                calling={calling}
                organizations={organizations}
                busy={save.busy}
                onSave={(changes) => run(() => updateCallingListEntry(supabase, calling.id, changes))}
                onRemove={() => {
                  if (window.confirm(`Remove ${calling.title} from the list? Callings already entered keep their title.`))
                    run(() => removeFromCallingList(supabase, calling.id))
                }}
              />
            ))}
          </Stack>
        </SectionCard>
      ))}
    </>
  )
}
