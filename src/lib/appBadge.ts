// Shows the number of waiting requests on the installed app's icon (the Badging API).
// Works for installed PWAs on desktop and on iOS 16.4+ once notifications are allowed;
// elsewhere the browser lacks the API or ignores it, and the in-app badge still shows.

type BadgeNavigator = Partial<Pick<Navigator, 'setAppBadge' | 'clearAppBadge'>>

export function showOnAppIcon(count: number, nav: BadgeNavigator | undefined = globalThis.navigator) {
  if (!nav?.setAppBadge || !nav.clearAppBadge) return
  // The badge is a nudge, so a refusal (no permission, not installed) is not an error.
  const done = count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge()
  done.catch(() => {})
}
