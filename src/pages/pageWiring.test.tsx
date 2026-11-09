// The pages that load data and hand it to a view. The views have their own tests, so here each is
// a stand-in and the question is the wiring: does each action run the right query, then refresh?

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { sustainingSunday, todayIso, addDays } from '../lib/dates'
import * as queries from '../lib/queries'
import { supabase } from '../lib/supabase'
import { AgendaPage } from './AgendaPage'
import { AppointmentsPage } from './AppointmentsPage'
import { HomePage } from './HomePage'
import { HoursPage } from './HoursPage'
import { LengthsPage } from './LengthsPage'
import { MeetingsPage } from './MeetingsPage'
import { MessagesPage } from './MessagesPage'
import { RemindersPage } from './RemindersPage'
import { RequestsPage } from './RequestsPage'
import { SchedulePage } from './SchedulePage'
import { WhoBooksPage } from './WhoBooksPage'

type Props = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const stub = vi.hoisted(() => {
  const props: Record<string, Props> = {}
  return { props, auth: { value: {} as Props }, refresh: vi.fn() }
})

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => stub.auth.value }))
vi.mock('../lib/supabase', () => ({ supabase: { client: true }, WARD_TIME_ZONE: 'America/Denver' }))
vi.mock('../lib/errorReport')
vi.mock('../lib/queries')
vi.mock('../lib/schedule', async (original) => ({ ...(await original<object>()), nextMeeting: () => '2026-11-15', previousMeeting: () => '2026-11-01', followingMeeting: () => '2026-11-15' }))
vi.mock('../components/WaitingCount', () => ({ useRefreshWaiting: () => stub.refresh }))
vi.mock('../components/Setup', () => ({ SetupCard: () => null }))
vi.mock('../components/RequestsOnHome', () => ({ RequestsOnHome: () => null }))

/** A view that shows nothing and keeps its props for the test. */
vi.mock('../components/BishopricHome', () => ({ BishopricHome: (p: Props) => view('BishopricHome', p) }))
vi.mock('../components/SecretaryHome', () => ({ DAYS_AHEAD: 14, SecretaryHome: (p: Props) => view('SecretaryHome', p), UsualLengths: (p: Props) => view('UsualLengths', p) }))
vi.mock('../components/AgendaView', () => ({ AgendaView: (p: Props) => view('AgendaView', p) }))
vi.mock('../components/AppointmentsView', () => ({ AppointmentsView: (p: Props) => view('AppointmentsView', p), WhoSchedules: (p: Props) => view('WhoSchedules', p) }))
vi.mock('../components/HoursView', () => ({ DAYS_AHEAD: 14, HoursView: (p: Props) => view('HoursView', p) }))
vi.mock('../components/MeetingSetup', () => ({ MeetingCard: (p: Props) => view('MeetingCard', p), MeetingForm: (p: Props) => view('MeetingForm', p) }))
vi.mock('../components/Messages', () => ({ TemplatesEditor: (p: Props) => view('TemplatesEditor', p) }))
vi.mock('../components/Reminders', () => ({ Reminders: (p: Props) => view('Reminders', p) }))
vi.mock('../components/Requests', () => ({ RequestsView: (p: Props) => view('RequestsView', p) }))
vi.mock('../components/ScheduleEditor', () => ({ ScheduleEditor: (p: Props) => view('ScheduleEditor', p) }))

function view(name: string, props: Props) {
  stub.props[name] = props
  return <div data-testid={name} />
}

const q = queries as unknown as Record<string, Mock>
const me = { id: 'me', display_name: 'Avery' }
const template = { id: 't1', slug: 'bishopric', name: 'Bishopric', position: 1, sections: [{ id: 's1', title: 'A', position: 2 }] }
const other = { id: 't2', slug: 'ward-council', name: 'Ward Council', position: 2, sections: [] }
const DATE = '2026-11-08'

