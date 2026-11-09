// Requests between people, and ward leaders' calling requests. Pure so it can be unit tested.

import { addDays, longDate, type IsoDate } from './dates'
import type { Database, Enums, Tables } from './database.types'
import { wardParts } from './slots'

export type Request = Tables<'requests'>
export type RequestStatus = Enums<'request_status'>
export type CallingRequest = Tables<'calling_requests'>
export type CallingRequestKind = Enums<'calling_request_kind'>
export type Recipient = Database['public']['Functions']['request_recipients']['Returns'][number]
type MyCallingRequestRow = Database['public']['Functions']['my_calling_requests']['Returns'][number]
type MaybeEmpty = 'organization' | 'release_name' | 'needed_by' | 'notes' | 'received_at' | 'received_by_name'
/** The generated type calls every column non-null; these can be null. */
export type MyCallingRequest = Omit<MyCallingRequestRow, MaybeEmpty> & { [K in MaybeEmpty]: MyCallingRequestRow[K] | null }
export type CallingStage = 'sent' | 'received' | 'in_progress' | 'finished'

/** The ward's date a timestamp falls on, to compare with the ward's today and meeting dates. */
export const dayOf = (timestamp: string, timeZone: string): IsoDate => wardParts(timestamp, timeZone).date

/** Shown in place of someone whose account was deleted: their requests stay with the sender id or recipient id blank. */
export const FORMER_MEMBER = 'Former member'

export const isOpen = (r: Pick<Request, 'status'>) => r.status === 'sent' || r.status === 'seen'

/** What the person asked does next, for the buttons and the sender's view. */
export const STATUS_LABELS: Record<RequestStatus, string> = {
  sent: 'Not seen yet',
  seen: 'Seen',
  done: 'Done',
  declined: "Can't do it",
}

/** Requests sent to this person that need something from them: unread first, then by due date. */
export function waitingOn<T extends Pick<Request, 'to_id' | 'status' | 'due_on' | 'created_at'>>(userId: string, requests: T[]): T[] {
  return requests.filter((r) => r.to_id === userId && isOpen(r)).sort(byUrgency)
}

/** Requests this person sent, open ones first. */
export function sentBy<T extends Pick<Request, 'from_id' | 'status' | 'due_on' | 'created_at'>>(userId: string, requests: T[]): T[] {
  return requests.filter((r) => r.from_id === userId).sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || byUrgency(a, b))
}

function byUrgency(a: Pick<Request, 'status' | 'due_on' | 'created_at'>, b: Pick<Request, 'status' | 'due_on' | 'created_at'>): number {
  const unread = Number(b.status === 'sent') - Number(a.status === 'sent')
  if (unread) return unread
  if (a.due_on !== b.due_on) return !a.due_on ? 1 : !b.due_on ? -1 : a.due_on.localeCompare(b.due_on)
  return a.created_at.localeCompare(b.created_at)
}

/** Days after sending that an unread request is flagged to the sender. */
export const UNSEEN_AFTER_DAYS = 2

/** Sent at least two days ago and still not opened. */
export const isOverlooked = (r: Pick<Request, 'status' | 'created_at'>, today: IsoDate, timeZone: string) => r.status === 'sent' && dayOf(r.created_at, timeZone) <= addDays(today, -UNSEEN_AFTER_DAYS)

export const isOverdue = (r: Pick<Request, 'status' | 'due_on'>, today: IsoDate) => isOpen(r) && !!r.due_on && r.due_on < today

/**
 * The agenda's Follow-ups: requests still open, plus those closed in the week before the meeting so
 * the bishopric hears they're done. Open first, oldest first.
 */
export function followUps<T extends Pick<Request, 'status' | 'closed_at' | 'created_at' | 'due_on'>>(date: IsoDate, requests: T[], timeZone: string): T[] {
  const since = addDays(date, -7)
  return requests
    .filter((r) => isOpen(r) || (r.closed_at && dayOf(r.closed_at, timeZone) >= since && dayOf(r.closed_at, timeZone) <= date))
    .sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || byUrgency(a, b))
}

/** "Seen · due Nov 12th", for a line under a request. */
export function requestStatusLine(r: Pick<Request, 'status' | 'due_on'>, today: IsoDate): string {
  const parts = [STATUS_LABELS[r.status]]
  if (r.due_on && isOpen(r)) parts.push(`${isOverdue(r, today) ? 'was due' : 'due'} ${longDate(r.due_on)}`)
  return parts.join(' · ')
}

// ---------------------------------------------------------------------------
// Calling requests
// ---------------------------------------------------------------------------

/** The choices a leader starts with, in the order shown. */
export const CALLING_REQUEST_KINDS: { kind: CallingRequestKind; label: string; hint: string }[] = [
  { kind: 'fill', label: 'A calling needs to be filled', hint: 'No one has it now' },
  { kind: 'replace', label: 'Release someone and call someone new', hint: 'Someone has it and needs to be released' },
  { kind: 'release', label: 'Release someone', hint: 'No one new is needed' },
  { kind: 'suggest', label: 'Suggest a name', hint: "For a calling the bishopric is already filling" },
]

export const needsRelease = (kind: CallingRequestKind) => kind === 'release' || kind === 'replace'
export const takesNames = (kind: CallingRequestKind) => kind !== 'release'

/** "Fill Primary Teacher", "Release Brother Hale as Primary Pianist". */
export function callingRequestSummary(r: Pick<CallingRequest, 'kind' | 'calling_title' | 'release_name'>): string {
  switch (r.kind) {
    case 'fill':
      return `Fill ${r.calling_title}`
    case 'release':
      return `Release ${r.release_name} as ${r.calling_title}`
    case 'replace':
      return `Release ${r.release_name} and call someone new as ${r.calling_title}`
    case 'suggest':
      return `Names for ${r.calling_title}`
  }
}

/** What a leader is told about their request. Never says who or what was decided. */
export const STAGE_LABELS: Record<CallingStage, string> = {
  sent: 'Sent',
  received: 'Received',
  in_progress: 'Being worked on',
  finished: 'Finished',
}

export const STAGE_HINTS: Record<CallingStage, string> = {
  sent: "The bishopric hasn't opened it yet.",
  received: 'The bishopric has it.',
  in_progress: 'The bishopric is working on it.',
  finished: 'The bishopric has finished with it.',
}

export const asStage = (stage: string): CallingStage => (stage in STAGE_LABELS ? (stage as CallingStage) : 'sent')

/** Calling requests not marked received yet, for whoever they were sent to (or anyone, given null). */
export function unreceived<T extends Pick<CallingRequest, 'received_at' | 'routed_to' | 'created_at'>>(requests: T[], userId: string | null = null): T[] {
  return requests.filter((r) => !r.received_at && (userId === null || r.routed_to.includes(userId))).sort((a, b) => a.created_at.localeCompare(b.created_at))
}
