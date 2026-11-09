import { useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { ErrorNote, Loading } from '../components/Layout'
import { RequestsView, type RequestsActions } from '../components/Requests'
import { canAskForCallings, canSendRequests } from '../lib/access'
import * as q from '../lib/queries'
import { supabase, WARD_TIME_ZONE } from '../lib/supabase'
import { useAction, useAsync } from '../lib/useAsync'
import { wardToday } from '../lib/wardToday'
import { useRefreshWaiting } from '../components/WaitingCount'

export function RequestsPage() {
  const { roles, profile, organization } = useAuth()
  const userId = profile?.id ?? ''
  const today = wardToday()
  const canSend = canSendRequests(roles)
  const canAsk = canAskForCallings(roles)
  const [params] = useSearchParams()
  const startWith = params.get('new') === 'request' && canSend ? 'request' : params.get('new') === 'calling' && canAsk ? 'calling' : null
  const refreshBadge = useRefreshWaiting()

  const { data, error, reload } = useAsync(async () => {
    const none = Promise.resolve([])
    const [requests, people, recipients, callingRequests, callings, myCallingRequests, callingList, myAssignments] = await Promise.all([
      q.loadRequests(supabase),
      q.loadProfiles(supabase),
      canSend ? q.loadRecipients(supabase) : none,
      canSend ? q.loadCallingRequests(supabase) : none,
      canSend ? q.loadCallings(supabase) : Promise.resolve({ candidates: [] }),
      canAsk ? q.loadMyCallingRequests(supabase) : none,
      canAsk ? q.loadCallingList(supabase) : none,
      q.loadMyAssignments(supabase),
    ])
    return { requests, people, recipients, callingRequests, candidates: callings.candidates, myCallingRequests, callings: callingList, myAssignments }
  }, [canSend, canAsk])
  const save = useAction()

  if (error) return <ErrorNote error={error} />
  if (!data) return <Loading />

  const run = (fn: () => Promise<void>) =>
    save.act(fn).then((ok) => {
      if (ok) {
        reload()
        refreshBadge()
      }
      return ok
    })

  const actions: RequestsActions = {
    send: (draft) =>
      run(async () => {
        const id = await q.sendRequest(supabase, { ...draft, agenda_item_id: null })
        void q.pushAbout(supabase, 'request_sent', id)
      }),
    answer: (id, status, reply) =>
      run(async () => {
        await q.answerRequest(supabase, id, status, reply)
        void q.pushAbout(supabase, 'request_answered', id)
      }),
    takeBack: (id) => void run(() => q.deleteRequest(supabase, id)),
    receive: (id) =>
      void run(async () => {
        await q.receiveCallingRequest(supabase, id, userId)
        void q.pushAbout(supabase, 'calling_request_received', id)
      }),
    answerAssignment: (id, status, reply) =>
      run(async () => {
        await q.answerAssignment(supabase, id, status, reply)
        void q.pushAbout(supabase, 'assignment_answered', id)
      }),
    sendCallingRequest: (form) =>
      run(async () => {
        const id = await q.submitCallingRequest(supabase, form)
        void q.pushAbout(supabase, 'calling_request_sent', id)
      }),
  }

  return (
    <>
      <ErrorNote error={save.error} />
      <RequestsView data={data} userId={userId} today={today} timeZone={WARD_TIME_ZONE} canSend={canSend} canAskCallings={canAsk} startWith={startWith} actions={actions} busy={save.busy} organization={organization} />
    </>
  )
}