const show = (ui: ReactElement, path = '/', route = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={ui} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(stub.props)) delete stub.props[key]
  stub.auth.value = { roles: ['bishopric'], office: 'bishop', profile: me, templates: [template], reloadTemplates: vi.fn(), callingsHidden: false, organization: null, hasHours: true, setHasHours: vi.fn() }
  for (const fn of Object.values(q)) fn.mockReset?.()
  q.loadAppointments.mockResolvedValue({ appointments: [], assignments: [], bishopric: [{ id: 'l1', display_name: 'Leader' }], secretaries: [] })
  q.loadSundays.mockResolvedValue([])
  q.loadOpenAgendaItems.mockResolvedValue([])
  q.loadRotations.mockResolvedValue([])
  q.loadAbsences.mockResolvedValue([])
  q.loadHours.mockResolvedValue({ leaders: [{ id: 'l1' }], hours: [{ id: 'h1', user_id: 'me' }, { id: 'h2', user_id: 'me' }] })
  q.loadTemplates.mockResolvedValue([])
  q.loadLengths.mockResolvedValue([])
  q.loadSchedule.mockResolvedValue({ rotations: [], stewardships: [] })
  q.loadMeetingReminders.mockResolvedValue({ events: [], sent: [], agendas: [] })
  q.loadAgenda.mockResolvedValue({})
  q.loadRequests.mockResolvedValue([])
  q.loadProfiles.mockResolvedValue([])
  q.loadRecipients.mockResolvedValue([])
  q.loadCallingRequests.mockResolvedValue([])
  q.loadCallings.mockResolvedValue({ candidates: [{ id: 'k' }] })
  q.loadMyCallingRequests.mockResolvedValue([])
  q.loadCallingList.mockResolvedValue([])
  q.loadMyAssignments.mockResolvedValue([])
  q.loadBishopric.mockResolvedValue([])
  q.loadSecretaries.mockResolvedValue([{ id: 'x', office: 'executive_secretary' }, { id: 'y', office: 'ward_clerk' }])
  q.loadMeetingSetup.mockResolvedValue({ templates: [template, other] })
  q.saveAssignments.mockResolvedValue(['a1', 'a2'])
  q.sendRequest.mockResolvedValue('new-id')
  q.submitCallingRequest.mockResolvedValue('call-id')
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  window.scrollTo = vi.fn()
})

/** An action on the view, the query it should run, and the push it should send. */
type Case = { name: string; run: (actions: Props) => unknown; query: string; args: unknown[]; push?: [string, string][] }

const c = (name: string, run: Case['run'], query: string, args: unknown[], push?: [string, string][]): Case => ({ name, run, query, args, push })

const section = { id: 's1', kind: 'discussion' }
const candidate = { id: 'k1' }

type Page = { title: string; ui: ReactElement; path?: string; route?: string; auth?: Props; viewName: string; loader: string; refreshes?: boolean; actionsOf?: (p: Props) => Props; cases: Case[] }

