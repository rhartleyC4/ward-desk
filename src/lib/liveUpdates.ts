// Live updates: when someone changes ward data, everyone else's open page reloads.
//
// The database sends a message on the private 'ward' Realtime channel for each change, saying
// only which table changed. Every open loader then reloads through its normal request, so the
// access rules (and acting for someone) apply as usual. A burst of changes, like a save that
// touches several tables, settles into one reload.
//
// An installed app loses its connection in the background and misses what happened meanwhile,
// so coming back to the front, or reconnecting, reloads as well.

import type { Client } from './supabase'

/** How long to wait for a burst of changes to finish before reloading. */
export const SETTLE_MS = 400

type Listener = () => void
const listeners = new Set<Listener>()

/** Calls `fn` whenever ward data may have changed; returns a function that stops. */
export function onWardChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Returns a trigger that calls `fn` once, `ms` after the last of a burst of calls. */
export function settle(fn: () => void, ms = SETTLE_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return () => {
    clearTimeout(timer)
    timer = setTimeout(fn, ms)
  }
}

/** Tells every open loader to reload, once a burst of changes has settled. */
export const announceWardChange = settle(() => listeners.forEach((fn) => fn()))

type ListenEnv = {
  client: Pick<Client, 'channel' | 'removeChannel' | 'realtime'>
  doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>
  announce: () => void
}

/** Listens on the ward channel while someone is signed in; returns a function that stops. */
export function listenForWardChanges({ client, doc, announce = announceWardChange }: Pick<ListenEnv, 'client' | 'doc'> & Partial<ListenEnv>) {
  let stopped = false
  let joined = false
  const channel = client.channel('ward', { config: { private: true } }).on('broadcast', { event: 'changed' }, () => announce())

  // A private channel checks who's joining, so it needs the signed-in person's token first.
  client.realtime
    .setAuth()
    .then(() => {
      if (stopped) return
      channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        // Rejoining after a dropped connection: something may have changed while it was down.
        if (joined) announce()
        joined = true
      })
    })
    // Without live updates, pages still load and reload as before.
    .catch(() => {})

  const onShow = () => {
    if (doc.visibilityState === 'visible') announce()
  }
  doc.addEventListener('visibilitychange', onShow)

  return () => {
    stopped = true
    doc.removeEventListener('visibilitychange', onShow)
    void client.removeChannel(channel)
  }
}
