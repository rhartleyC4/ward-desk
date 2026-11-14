// What a failed save says to the person. The database's own checks (raise exception in the
// migrations) are already written for people and pass through; the errors Postgres, PostgREST and
// the browser raise on their own are reworded here.

const REWORDED: [RegExp, string][] = [
  [/failed to fetch|networkerror|network request failed/i, "Couldn't reach Ward Desk. Check your connection and try again."],
  // Safari's whole message for a request that never got an answer.
  [/^Load failed$/, "Couldn't reach Ward Desk. Check your connection and try again."],
  [/jwt expired|invalid jwt|refresh token/i, 'Your sign-in has run out. Reload the page to sign in again.'],
  [/row-level security|permission denied/i, "You don't have permission to make that change."],
  [/duplicate key value/i, "That's already there."],
  [/violates foreign key constraint/i, 'Someone else changed or removed that. Reload the page and try again.'],
  [/violates not-null constraint/i, 'Something needed is missing. Fill it in and try again.'],
]

export function friendlyError(message: string): string {
  return REWORDED.find(([pattern]) => pattern.test(message))?.[1] ?? message
}