const pages: Page[] = [
  {
    title: 'Home for a leader',
    ui: <HomePage />,
    viewName: 'BishopricHome',
    loader: 'loadAppointments',
    refreshes: true,
    cases: [
      c('requests an interview, not yet booked', (a) => a.requestInterview({ purpose: 'other' }), 'addAppointment', [{ purpose: 'other', scheduled_at: null }]),
      c('adds an item', (a) => a.addItem(section, 'Body', DATE), 'addAgendaItem', [section, 'Body', DATE]),
      c('reports an appointment as this person', (a) => a.report({ id: 'a' }, { outcome: 'done' }), 'reportAppointment', [{ id: 'a' }, { outcome: 'done' }, 'me']),
    ],
  },
  {
    title: 'Home for a secretary',
    ui: <HomePage />,
    auth: { office: 'executive_secretary' },
    viewName: 'SecretaryHome',
    loader: 'loadAppointments',
    refreshes: true,
    cases: [
      c('books a time', (a) => a.book('i', 'at', 30), 'updateAppointment', ['i', { scheduled_at: 'at', duration_minutes: 30 }]),
      c('changes a length', (a) => a.setLength('i', 15), 'updateAppointment', ['i', { duration_minutes: 15 }]),
      c('marks one confirmed', (a) => a.confirm('i'), 'markConfirmed', ['i']),
      c('offers times', (a) => a.offer('i', ['t']), 'markOffered', ['i', ['t']]),
      c('marks a youth with a parent', (a) => a.setYouth('i', true, 'Parent'), 'updateAppointment', ['i', { is_youth: true, parent_name: 'Parent' }]),
      c('lets offered times go', (a) => a.release('i'), 'releaseOffered', ['i']),
    ],
  },
  {
    title: 'Agenda',
    ui: <AgendaPage />,
    path: `/agenda/bishopric/${DATE}`,
    route: '/agenda/:slug/:date',
    viewName: 'AgendaView',
    loader: 'loadAgenda',
    cases: [
      c('saves assignments and tells each person asked', (a) => a.saveAssignments(['chg']), 'saveAssignments', ['t1', DATE, ['chg']], [['assignment_sent', 'a1'], ['assignment_sent', 'a2']]),
      c('records an answer', (a) => a.recordAnswer('a1', 'accepted', 'yes'), 'answerAssignment', ['a1', 'accepted', 'yes'], [['assignment_answered', 'a1']]),
      c('adds an item', (a) => a.addItem(section, 'B', null), 'addAgendaItem', [section, 'B', null]),
      c('resolves an item on the meeting date', (a) => a.resolveItem('i'), 'resolveAgendaItem', ['i', DATE]),
      c('adds a prayer name', (a) => a.addPrayerName('N'), 'addPrayerName', ['N']),
      c('removes a prayer name', (a) => a.removePrayerName('p'), 'removePrayerName', ['p', DATE]),
      c('adds a need', (a) => a.addNeed({ t: 1 }), 'addNeed', [{ t: 1 }]),
      c('updates a need', (a) => a.updateNeed('n', { t: 2 }), 'updateNeed', ['n', { t: 2 }]),
      c('deletes a need', (a) => a.deleteNeed('n'), 'deleteNeed', ['n']),
      c('adds a candidate under discussion', (a) => a.addCandidate('n', 'Name'), 'addCandidate', [{ need_id: 'n', person_name: 'Name', status: 'discussing' }]),
      c('updates a candidate', (a) => a.updateCandidate('k', { s: 1 }), 'updateCandidate', ['k', { s: 1 }]),
      c('sets someone apart today', (a) => a.setApart(candidate), 'setApart', ['k1', todayIso()]),
      c('accepts for the next sustaining Sunday', (a) => a.acceptCandidate(candidate), 'acceptCandidate', [candidate, sustainingSunday(todayIso())]),
      c('approves a candidate', (a) => a.approveCandidate(candidate), 'updateCandidate', ['k1', { status: 'approved' }]),
      c('assigns the appointment when approving with a leader', (a) => a.approveCandidate(candidate, 'l1'), 'assignCallingAppointment', [candidate, 'l1']),
      c('assigns an appointment', (a) => a.assignAppointment(candidate, 'l1'), 'assignCallingAppointment', [candidate, 'l1']),
      c('receives a calling request as this person', (a) => a.receiveCallingRequest('r'), 'receiveCallingRequest', ['r', 'me'], [['calling_request_received', 'r']]),
      c('turns an item into a request', (a) => a.assignItem({ id: 'i', body: 'B' }, 'to', 'due'), 'sendRequest', [{ to_id: 'to', title: 'B', details: null, due_on: 'due', agenda_item_id: 'i' }], [['request_sent', 'new-id']]),
    ],
  },
  {
    title: 'Requests',
    ui: <RequestsPage />,
    viewName: 'RequestsView',
    loader: 'loadRequests',
    refreshes: true,
    cases: [
      c('sends a request', (a) => a.send({ title: 'T' }), 'sendRequest', [{ title: 'T', agenda_item_id: null }], [['request_sent', 'new-id']]),
      c('answers a request', (a) => a.answer('r', 'done', 'ok'), 'answerRequest', ['r', 'done', 'ok'], [['request_answered', 'r']]),
      c('takes one back', (a) => a.takeBack('r'), 'deleteRequest', ['r']),
      c('receives a calling request', (a) => a.receive('r'), 'receiveCallingRequest', ['r', 'me'], [['calling_request_received', 'r']]),
      c('answers an assignment', (a) => a.answerAssignment('a', 'declined', 'no'), 'answerAssignment', ['a', 'declined', 'no'], [['assignment_answered', 'a']]),
      c('sends a calling request', (a) => a.sendCallingRequest({ f: 1 }), 'submitCallingRequest', [{ f: 1 }], [['calling_request_sent', 'call-id']]),
    ],
  },
  {
    title: 'Schedule',
    ui: <SchedulePage />,
    viewName: 'ScheduleEditor',
    loader: 'loadSchedule',
    cases: [
      c('saves a meeting', (a) => a.saveEvent({ e: 1 }, 'id'), 'saveEvent', [{ e: 1 }, 'id']),
      c('deletes a meeting', (a) => a.deleteEvent('id'), 'deleteEvent', ['id']),
      c('saves a rotation', (a) => a.saveRotation({ r: 1 }, 'id'), 'saveRotation', [{ r: 1 }, 'id']),
      c('deletes a rotation', (a) => a.deleteRotation('id'), 'deleteRotation', ['id']),
      c('adds a stewardship', (a) => a.addStewardship('u', 'area'), 'addStewardship', ['u', 'area']),
      c('deletes a stewardship', (a) => a.deleteStewardship('id'), 'deleteStewardship', ['id']),
    ],
  },
  {
    title: 'Appointments',
    ui: <AppointmentsPage />,
    viewName: 'AppointmentsView',
    loader: 'loadAppointments',
    cases: [
      c('schedules', (a) => a.schedule('i', 'at'), 'updateAppointment', ['i', { scheduled_at: 'at' }]),
      c('completes', (a) => a.complete('i'), 'updateAppointment', ['i', { status: 'completed' }]),
      c('cancels', (a) => a.cancel('i'), 'updateAppointment', ['i', { status: 'cancelled' }]),
      c('adds a youth interview as youth', (a) => a.add({ purpose: 'youth' }), 'addAppointment', [{ purpose: 'youth', is_youth: true }]),
      c('adds another kind as not youth', (a) => a.add({ purpose: 'other' }), 'addAppointment', [{ purpose: 'other', is_youth: false }]),
      c('adds a secretary', (a) => a.setSecretary('l', 's', true), 'addSecretary', ['l', 's']),
      c('removes a secretary', (a) => a.setSecretary('l', 's', false), 'removeSecretary', ['l', 's']),
    ],
  },
  {
    title: 'Reminders',
    ui: <RemindersPage />,
    path: `/?date=${DATE}`,
    viewName: 'Reminders',
    loader: 'loadAppointments',
    cases: [
      c('marks a reminder sent', (a) => a.remind('i', true), 'markReminded', ['i', true]),
      c('marks a meeting reminder for the day shown', (a) => a.remindMeeting('e', false), 'markMeetingReminded', ['e', DATE, false]),
    ],
  },
  {
    title: 'Message templates',
    ui: <MessagesPage />,
    viewName: 'TemplatesEditor',
    loader: 'loadTemplates',
    actionsOf: (p) => ({ save: p.onSave, remove: p.onDelete }),
    cases: [
      c('saves one', (a) => a.save({ t: 1 }), 'saveTemplate', [{ t: 1 }]),
      c('deletes one', (a) => a.remove('id'), 'deleteTemplate', ['id']),
    ],
  },
  {
    title: 'Usual lengths',
    ui: <LengthsPage />,
    viewName: 'UsualLengths',
    loader: 'loadLengths',
    actionsOf: (p) => ({ change: p.onChange }),
    cases: [c('sets a length', (a) => a.change('other', 25), 'setUsualLength', ['other', 25])],
  },
  {
    title: 'Who books for whom',
    ui: <WhoBooksPage />,
    viewName: 'WhoSchedules',
    loader: 'loadAppointments',
    actionsOf: (p) => ({ change: p.onChange }),
    cases: [
      c('adds a secretary', (a) => a.change('l', 's', true), 'addSecretary', ['l', 's']),
      c('removes a secretary', (a) => a.change('l', 's', false), 'removeSecretary', ['l', 's']),
    ],
  },
]

