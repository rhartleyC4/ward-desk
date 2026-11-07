// Keeps an installed app on the latest build. The browser only looks for a new service worker
// when the app is launched, and iOS resumes an installed app from the background without
// relaunching it, so people kept running an old build for hours after a deploy. This looks
// again each time the app comes back to the front, and once the new build has taken over
// (autoUpdate activates it straight away), reloads so the page runs it too.

/** A reload this soon after coming back can't lose anything: the person hasn't started yet. */
export const FRESH_MS = 10_000

type UpdateEnv = {
  doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>
  sw: Pick<ServiceWorkerContainer, 'controller' | 'getRegistration' | 'addEventListener' | 'removeEventListener'>
  reload: () => void
  now?: () => number
}

/** Starts watching; returns a function that stops. Does nothing without service workers. */
export function keepUpToDate(env: Partial<UpdateEnv> = browserEnv()): () => void {
  const { doc, sw, reload } = env
  if (!doc || !sw || !reload) return () => {}
  const now = env.now ?? Date.now
  // On the very first visit there's no old build to replace, so taking control isn't an update.
  const hadController = !!sw.controller
  let shownAt = now()
  let ready = false

  const onVisibility = () => {
    if (doc.visibilityState !== 'visible') return
    shownAt = now()
    if (ready) return reload()
    // A failed check (offline) just leaves the current build running.
    sw.getRegistration()
      .then((r) => r?.update())
      .catch(() => {})
  }
  const onTakeover = () => {
    if (!hadController) return
    ready = true
    // Right after coming back, reload now; otherwise wait for the next return so nothing typed is lost.
    if (doc.visibilityState === 'visible' && now() - shownAt < FRESH_MS) reload()
  }

  doc.addEventListener('visibilitychange', onVisibility)
  sw.addEventListener('controllerchange', onTakeover)
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility)
    sw.removeEventListener('controllerchange', onTakeover)
  }
}

function browserEnv(): Partial<UpdateEnv> {
  if (typeof document === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return {}
  return { doc: document, sw: navigator.serviceWorker, reload: () => window.location.reload() }
}
