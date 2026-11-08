// Who a change to a request should notify, and what the notification says. Pure and free of
// imports so the Edge Function (Deno) and the unit tests (Vitest) share it.
//
// Notifications show on lock screens, so they never name a member or say what was asked. They say
// what kind of thing happened and point to the app.

export type PushEvent = 'request_sent' | 'request_answered' | 'calling_request_sent' | 'calling_request_received' | 'assignment_sent' | 'assignment_answered'

export const PUSH_EVENTS: PushEvent[] = ['request_sent', 'request_answered', 'calling_request_sent', 'calling_request_received', 'assignment_sent', 'assignment_answered']

/** The table each event's id points into. */
export const tableFor = (event: PushEvent) => (event.startsWith('calling_') ? 'calling_requests' : event.startsWith('assignment_') ? 'agenda_assignments' : 'requests')

export type Office = 'bishop' | 'first_counselor' | 'second_counselor' | 'executive_secretary' | 'assistant_executive_secretary' | 'ward_clerk' | null

export type RequestRow = { id: string; from_id: string | null; to_id: string | null; status: 'sent' | 'seen' | 'done' | 'declined'; updated_at: string }
export type AssignmentRow = { id: string; assignee_id: string; assigned_by: string | null; answered_by: string | null; status: 'asked' | 'accepted' | 'declined'; updated_at: string }
export type CallingRequestRow = { id: string; requested_by: string | null; routed_to: string[]; received_by: string | null; received_at: string | null; created_at: string }

export type PushMessage = { title: string; body: string; url: string; tag: string }
export type PushPlan = { key: string; to: string[]; message: PushMessage } | { skip: string }

/** Only a change made in the last few minutes notifies, so an old one can't be replayed. */
export const FRESH_MINUTES = 10

const SENDERS: Record<Exclude<Office, null>, string> = {
  bishop: 'The bishop',
  first_counselor: 'The first counselor',
  second_counselor: 'The second counselor',
  executive_secretary: 'The executive secretary',
  assistant_executive_secretary: 'The assistant executive secretary',
  ward_clerk: 'The ward clerk',
}

export const senderLabel = (office: Office) => (office ? SENDERS[office] : 'A member of the bishopric')

const fresh = (at: string | null, now: Date) => !!at && now.getTime() - new Date(at).getTime() <= FRESH_MINUTES * 60_000

const ANSWERS: Record<Exclude<RequestRow['status'], 'sent'>, string> = {
  seen: 'Your request was seen.',
  done: 'Your request is done.',
  declined: "Your request couldn't be done. Open Ward Desk to see why.",
}

/**
 * What to send for this event, given the row as it is now and who is asking. The caller must be
 * the person who just made the change; anyone else gets a skip.
 */
export function planPush(event: PushEvent, row: RequestRow | CallingRequestRow | AssignmentRow, callerId: string, callerOffice: Office, now: Date): PushPlan {
  switch (event) {
    case 'request_sent': {
      const r = row as RequestRow
      if (r.from_id !== callerId) return { skip: 'only the sender announces a request' }
      if (r.status !== 'sent' || !fresh(r.updated_at, now)) return { skip: 'not newly sent' }
      if (!r.to_id) return { skip: 'the person asked is no longer a member' }
      return {
        // Keyed by recipient, so handing it to someone new tells them too.
        key: `request:${r.id}:sent:${r.to_id}`,
        to: [r.to_id],
        message: { title: 'New request', body: `${senderLabel(callerOffice)} asked you to do something. Open Ward Desk to see it.`, url: '/requests', tag: `request-${r.id}` },
      }
    }
    case 'request_answered': {
      const r = row as RequestRow
      if (r.to_id !== callerId) return { skip: 'only the person asked answers' }
      if (r.status === 'sent' || !fresh(r.updated_at, now)) return { skip: 'not newly answered' }
      if (!r.from_id) return { skip: 'the sender is no longer a member' }
      return {
        key: `request:${r.id}:${r.status}`,
        to: [r.from_id],
        message: { title: 'Request update', body: ANSWERS[r.status], url: '/requests', tag: `request-${r.id}` },
      }
    }
    case 'calling_request_sent': {
      const r = row as CallingRequestRow
      if (r.requested_by !== callerId) return { skip: 'only the leader who asked announces it' }
      if (!fresh(r.created_at, now) || !r.routed_to.length) return { skip: 'not newly sent' }
      return {
        key: `calling:${r.id}:sent`,
        to: r.routed_to,
        message: { title: 'New calling request', body: 'A ward leader sent a calling request. Open Ward Desk to see it.', url: '/requests', tag: `calling-${r.id}` },
      }
    }
    case 'calling_request_received': {
      const r = row as CallingRequestRow
      if (r.received_by !== callerId) return { skip: 'only whoever received it announces it' }
      if (!fresh(r.received_at, now)) return { skip: 'not newly received' }
      if (!r.requested_by) return { skip: 'the leader who asked is no longer a member' }
      return {
        key: `calling:${r.id}:received`,
        to: [r.requested_by],
        message: { title: 'Calling request received', body: 'The bishopric has your calling request.', url: '/requests', tag: `calling-${r.id}` },
      }
    }
    case 'assignment_sent': {
      const a = row as AssignmentRow
      if (a.assigned_by !== callerId) return { skip: 'only whoever gave it out announces it' }
      if (a.assignee_id === callerId) return { skip: 'took it themselves' }
      if (a.status !== 'asked' || !fresh(a.updated_at, now)) return { skip: 'not newly given out' }
      return {
        // Keyed by when, so asking again after handing it around tells them again.
        key: `assignment:${a.id}:sent:${a.assignee_id}:${a.updated_at}`,
        to: [a.assignee_id],
        message: {
          title: 'Meeting assignment',
          body: `${senderLabel(callerOffice)} asked you to take part in a meeting. Open Ward Desk to accept or decline.`,
          url: '/requests',
          tag: `assignment-${a.id}`,
        },
      }
    }
    case 'assignment_answered': {
      const a = row as AssignmentRow
      // The person asked, or an attendee who recorded their answer after asking them by text.
      if (a.answered_by !== callerId) return { skip: 'only whoever answered announces it' }
      if (a.status === 'asked' || !fresh(a.updated_at, now)) return { skip: 'not newly answered' }
      if (!a.assigned_by || a.assigned_by === callerId) return { skip: 'no one else to tell' }
      return {
        key: `assignment:${a.id}:${a.status}:${a.updated_at}`,
        to: [a.assigned_by],
        message: {
          title: 'Meeting assignment',
          body: a.status === 'accepted' ? 'Your meeting assignment was accepted.' : 'Your meeting assignment was declined. Open Ward Desk to ask someone else.',
          url: '/agenda',
          tag: `assignment-${a.id}`,
        },
      }
    }
  }
}

/** What the new bishop is told when his mentor did something for him. General, like the rest. */
export const mentorMessage = (message: PushMessage): PushMessage => ({
  title: 'Your mentor helped',
  body: 'Your mentor made a change for you in Ward Desk. Open it to see.',
  url: message.url,
  tag: `${message.tag}-mentor`,
})