describe.each(pages)('$title', (page) => {
  const open = async () => {
    stub.auth.value = { ...stub.auth.value, ...page.auth }
    show(page.ui, page.path, page.route)
    await screen.findByTestId(page.viewName)
    const props = stub.props[page.viewName]
    return page.actionsOf ? page.actionsOf(props) : props.actions
  }

  it.each(page.cases)('$name', async ({ run, query, args, push }) => {
    const actions = await open()
    await act(async () => {
      await run(actions)
    })
    await waitFor(() => expect(q[query]).toHaveBeenCalledWith(supabase, ...args))
    await waitFor(() => expect(q[page.loader].mock.calls.length).toBeGreaterThan(1))
    if (page.refreshes) expect(stub.refresh).toHaveBeenCalled()
    for (const [event, id] of push ?? []) expect(q.pushAbout).toHaveBeenCalledWith(supabase, event, id)
  })

  it('shows why when it can\'t load', async () => {
    stub.auth.value = { ...stub.auth.value, ...page.auth }
    q[page.loader].mockRejectedValue(new Error('load failed'))
    show(page.ui, page.path, page.route)
    expect(await screen.findByText('load failed')).toBeInTheDocument()
  })

  it('shows why a save failed, and does not refresh', async () => {
    const { run, query } = page.cases[0]
    q[query].mockRejectedValue(new Error('save failed'))
    const actions = await open()
    await act(async () => {
      await run(actions)
    })
    expect(await screen.findByText('save failed')).toBeInTheDocument()
    expect(q[page.loader]).toHaveBeenCalledOnce()
    expect(stub.refresh).not.toHaveBeenCalled()
    expect(q.pushAbout).not.toHaveBeenCalled()
  })
})

