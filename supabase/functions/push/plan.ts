// Who a change to a request should notify, and what the notification says. Pure and free of
// imports so the Edge Function (Deno) and the unit tests (Vitest) share it.
//
// Notifications show on lock screens, so they never name a member or say what was asked. They say
// what kind of thing happened and point to the app.

export type PushEvent = 'request_sent' | 'request_answered' | 'calling_request_sent' | 'calling_request_received'

export const PUSH_EVENTS: PushEvent[] = ['request_sent', 'request_answered', 'calling_request_sent', 'calling_request_received']

export type Office = 'bishop' | 'first_counselor' | 'second_counselor' | 'executive_secretary' | 'assistant_executive_secretary' | 'ward_clerk' | null

export type RequestRow = { id: string; from_id: string; to_id: string; status: 'sent' | 'seen' | 'done' | 'declined'; updated_at: string }
export type CallingRequestRow = { id: string; requested_by: string; routed_to: string[]; received_by: string | null; received_at: string | null; created_at: string }

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
export function planPush(event: PushEvent, row: RequestRow | CallingRequestRow, callerId: string, callerOffice: Office, now: Date): PushPlan {
  switch (event) {
    case 'request_sent': {
      const r = row as RequestRow
      if (r.from_id !== callerId) return { skip: 'only the sender announces a request' }
      if (r.status !== 'sent' || !fresh(r.updated_at, now)) return { skip: 'not newly sent' }
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
      return {
        key: `calling:${r.id}:received`,
        to: [r.requested_by],
        message: { title: 'Calling request received', body: 'The bishopric has your calling request.', url: '/requests', tag: `calling-${r.id}` },
      }
    }
  }
}
