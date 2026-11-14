// What to capture. Add a line here to add a shot; `npm run screenshots` does the rest.
// Only invented @ward.test accounts from supabase/seed.sql are ever signed in.

import type { Page } from 'playwright'

export const ROLES = {
  bishop: { email: 'bishop@ward.test', label: 'Bishop' },
  counselor: { email: 'first@ward.test', label: 'Counselor' },
  secretary: { email: 'secretary@ward.test', label: 'Executive secretary' },
  leader: { email: 'eqpres@ward.test', label: 'Ward leader (Elders Quorum president)' },
  admin: { email: 'bishop@ward.test', label: 'Bishop (also a ward admin)' },
} as const

export type RoleName = keyof typeof ROLES

export type Shot = {
  /** File name stem and manifest key: `<feature>-<phone|desktop>-<light|dark>.webp`. */
  feature: string
  role: RoleName
  route: string
  caption: string
  /** Wait for this text to show before capturing (catches pages still loading). */
  waitFor: string | RegExp
  /** Click or scroll first. Runs after the page has loaded. */
  prepare?: (page: Page) => Promise<void>
  /** Only these form factors ('phone' | 'desktop'). Default: both. */
  only?: ('phone' | 'desktop')[]
}

const scrollToText = (text: string | RegExp) => async (page: Page) => {
  await page.getByText(text).first().evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await page.evaluate(() => window.scrollBy(0, -70))
}