describe('Home', () => {
  it('loads a leader\'s open items from the sections of their meetings', async () => {
    show(<HomePage />)
    await screen.findByTestId('BishopricHome')
    expect(q.loadOpenAgendaItems).toHaveBeenCalledWith(supabase, ['s1'])
    expect(stub.props.BishopricHome).toMatchObject({ userId: 'me', timeZone: 'America/Denver' })
  })

  it('merges what a secretary needs into one set of data', async () => {
    stub.auth.value = { ...stub.auth.value, office: 'executive_secretary' }
    q.loadSchedule.mockResolvedValue({ rotations: ['r'], stewardships: ['s'] })
    q.loadMeetingReminders.mockResolvedValue({ events: ['e'], sent: ['m'] })
    show(<HomePage />)
    await screen.findByTestId('SecretaryHome')
    expect(q.loadMeetingReminders).toHaveBeenCalledWith(supabase, addDays(todayIso(), 1))
    expect(stub.props.SecretaryHome.data).toMatchObject({ rotations: ['r'], stewardships: ['s'], events: ['e'], meetingsSent: ['m'] })
  })

  it('copes without a profile yet', async () => {
    stub.auth.value = { ...stub.auth.value, office: 'executive_secretary', profile: null }
    show(<HomePage />)
    await screen.findByTestId('SecretaryHome')
    expect(stub.props.SecretaryHome).toMatchObject({ userId: '', myName: '' })
  })
})

describe('Agenda', () => {
  it('sends an old date link on to the bishopric meeting', async () => {
    show(<AgendaPage />, `/agenda/${DATE}`, '/agenda/:slug')
    expect(await screen.findByTestId('where')).toHaveTextContent(`/agenda/bishopric/${DATE}`)
  })

  it('opens the next meeting when no date is given', async () => {
    show(<AgendaPage />, '/agenda/bishopric', '/agenda/:slug')
    await screen.findByTestId('AgendaView')
    expect(q.loadAgenda).toHaveBeenCalledWith(supabase, template, '2026-11-15')
    expect(screen.getByRole('link', { name: 'Upcoming' })).toHaveAttribute('href', '/agenda/bishopric')
  })

  it('offers a tab per meeting only when there is more than one', async () => {
    stub.auth.value = { ...stub.auth.value, templates: [template, other] }
    show(<AgendaPage />, '/agenda/ward-council', '/agenda/:slug')
    await screen.findByTestId('AgendaView')
    expect(q.loadAgenda).toHaveBeenCalledWith(supabase, other, '2026-11-15')
    expect(screen.getByRole('tab', { name: 'Bishopric' })).toHaveAttribute('href', '/agenda/bishopric')
  })

  it('falls back to the first meeting for an unknown one', async () => {
    show(<AgendaPage />, '/agenda/nope', '/agenda/:slug')
    await screen.findByTestId('AgendaView')
    expect(q.loadAgenda).toHaveBeenCalledWith(supabase, template, '2026-11-15')
  })

  it('does not assign an appointment when approving with no leader', async () => {
    show(<AgendaPage />, `/agenda/bishopric/${DATE}`, '/agenda/:slug/:date')
    await screen.findByTestId('AgendaView')
    await act(async () => {
      await stub.props.AgendaView.actions.approveCandidate(candidate)
    })
    expect(q.assignCallingAppointment).not.toHaveBeenCalled()
  })

  it('lets only someone who can see callings edit them', async () => {
    stub.auth.value = { ...stub.auth.value, callingsHidden: true }
    show(<AgendaPage />, `/agenda/bishopric/${DATE}`, '/agenda/:slug/:date')
    await screen.findByTestId('AgendaView')
    expect(stub.props.AgendaView).toMatchObject({ canEditCallings: false, callingsHidden: true })
  })
})

