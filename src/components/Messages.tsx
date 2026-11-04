import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRef, useState, type FormEvent } from 'react'
import { AUDIENCE_LABELS, fillTemplate, KIND_LABELS, smsLink, templatesFor, unknownVariables, VARIABLES, type MessageAudience, type MessageKind, type MessageTemplate, type MessageValues } from '../lib/messages'
import { nativeSelect } from '../theme'
import { Muted } from './Layout'

/**
 * A message filled in from a template, ready to copy or open in the phone's messaging app. The
 * text can be changed before sending; picking another template starts it over.
 */
export function MessagePanel({
  kind,
  audience,
  values,
  templates,
  onSent,
  busy,
}: {
  kind: MessageKind
  audience: MessageAudience
  values: MessageValues
  templates: MessageTemplate[]
  onSent?: () => void
  busy?: boolean
}) {
  const options = templatesFor(templates, kind, audience)
  const [templateId, setTemplateId] = useState(options[0]?.id ?? '')
  const [draft, setDraft] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const template = options.find((t) => t.id === templateId) ?? options[0]

  if (!template)
    return (
      <Muted>
        No templates for {KIND_LABELS[kind].toLowerCase()} {audience === 'parent' ? 'to a parent' : 'to the person'} yet. Add one under Message templates.
      </Muted>
    )

  const text = draft ?? fillTemplate(template.body, values)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setCopyFailed(false)
      onSent?.()
    } catch {
      // Some browsers refuse; select the text so it can be copied from the phone's own menu.
      setCopied(false)
      setCopyFailed(true)
      field.current?.focus()
      field.current?.select()
    }
  }

  return (
    <Box sx={{ mt: 1.5 }} role="group" aria-label="Message to send">
      {options.length > 1 && (
        <TextField
          select
          label="Template"
          slotProps={nativeSelect}
          value={template.id}
          onChange={(e) => {
            setTemplateId(e.target.value)
            setDraft(null)
            setCopied(false)
          }}
          sx={{ mb: 1.5, maxWidth: 320 }}
        >
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </TextField>
      )}
      <TextField
        label="Message"
        multiline
        minRows={4}
        value={text}
        inputRef={field}
        onChange={(e) => {
          setDraft(e.target.value)
          setCopied(false)
        }}
      />
      {copyFailed && (
        <Typography variant="body2" color="warning.main" sx={{ mt: 0.5 }}>
          This browser wouldn't copy. The text is selected, so copy it from your phone's menu, or use Open Messages.
        </Typography>
      )}
      <Stack direction="row" useFlexGap sx={{ mt: 1, gap: 1, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={copy} disabled={busy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button variant="outlined" startIcon={<SmsOutlinedIcon />} component="a" href={smsLink(text)} onClick={() => onSent?.()}>
          Open Messages
        </Button>
      </Stack>
    </Box>
  )
}

type TemplateDraft = { id?: string; name: string; kind: MessageKind; audience: MessageAudience; body: string }

function TemplateForm({ initial, onSave, onCancel, busy }: { initial: TemplateDraft; onSave: (t: TemplateDraft) => Promise<boolean>; onCancel: () => void; busy: boolean }) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const unknown = unknownVariables(form.body)
  const usable = VARIABLES.filter((v) => v.kinds.includes(form.kind) && (!v.parentOnly || form.audience === 'parent'))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.body.trim()) return setError('Give the template a name and some text.')
    setError(null)
    if (await onSave(form)) onCancel()
  }

  return (
    <Box component="form" onSubmit={submit} aria-label={initial.id ? `Edit ${initial.name}` : 'New template'} sx={{ py: 1 }}>
      <Stack direction="row" useFlexGap sx={{ gap: 1.5, flexWrap: 'wrap' }}>
        <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ flex: '2 1 12rem' }} />
        <TextField select label="Used for" slotProps={nativeSelect} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as MessageKind })} sx={{ flex: '1 1 10rem' }}>
          <option value="offer">{KIND_LABELS.offer}</option>
          <option value="confirm">{KIND_LABELS.confirm}</option>
        </TextField>
        <TextField select label="Sent" slotProps={nativeSelect} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as MessageAudience })} sx={{ flex: '1 1 12rem' }}>
          <option value="member">{AUDIENCE_LABELS.member}</option>
          <option value="parent">{AUDIENCE_LABELS.parent}</option>
        </TextField>
      </Stack>
      <TextField label="Text" multiline minRows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} sx={{ mt: 1.5 }} />
      <Box sx={{ mt: 1 }}>
        {usable.map((v) => (
          <Typography key={v.name} variant="body2" color="text.secondary">
            <Box component="code" sx={{ color: 'text.primary' }}>{`{${v.name}}`}</Box> {v.meaning}
          </Typography>
        ))}
      </Box>
      {unknown.length > 0 && (
        <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
          Not a variable: {unknown.map((u) => `{${u}}`).join(', ')}. It will be sent as typed.
        </Typography>
      )}
      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        <Button type="submit" variant="contained" disabled={busy}>
          Save
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </Stack>
    </Box>
  )
}

/** The shared templates: change the wording, add more, or remove ones not used. */
export function TemplatesEditor({
  templates,
  onSave,
  onDelete,
  busy,
}: {
  templates: MessageTemplate[]
  onSave: (t: TemplateDraft) => Promise<boolean>
  onDelete: (id: string) => void
  busy: boolean
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  return (
    <>
      <Muted>Shared by the bishopric. Keep them general: a message shouldn't say what the appointment is for.</Muted>
      <Stack divider={<Divider flexItem />} spacing={1} sx={{ mt: 1 }}>
        {templates.map((t) =>
          editing === t.id ? (
            <TemplateForm key={t.id} initial={t} onSave={onSave} onCancel={() => setEditing(null)} busy={busy} />
          ) : (
            <Box key={t.id} component="article" aria-label={t.name}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {t.name}{' '}
                    <Typography component="span" variant="body2" color="text.secondary">
                      · {KIND_LABELS[t.kind]} · {AUDIENCE_LABELS[t.audience].toLowerCase()}
                    </Typography>
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                    {t.body}
                  </Typography>
                </Box>
                <Button size="small" onClick={() => setEditing(t.id)}>
                  Edit
                </Button>
                <IconButton size="small" aria-label={`Remove ${t.name}`} disabled={busy} onClick={() => onDelete(t.id)}>
                  <DeleteOutlinedIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Box>
          ),
        )}
      </Stack>
      {editing === 'new' ? (
        <TemplateForm initial={{ name: '', kind: 'offer', audience: 'member', body: '' }} onSave={onSave} onCancel={() => setEditing(null)} busy={busy} />
      ) : (
        <Button sx={{ mt: 1 }} onClick={() => setEditing('new')}>
          Add a template
        </Button>
      )}
    </>
  )
}
