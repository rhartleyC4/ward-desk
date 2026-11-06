// Loaded into the generated service worker (vite.config.ts, workbox.importScripts). Shows the
// notifications scripts/notify sends, and opens the app when one is tapped.

self.addEventListener('push', (event) => {
  let message = {}
  try {
    message = event.data ? event.data.json() : {}
  } catch {
    message = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(message.title || 'Ward Desk', {
      body: message.body || '',
      tag: message.tag,
      icon: '/pwa-192.png',
      // Android draws the badge from its alpha channel only, so it needs a transparent silhouette.
      badge: '/badge-96.png',
      data: { url: message.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin))
      if (open) return open.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : w))
      return self.clients.openWindow(url)
    }),
  )
})