describe('Requests', () => {
  const leader = { roles: ['leader'], office: null }

  it('only loads what a leader can see', async () => {
    stub.auth.value = { ...stub.auth.value, ...leader }
    show(<RequestsPage />)
    await screen.findByTestId('RequestsView')
    expect(q.loadRecipients).not.toHaveBeenCalled()
    expect(q.loadCallingRequests).not.toHaveBeenCalled()
    expect(q.loadMyCallingRequests).toHaveBeenCalled()
    expect(stub.props.RequestsView).toMatchObject({ canSend: false, canAskCallings: true })
  })

  it('only loads what the bishopric can see', async () => {
    show(<RequestsPage />)
    await screen.findByTestId('RequestsView')
    expect(q.loadMyCallingRequests).not.toHaveBeenCalled()
    expect(stub.props.RequestsView.data.candidates).toEqual([{ id: 'k' }])
  })

  it.each([
    ['bishopric', 'request', 'request'],
    ['bishopric', 'calling', null],
    ['leader', 'calling', 'calling'],
    ['leader', 'request', null],
  ])('for %s, ?new=%s opens %s', async (role, param, startWith) => {
    stub.auth.value = { ...stub.auth.value, roles: [role], office: null }
    show(<RequestsPage />, `/?new=${param}`)
    await screen.findByTestId('RequestsView')
    expect(stub.props.RequestsView.startWith).toBe(startWith)
  })
})

