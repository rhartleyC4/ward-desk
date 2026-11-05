// Text messages the executive secretary copies into their phone: a template with {variables}
// filled in for one appointment. Pure so it can be unit tested.

import type { Enums, Tables } from './database.types'

export type MessageTemplate = Pick<Tables<'message_templates'>, 'id' | 'name' | 'kind' | 'audience' | 'body'>
export type MessageKind = Enums<'message_kind'>
export type MessageAudience = Enums<'message_audience'>

export const KIND_LABELS: Record<MessageKind, string> = { offer: 'Offering times', confirm: 'Confirming a time' }
export const AUDIENCE_LABELS: Record<MessageAudience, string> = { member: 'To the person', parent: 'To a parent of a youth' }

/** The variables a template can use, with what each becomes. */
export const VARIABLES: { name: string; meaning: string; kinds: MessageKind[]; parentOnly?: boolean }[] = [
  { name: 'first_name', meaning: 'What to call them: "Mary", or "Sister Reyes" or "Brother Reyes" when you pick that before sending (the youth\'s name, in a message to a parent)', kinds: ['offer', 'confirm'] },
  { name: 'parent_name', meaning: 'The parent\'s name, like "Sister Quinn"', kinds: ['offer', 'confirm'], parentOnly: true },
  { name: 'name', meaning: 'Full name as entered', kinds: ['offer', 'confirm'] },
  { name: 'leader', meaning: 'Who they meet with, like "Bishop Avery"', kinds: ['offer', 'confirm'] },
  { name: 'length', meaning: 'How long, like "10 minutes"', kinds: ['offer', 'confirm'] },
  { name: 'times', meaning: 'The times picked, one per line', kinds: ['offer'] },
  { name: 'time', meaning: 'The time booked, like "Sun, November 8th at 9:10 AM"', kinds: ['confirm'] },
  { name: 'my_name', meaning: 'Your name', kinds: ['offer', 'confirm'] },
]

/** How {first_name} addresses someone: by first name, or as Sister or Brother with the last name. */
export type Address = 'first' | 'sister' | 'brother'

export type MessageValues = { name: string; leader: string; minutes: number; myName: string; times?: string[]; time?: string; parentName?: string | null; address?: Address }

/** Names entered with a title ("Sister Nash") keep it, since a bare "Sister" would read oddly. */
const TITLES = ['brother', 'sister', 'bro', 'bro.', 'sis', 'sis.', 'elder', 'bishop', 'president']

const words = (name: string) => name.trim().split(/\s+/).filter(Boolean)

/** True when the name was entered with a title, like "Sister Nash", so it is used as typed. */
export const hasTitle = (name: string) => TITLES.includes(words(name)[0]?.toLowerCase() ?? '')

export function firstName(name: string): string {
  const w = words(name)
  if (!w[0]) return ''
  return hasTitle(name) ? w.join(' ') : w[0]
}

/**
 * The name a message addresses someone by. "Mary Reyes" becomes "Mary", "Sister Reyes" or "Brother
 * Reyes". A name entered with a title keeps it whatever is picked, since the title is already chosen.
 */
export function addressName(name: string, address: Address = 'first'): string {
  const w = words(name)
  if (!w.length || hasTitle(name) || address === 'first') return firstName(name)
  return `${address === 'sister' ? 'Sister' : 'Brother'} ${w[w.length - 1]}`
}

/** The ways to address someone, for the choice shown before sending. Empty when there's no choice to make. */
export function addressOptions(name: string): { value: Address; label: string }[] {
  if (!words(name).length || hasTitle(name)) return []
  return (['first', 'sister', 'brother'] as const).map((value) => ({ value, label: addressName(name, value) }))
}

/** Whether a template uses a variable, so a choice that only affects it can be hidden otherwise. */
export const usesVariable = (body: string, name: string) => body.includes(`{${name}}`)

