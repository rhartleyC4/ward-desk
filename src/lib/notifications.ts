// Every kind of notification Ward Desk sends, who it can go to, and how it's described on the
// Notifications switches. Each person can turn any of them off (notification_mutes); the senders
// (supabase/functions/push and scripts/notify) skip what they turned off.

import { canAskForCallings, canSendRequests, isSecretaryOffice, LEADER_OFFICES, type AppRole } from './access'
import type { Enums } from './database.types'

export type NotificationKind =
  | 'request_sent'
  | 'request_answered'
  | 'request_due'
  | 'calling_request_sent'
  | 'calling_request_received'
  | 'calling_request_progress'
  | 'callings_to_record'
  | 'day_summary'
  | 'report_due'
  | 'reminders'
  | 'appointment_to_book'
  | 'appointment_sent_back'
  | 'away_conflict'
  | 'appointment_booked'
  | 'appointment_changed'
  | 'appointment_handed_over'
  | 'short_sunday'
  | 'assignment_sent'
  | 'assignment_answered'

type Office = Enums<'bishopric_office'> | null

export type NotificationGroup = 'Your day' | 'Sundays' | 'Appointments' | 'Requests' | 'Callings'

export type NotificationInfo = {
  kind: NotificationKind
  group: NotificationGroup
  label: string
  hint: string
  /** Whether this person could ever be sent it, so only those switches show. */
  for: (roles: AppRole[], office: Office) => boolean
}

const bishopric = (roles: AppRole[]) => roles.includes('bishopric')
const holdsInterviews = (roles: AppRole[], office: Office) => bishopric(roles) && !!office && LEADER_OFFICES.includes(office)
const books = (roles: AppRole[], office: Office) => bishopric(roles) && isSecretaryOffice(office)
const anyone = (roles: AppRole[]) => roles.length > 0

export const NOTIFICATIONS: NotificationInfo[] = [
  { kind: 'day_summary', group: 'Your day', label: 'Tomorrow’s summary', hint: 'The evening before: meetings, conducting and appointments', for: bishopric },
  { kind: 'report_due', group: 'Your day', label: 'How did today go?', hint: 'After your last appointment, to mark each done or missed', for: holdsInterviews },
  { kind: 'reminders', group: 'Your day', label: 'Reminders to send', hint: 'The day before, when appointment or meeting reminders are waiting', for: books },

  { kind: 'short_sunday', group: 'Sundays', label: 'Short-handed Sundays', hint: 'When away dates leave only one of the bishopric, or none, at church on a Sunday', for: bishopric },

  { kind: 'appointment_to_book', group: 'Appointments', label: 'New appointments to book', hint: 'When a leader adds one, or one is handed to a leader you book for', for: books },
  { kind: 'appointment_sent_back', group: 'Appointments', label: 'Missed and sent back', hint: 'When a leader asks you to find a new time', for: books },
  { kind: 'away_conflict', group: 'Appointments', label: 'Away during booked times', hint: 'When a leader’s away dates cover appointments already booked', for: books },
  { kind: 'appointment_booked', group: 'Appointments', label: 'Booked for today or tomorrow', hint: 'When one is booked after tomorrow’s summary went out', for: holdsInterviews },
  { kind: 'appointment_changed', group: 'Appointments', label: 'Moved or cancelled', hint: 'When a booked time changes or is let go', for: holdsInterviews },
  { kind: 'appointment_handed_over', group: 'Appointments', label: 'Handed to you', hint: 'When another leader’s appointment is given to you', for: holdsInterviews },

  { kind: 'request_sent', group: 'Requests', label: 'New requests', hint: 'When someone in the bishopric asks you to do something', for: anyone },
  { kind: 'request_due', group: 'Requests', label: 'Due tomorrow', hint: 'The day before a request you haven’t finished is due', for: anyone },
  { kind: 'request_answered', group: 'Requests', label: 'Answers to your requests', hint: 'When someone sees, finishes or can’t do one', for: canSendRequests },
  { kind: 'assignment_sent', group: 'Requests', label: 'Meeting assignments', hint: 'When you’re asked to give a prayer or the spiritual thought', for: anyone },
  { kind: 'assignment_answered', group: 'Requests', label: 'Answers to meeting assignments', hint: 'When someone accepts or declines a prayer or spiritual thought', for: bishopric },

  { kind: 'calling_request_sent', group: 'Callings', label: 'New calling requests', hint: 'When a ward leader sends one to you', for: bishopric },
  { kind: 'callings_to_record', group: 'Callings', label: 'Callings to record', hint: 'Sunday afternoon, when callings were sustained or people released', for: (roles, office) => bishopric(roles) && office === 'ward_clerk' },
  { kind: 'calling_request_received', group: 'Callings', label: 'Request received', hint: 'When the bishopric has your calling request', for: canAskForCallings },
  { kind: 'calling_request_progress', group: 'Callings', label: 'Request progress', hint: 'When the bishopric starts on it, and when it’s finished', for: canAskForCallings },
]

export const NOTIFICATION_GROUPS: NotificationGroup[] = ['Your day', 'Sundays', 'Appointments', 'Requests', 'Callings']

/** The switches this person sees, in order, grouped. Groups with none are left out. */
export function notificationsFor(roles: AppRole[], office: Office): { group: NotificationGroup; items: NotificationInfo[] }[] {
  const mine = NOTIFICATIONS.filter((n) => n.for(roles, office))
  return NOTIFICATION_GROUPS.map((group) => ({ group, items: mine.filter((n) => n.group === group) })).filter((g) => g.items.length)
}
