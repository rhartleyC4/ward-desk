/** Turns the allowlist trigger's failure into something a person can act on. */
export function friendlyAuthError(message: string): string {
  if (/database error|not on the allowlist/i.test(message)) {
    return 'That email has not been invited yet. Ask a ward admin to add you.'
  }
  return message
}