describe('Hours', () => {
  const open = async (auth: Props = {}) => {
    stub.auth.value = { ...stub.auth.value, ...auth }
    show(<HoursPage />)
    await screen.findByTestId('HoursView')
    return stub.props.HoursView
  }
  const setHasHours = () => stub.auth.value.setHasHours as Mock

  it('shows a leader their own hours', async () => {
    expect(await open()).toMatchObject({ leaderId: 'me', selfId: 'me', firstTime: false })
  })

  it('welcomes a leader with no hours yet', async () => {
    expect(await open({ hasHours: false })).toMatchObject({ firstTime: true })
  })

  it('starts a secretary on the first leader, and can switch', async () => {
    const props = await open({ office: 'executive_secretary' })
    expect(props).toMatchObject({ leaderId: 'l1', selfId: undefined, firstTime: false })
    act(() => props.onLeader('l2'))
    expect(stub.props.HoursView.leaderId).toBe('l2')
  })

  it('says so when no leader has signed in', async () => {
    q.loadHours.mockResolvedValue({ leaders: [], hours: [] })
    stub.auth.value = { ...stub.auth.value, office: 'executive_secretary' }
    show(<HoursPage />)
    expect(await screen.findByText('No bishop or counselors have signed in yet.')).toBeInTheDocument()
  })

  it('notes that a leader now has hours', async () => {
    const { actions } = await open()
    await act(async () => {
      await expect(actions.addUsual(1, 'block')).resolves.toBe(true)
    })
    expect(q.addUsualHours).toHaveBeenCalledWith(supabase, 'me', 1, 'block')
    expect(setHasHours()).toHaveBeenCalledWith(true)
  })

  it('does not count a secretary\'s edits as the leader\'s own', async () => {
    const { actions } = await open({ office: 'executive_secretary' })
    await act(async () => {
      await actions.addUsual(1, 'block')
      await actions.deleteUsual('h1')
    })
    expect(setHasHours()).not.toHaveBeenCalled()
  })

  it('still has hours after deleting one of several', async () => {
    const { actions } = await open()
    await act(async () => {
      await actions.deleteUsual('h1')
    })
    expect(q.deleteUsualHours).toHaveBeenCalledWith(supabase, 'h1')
    expect(setHasHours()).toHaveBeenCalledWith(true)
  })

  it('has no hours after deleting the last', async () => {
    q.loadHours.mockResolvedValue({ leaders: [], hours: [{ id: 'h1', user_id: 'me' }] })
    const { actions } = await open()
    await act(async () => {
      await actions.deleteUsual('h1')
    })
    expect(setHasHours()).toHaveBeenCalledWith(false)
  })

  it('does not change anything when a save fails', async () => {
    q.addUsualHours.mockRejectedValue(new Error('save failed'))
    const { actions } = await open()
    await act(async () => {
      await expect(actions.addUsual(1, 'b')).resolves.toBe(false)
    })
    expect(setHasHours()).not.toHaveBeenCalled()
    expect(await screen.findByText('save failed')).toBeInTheDocument()
  })

  it.each([
    ['adds a day', (a: Props) => a.addDay('d', 'b'), 'addDayHours', ['me', 'd', 'b']],
    ['marks a day off', (a: Props) => a.dayOff('d'), 'markDayOff', ['me', 'd']],
    ['resets a day', (a: Props) => a.resetDay('d'), 'resetDay', ['me', 'd']],
  ] as const)('%s for the leader shown', async (_name, run, query, args) => {
    const { actions } = await open()
    await act(async () => {
      await run(actions)
    })
    await waitFor(() => expect(q[query]).toHaveBeenCalledWith(supabase, ...args))
  })
})

describe('Schedule', () => {
  it('offers only the real secretaries', async () => {
    show(<SchedulePage />)
    await screen.findByTestId('ScheduleEditor')
    expect(stub.props.ScheduleEditor.data.secretaries).toEqual([{ id: 'x', office: 'executive_secretary' }])
    expect(stub.props.ScheduleEditor.canEdit).toBe(true)
  })
})

describe('Reminders', () => {
  const heading = (name: string) => expect(screen.getByRole('heading', { name })).toBeInTheDocument()

  it('defaults to tomorrow', async () => {
    show(<RemindersPage />)
    await screen.findByTestId('Reminders')
    heading('Reminders for tomorrow')
    expect(q.loadMeetingReminders).toHaveBeenCalledWith(supabase, addDays(todayIso(), 1))
  })

  it('ignores a date that is not one', async () => {
    show(<RemindersPage />, '/?date=soon')
    await screen.findByTestId('Reminders')
    heading('Reminders for tomorrow')
  })

  it('says today when it is', async () => {
    show(<RemindersPage />, `/?date=${todayIso()}`)
    await screen.findByTestId('Reminders')
    heading('Reminders for today')
  })

  it('names any other day', async () => {
    show(<RemindersPage />, `/?date=${addDays(todayIso(), 5)}`)
    await screen.findByTestId('Reminders')
    expect(screen.getByRole('heading').textContent).toMatch(/^Reminders for \w+, /)
  })

  it('names the leader, or says none is assigned', async () => {
    show(<RemindersPage />, `/?date=${DATE}`)
    await screen.findByTestId('Reminders')
    expect(stub.props.Reminders.leaderName('l1')).toBe('Leader')
    expect(stub.props.Reminders.leaderName(null)).toBe('Unassigned')
  })
})

describe('Who books for whom', () => {
  it('just says so when one secretary books for everyone', async () => {
    q.loadAppointments.mockResolvedValue({ appointments: [], assignments: [], bishopric: [], secretaries: [{ id: 's', display_name: 'Brother Quinn', office: 'executive_secretary' }] })
    show(<WhoBooksPage />)
    expect(await screen.findByText(/Brother Quinn is the only executive secretary/)).toBeInTheDocument()
    expect(screen.queryByTestId('WhoSchedules')).not.toBeInTheDocument()
  })
})

