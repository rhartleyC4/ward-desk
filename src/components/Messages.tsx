import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined'
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import {
  addressOptions,
  AUDIENCE_LABELS,
  CHOICE_HELP,
  emailLink,
  emailSubject,
  fillTemplate,
  insertAt,
  KIND_LABELS,
  SAMPLE_VALUES,
  smsLink,
  templatesFor,
  unknownVariables,
  usesVariable,
  VARIABLES,
  type Address,
  type MessageAudience,
  type MessageKind,
  type MessageTemplate,
  type MessageValues,
} from '../lib/messages'
import { nativeSelect } from '../theme'
import { Muted } from './Layout'

/** "Mary · Sister Reyes · Brother Reyes": how {first_name} addresses the person. */
function AddressPicker({ name, value, onChange }: { name: string; value: Address; onChange: (a: Address) => void }) {
  const options = addressOptions(name)
  const labelId = useId()
  if (!options.length) return null
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="body2" color="text.secondary" id={labelId} sx={{ mb: 0.5 }}>
        Address as
      </Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        aria-labelledby={labelId}
        value={value}
        onChange={(_, a: Address | null) => a && onChange(a)}
        sx={{ flexWrap: 'wrap' }}
      >
        {options.map((o) => (
          <ToggleButton key={o.value} value={o.value} sx={{ textTransform: 'none' }}>
            {o.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  )
}

/**
 * A message filled in from a template, ready to copy or open in the phone's messaging or mail app. The
 * text can be changed before sending; picking another template starts it over.
 */
export function MessagePanel({
  kind,
  audience,
  values,
  templates,
  onSent,
  busy,
  subject,
  warn,
}: {
  kind: MessageKind
  audience: MessageAudience
  values: MessageValues
  templates: MessageTemplate[]
  onSent?: () => void
  busy?: boolean
  /** The email subject; "Appointment with {leader}" unless given. */
  subject?: string
  /** Something to point out about the chosen template before it's sent, or null. */
  warn?: (body: string) => string | null
}) {
  const options = templatesFor(templates, kind, audience)
  const [templateId, setTemplateId] = useState(options[0]?.id ?? '')
  const [draft, setDraft] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [address, setAddress] = useState<Address>('first')
  const field = useRef<HTMLTextAreaElement>(null)
  const template = options.find((t) => t.id === templateId) ?? options[0]

  if (!template)
    return (
      <Muted>
        No templates for {KIND_LABELS[kind].toLowerCase()}
        {kind === 'meeting' ? '' : audience === 'parent' ? ' to a parent' : ' to the person'} yet. Add one under Message templates.
      </Muted>
    )

  const text = draft ?? fillTemplate(template.body, { ...values, address })

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
      {usesVariable(template.body, 'first_name') && (
        <AddressPicker
          name={values.name}
          value={address}
          onChange={(a) => {
            setAddress(a)
            setDraft(null)
            setCopied(false)
          }}
        />
      )}
      {warn?.(template.body) && (
        <Typography variant="body2" color="warning.main" sx={{ mb: 1 }}>
          {warn(template.body)}
        </Typography>
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
          This browser wouldn't copy. The text is selected, so copy it from your phone's menu, or use Open Messages or Email.
        </Typography>
      )}
      <Stack direction="row" useFlexGap sx={{ mt: 1, gap: 1, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={copy} disabled={busy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button variant="outlined" startIcon={<SmsOutlinedIcon />} component="a" href={smsLink(text)} onClick={() => onSent?.()}>
          Open Messages
        </Button>
        <Button variant="outlined" startIcon={<EmailOutlinedIcon />} component="a" href={emailLink(subject ?? emailSubject(values.leader), text)} onClick={() => onSent?.()}>
          Email
        </Button>
      </Stack>
    </Box>
  )
}

type TemplateDraft = { id?: string; name: string; kind: MessageKind; audience: MessageAudience; body: string }

function TemplateForm({ initial, onSave, onCancel, busy }: { initial: TemplateDraft; onSave: (t: TemplateDraft) => Promise<boolean>; onCancel: () => void; busy: boolean }) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [previewAddress, setPreviewAddress] = useState<Address>('first')
  const body = useRef<HTMLTextAreaElement>(null)
  // Until the text has been clicked into, variables go at the end rather than the browser's default spot.
  const touched = useRef(false)
  // Where the cursor goes after a variable is put in, set once React has rendered the new text.
  const cursor = useRef<number | null>(null)
  const unknown = unknownVariables(form.body)
  const usable = VARIABLES.filter((v) => v.kinds.includes(form.kind) && (!v.parentOnly || form.audience === 'parent'))
  const sample = { ...SAMPLE_VALUES, address: previewAddress, ...(form.kind === 'offer' ? { time: undefined } : { times: undefined }) }
  const forMeeting = form.kind === 'meeting'

  useLayoutEffect(() => {
    if (cursor.current === null || !body.current) return
    body.current.focus()
    body.current.setSelectionRange(cursor.current, cursor.current)
    cursor.current = null
  })

  /** Puts a variable where the cursor is in the text, or at the end if the text hasn't been clicked yet. */
  const insert = (text: string) => {
    const el = body.current
    const [start, end] = el && touched.current ? [el.selectionStart, el.selectionEnd] : [form.body.length, form.body.length]
    const next = insertAt(form.body, start, end, text)
    cursor.current = next.cursor
    setForm({ ...form, body: next.body })
  }

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
        <TextField
          select
          label="Used for"
          slotProps={nativeSelect}
          value={form.kind}
          // A meeting reminder goes to everyone who attends, so it has no parent version.
          onChange={(e) => setForm({ ...form, kind: e.target.value as MessageKind, ...(e.target.value === 'meeting' ? { audience: 'member' as const } : {}) })}
          sx={{ flex: '1 1 10rem' }}
        >
          {(Object.keys(KIND_LABELS) as MessageKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </TextField>
        {!forMeeting && (
          <TextField select label="Sent" slotProps={nativeSelect} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as MessageAudience })} sx={{ flex: '1 1 12rem' }}>
            <option value="member">{AUDIENCE_LABELS.member}</option>
            <option value="parent">{AUDIENCE_LABELS.parent}</option>
          </TextField>
        )}
      </Stack>
      <TextField
        label="Text"
        multiline
        minRows={4}
        value={form.body}
        inputRef={body}
        onChange={(e) => setForm({ ...form, body: e.target.value })}
        onFocus={() => (touched.current = true)}
        sx={{ mt: 1.5 }}
      />

      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 0.5 }}>
        Tap to add where the cursor is:
      </Typography>
      <Stack spacing={0.75} role="list" aria-label="Variables">
        {usable.map((v) => (
          <Stack key={v.name} direction="row" role="listitem" sx={{ alignItems: 'baseline', gap: 1 }}>
            <Chip
              size="small"
              variant="outlined"
              label={`{${v.name}}`}
              aria-label={`Add {${v.name}}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(`{${v.name}}`)}
              sx={{ fontFamily: 'monospace', flexShrink: 0 }}
            />
            <Typography variant="body2" color="text.secondary">
              {v.meaning}
            </Typography>
          </Stack>
        ))}
        {form.kind === 'offer' && (
          <Stack direction="row" role="listitem" sx={{ alignItems: 'baseline', gap: 1 }}>
            <Chip
              size="small"
              variant="outlined"
              label={CHOICE_HELP.example}
              aria-label={`Add ${CHOICE_HELP.example}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(CHOICE_HELP.example)}
              sx={{ fontFamily: 'monospace', flexShrink: 0 }}
            />
            <Typography variant="body2" color="text.secondary">
              {CHOICE_HELP.meaning}
            </Typography>
          </Stack>
        )}
      </Stack>

      {unknown.length > 0 && (
        <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
          Not a variable: {unknown.map((u) => `{${u}}`).join(', ')}. It will be sent as typed.
        </Typography>
      )}

      {form.body.trim() && (
        <Box component="section" aria-label="Preview" sx={{ mt: 2, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {forMeeting ? `Preview, for ${SAMPLE_VALUES.meeting}` : `Preview, for a made-up ${form.audience === 'parent' ? 'youth' : 'person'} entered as "${SAMPLE_VALUES.name}"`}
          </Typography>
          {usesVariable(form.body, 'first_name') && <AddressPicker name={SAMPLE_VALUES.name} value={previewAddress} onChange={setPreviewAddress} />}
          <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }} data-testid="template-preview">
            {fillTemplate(form.body, sample)}
          </Typography>
        </Box>
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
                      · {KIND_LABELS[t.kind]}
                      {t.kind !== 'meeting' && ` · ${AUDIENCE_LABELS[t.audience].toLowerCase()}`}
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