export const SHOTS: Shot[] = [
  { feature: 'home-bishop', role: 'bishop', route: '/home', caption: "The bishop's Home: the day's appointments, quick actions and the week ahead.", waitFor: /Good|Today|This week/i },
  { feature: 'home-counselor', role: 'counselor', route: '/home', caption: "A counselor's Home: their own interviews and what is waiting for them.", waitFor: /Good|Today|This week/i },
  { feature: 'home-secretary', role: 'secretary', route: '/home', caption: "The executive secretary's Home: who needs an appointment, open times and the week ahead.", waitFor: /schedule|Good|week/i },
  { feature: 'home-leader', role: 'leader', route: '/requests', caption: 'A called leader starts on Requests, where they see what the bishopric has asked and can ask for calling changes.', waitFor: /Got it|New|Sent|Seen|calling/ },

  { feature: 'agenda-bishopric', role: 'bishop', route: '/agenda/bishopric', caption: 'The bishopric meeting agenda with every section ready to fill in.', waitFor: /Action \/ discussion items/ },
  { feature: 'agenda-bishopric-callings', role: 'bishop', route: '/agenda/bishopric', caption: 'Callings are worked on the bishopric agenda: one card per calling, showing where it stands and its next step.', waitFor: /Action \/ discussion items/, prepare: scrollToText(/^Callings to fill$/) },
  { feature: 'agenda-bishopric-assignments', role: 'secretary', route: '/agenda/bishopric/2026-11-08', caption: 'Prayers and the spiritual thought go to someone picked from a list, who accepts or declines.', waitFor: /Bishopric Meeting Agenda/ },
  { feature: 'agenda-ward-council', role: 'bishop', route: '/agenda/ward-council', caption: 'Ward council agenda, with a section for each organization.', waitFor: /General business/ },
  { feature: 'agenda-ward-council-leader', role: 'leader', route: '/agenda/ward-council', caption: 'Called leaders who attend ward council see only that agenda.', waitFor: /General business/ },

  { feature: 'sacrament', role: 'bishop', route: '/sacrament', caption: 'Sacrament meeting planning: upcoming Sundays, speakers and hymns.', waitFor: /Sacrament meetings/ },
  { feature: 'appointments', role: 'secretary', route: '/appointments', caption: 'Appointments: who still needs a time, and what is booked.', waitFor: /To schedule/ },
  {
    feature: 'appointments-booking',
    role: 'secretary',
    route: '/appointments',
    caption: 'Booking an appointment for a leader.',
    waitFor: /To schedule/,
    prepare: scrollToText(/Add an appointment/),
  },

  { feature: 'requests-sent', role: 'bishop', route: '/requests', caption: "Requests you've sent, and whether each has been seen or finished.", waitFor: /Got it|New|Sent|Seen|calling/ },
  {
    feature: 'requests-received',
    role: 'secretary',
    route: '/requests',
    caption: 'A request you were sent: tap Got it to say you have seen it, or It’s done when finished.',
    waitFor: /Got it/,
  },
  { feature: 'requests-assignment', role: 'leader', route: '/requests', caption: 'Asked to give a prayer or the spiritual thought: accept, or decline and say why.', waitFor: /Accept/ },
  {
    feature: 'requests-calling',
    role: 'leader',
    route: '/requests?new=calling',
    caption: 'A ward leader asking the bishopric to fill or change a calling.',
    waitFor: /What do you need/,
  },
  { feature: 'requests-calling-tracking', role: 'leader', route: '/requests', caption: 'A leader follows each calling request: sent, received, being worked on, finished.', waitFor: /Got it|New|Sent|Seen|calling/ },

  { feature: 'settings', role: 'bishop', route: '/settings', caption: 'Settings, grouped by what each person can change.', waitFor: /Standing schedule/ },
  { feature: 'settings-schedule', role: 'bishop', route: '/schedule', caption: 'The standing schedule: regular meetings, rotations and assignments.', waitFor: /Bishopric meeting/ },
  { feature: 'settings-hours', role: 'counselor', route: '/hours', caption: 'Appointment hours: when a leader can meet, which secretaries book from.', waitFor: /Appointment hours|hours/i },
  { feature: 'settings-away', role: 'counselor', route: '/away', caption: "Dates you'll be away are taken out of your appointment hours.", waitFor: /away/i },
  { feature: 'settings-lengths', role: 'bishop', route: '/settings/lengths', caption: 'Usual lengths: how long each kind of interview takes.', waitFor: /length|minutes/i },
  { feature: 'settings-who-books', role: 'bishop', route: '/settings/who-books', caption: 'Who books for whom: which secretary schedules each leader.', waitFor: /Who books for whom/ },
  { feature: 'settings-notifications', role: 'bishop', route: '/account', caption: 'Choose which notifications this device gets: tomorrow’s summary, how did today go, and more.', waitFor: /notification/i, prepare: scrollToText(/^Your day$/i) },
  { feature: 'settings-account', role: 'bishop', route: '/account', caption: 'Your account: your name, Face ID or fingerprint sign-in, and notifications for this device.', waitFor: /Your name/ },
  { feature: 'settings-messages', role: 'secretary', route: '/settings/messages', caption: 'Message templates the secretaries use to offer times and send reminders.', waitFor: /Shared by the bishopric/ },
  { feature: 'settings-meetings', role: 'bishop', route: '/meetings', caption: 'Meetings: create an agenda, choose its sections and who attends.', waitFor: /Meetings/ },
  { feature: 'settings-calling-list', role: 'admin', route: '/calling-list', caption: "The calling list: the ward's callings and the organization each belongs to.", waitFor: /Add a calling/ },
  { feature: 'reminders', role: 'secretary', route: '/reminders?date=2026-11-02', caption: 'Reminders to send the day before, each with the message ready to copy, text or email.', waitFor: /Reminders for/ },
  { feature: 'handover-bishop', role: 'admin', route: '/settings/handover', caption: 'Change of bishopric starts with one question: who is the new bishop?', waitFor: /Who's the new bishop/ },
  { feature: 'handover-leader', role: 'bishop', route: '/settings/leader', caption: 'Change a ward leader: pick the organization, then the new leader.', waitFor: /Which organization/ },
  { feature: 'mentoring-mentor', role: 'counselor', route: '/account', caption: 'A mentor chooses whether to use Ward Desk as themselves or for the new bishop.', waitFor: /Use Ward Desk as/ },
  { feature: 'mentoring-bishop', role: 'bishop', route: '/account', caption: 'The new bishop sees who is helping, sets the last day, and decides whether they see callings.', waitFor: /Can see callings/, prepare: scrollToText(/Can use Ward Desk as you/) },
  { feature: 'settings-access', role: 'admin', route: '/access', caption: 'Who can sign in, with their roles and positions.', waitFor: /Bishop Avery|bishop@ward.test/ },
]