describe('Meetings', () => {
  const open = async () => {
    show(<MeetingsPage />)
    await screen.findAllByTestId('MeetingCard')
    return stub.props.MeetingCard.actions as Props
  }
  const reloadTemplates = () => stub.auth.value.reloadTemplates as Mock

  it.each([
    ['saves a meeting', (a: Props) => a.saveMeeting('t', { n: 1 }), 'updateAgendaTemplate', ['t', { n: 1 }]],
    ['adds a section after the last', (a: Props) => a.addSection(template, 'discussion', 'New'), 'addAgendaSection', [{ template_id: 't1', position: 3, kind: 'discussion', title: 'New' }]],
    ['renames a section', (a: Props) => a.renameSection('s', 'New'), 'renameAgendaSection', ['s', 'New']],
    ['deletes a meeting', (a: Props) => a.deleteMeeting(template), 'deleteAgendaTemplate', ['t1']],
    ['deletes a section', (a: Props) => a.deleteSection({ id: 's', title: 'A' }), 'deleteAgendaSection', ['s']],
    ['adds someone', (a: Props) => a.addAttendee('t', 'u'), 'addAttendee', ['t', 'u']],
    ['removes someone', (a: Props) => a.removeAttendee('t', 'u'), 'removeAttendee', ['t', 'u']],
  ] as const)('%s and reloads the meetings', async (_name, run, query, args) => {
    const actions = await open()
    await act(async () => {
      await run(actions)
    })
    await waitFor(() => expect(q[query]).toHaveBeenCalledWith(supabase, ...args))
    await waitFor(() => expect(reloadTemplates()).toHaveBeenCalled())
  })

  it('reorders sections', async () => {
    const two = { ...template, sections: [{ id: 'a', position: 1 }, { id: 'b', position: 2 }] }
    const actions = await open()
    await act(async () => {
      await actions.moveSection(two, 'b', -1)
    })
    expect(q.reorderAgendaSections).toHaveBeenCalledWith(supabase, 't1', ['b', 'a'])
  })

  it.each([
    ['meeting', (a: Props) => a.deleteMeeting(template), 'deleteAgendaTemplate'],
    ['section', (a: Props) => a.deleteSection({ id: 's', title: 'A' }), 'deleteAgendaSection'],
  ] as const)('deletes no %s without a yes', async (_name, run, query) => {
    vi.mocked(window.confirm).mockReturnValue(false)
    run(await open())
    expect(q[query]).not.toHaveBeenCalled()
  })

  it('scrolls up to the error when a save fails', async () => {
    q.renameAgendaSection.mockRejectedValue(new Error('save failed'))
    const actions = await open()
    await act(async () => {
      await actions.renameSection('s', 'New')
    })
    expect(await screen.findByText('save failed')).toBeInTheDocument()
    expect(window.scrollTo).toHaveBeenCalled()
    expect(reloadTemplates()).not.toHaveBeenCalled()
  })

  it('shows why when it can\'t load', async () => {
    q.loadMeetingSetup.mockRejectedValue(new Error('load failed'))
    show(<MeetingsPage />)
    expect(await screen.findByText('load failed')).toBeInTheDocument()
  })

  it('creates a meeting with its own address, after the others', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'New meeting' }))
    expect(screen.queryByRole('button', { name: 'New meeting' })).not.toBeInTheDocument()
    await act(async () => {
      stub.props.MeetingForm.onSubmit({ name: 'Bishopric' })
    })
    expect(q.createAgendaTemplate).toHaveBeenCalledWith(supabase, expect.objectContaining({ name: 'Bishopric', position: 3 }))
    expect(q.createAgendaTemplate.mock.calls[0][1].slug).not.toBe('bishopric')
    expect(screen.queryByTestId('MeetingForm')).not.toBeInTheDocument()
  })

  it('puts the form away on cancel', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'New meeting' }))
    act(() => stub.props.MeetingForm.onCancel())
    expect(screen.queryByTestId('MeetingForm')).not.toBeInTheDocument()
    expect(q.createAgendaTemplate).not.toHaveBeenCalled()
  })
})