/** "10 minutes", "1 hour", "1 hour 15 minutes" for message text. */
export function lengthWords(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const parts = [h && `${h} hour${h === 1 ? '' : 's'}`, m && `${m} minute${m === 1 ? '' : 's'}`].filter(Boolean)
  return parts.join(' ')
}

/** Variables in a template that aren't on the list, usually a typo like {frist_name}. */
export function unknownVariables(body: string): string[] {
  const known = VARIABLES.map((v) => v.name)
  return [...new Set([...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((n) => !known.includes(n)))]
}

/**
 * Wording that depends on how many times are offered: "{this time|one of these times}" uses the
 * part before the bar for one time and the part after it for more. A confirmation is one time.
 */
export const CHOICE_HELP = { example: '{this time|one of these times}', meaning: 'The first part when one time is offered, the second when there are more' }

/** How many times a message is about, for picking singular or plural wording. */
const timeCount = (values: MessageValues) => (values.times ? values.times.length : 1)

/** Fills in a template. Unknown variables are left as typed so the mistake shows. */
export function fillTemplate(body: string, values: MessageValues): string {
  const one = timeCount(values) === 1
  const vars: Record<string, string> = {
    first_name: addressName(values.name, values.address),
    name: values.name.trim(),
    leader: values.leader,
    length: lengthWords(values.minutes),
    // A single time reads as a plain line; a list of them gets bullets.
    times: one ? (values.times?.[0] ?? '') : (values.times ?? []).map((t) => `• ${t}`).join('\n'),
    time: values.time ?? '',
    my_name: values.myName,
    // "Hi there" reads fine when the parent's name hasn't been entered.
    parent_name: values.parentName?.trim() || 'there',
  }
  return body
    .replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_, single: string, plural: string) => (one ? single : plural))
    .replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? vars[key] : whole))
}

/** Made-up details for previewing a template while writing it. */
export const SAMPLE_VALUES: MessageValues = {
  name: 'Mary Reyes',
  leader: 'Bishop Avery',
  minutes: 15,
  myName: 'Brother Quinn',
  times: ['Sun, November 8th at 9:10 AM', 'Wed, November 11th at 7 PM'],
  time: 'Sun, November 8th at 9:10 AM',
  parentName: 'Sister Reyes',
}

/** Puts text into a template where the cursor is (or over the selection), returning the new text and cursor. */
export function insertAt(body: string, start: number, end: number, text: string): { body: string; cursor: number } {
  return { body: body.slice(0, start) + text + body.slice(end), cursor: start + text.length }
}

/**
 * A link that opens the phone's messaging app with the text filled in and no one picked yet, so
 * phone numbers never need to be stored here. "sms:?&body=" works on both iPhone and Android.
 */
export const smsLink = (text: string) => `sms:?&body=${encodeURIComponent(text)}`

/** Mail clients expect CRLF line breaks in a mailto link; some run lines together on a bare LF. */
const mailtoEncode = (text: string) => encodeURIComponent(text.replace(/\r?\n/g, '\r\n'))

/** A subject that says who the appointment is with but never what it is for. */
export const emailSubject = (leader: string) => (leader.trim() ? `Appointment with ${leader.trim()}` : 'Appointment')

/** Like smsLink, but opens the mail app: a new email with the subject and text and no recipient. */
export const emailLink = (subject: string, text: string) => `mailto:?subject=${mailtoEncode(subject)}&body=${mailtoEncode(text)}`

/** Who a message for this appointment goes to: a parent for a youth, otherwise the person. */
export const audienceFor = (appointment: { is_youth: boolean }): MessageAudience => (appointment.is_youth ? 'parent' : 'member')

/** The templates to offer for a message: the right kind and audience. */
export function templatesFor(templates: MessageTemplate[], kind: MessageKind, audience: MessageAudience): MessageTemplate[] {
  return templates.filter((t) => t.kind === kind && t.audience === audience)
}
