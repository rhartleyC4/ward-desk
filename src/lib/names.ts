// People's names: initials for the Settings button, and the name people choose for themselves
// (the database applies the same rule in guard_profile_update).

/** "Bishop Avery" → "BA", for the Settings button. */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase()
}

export const NAME_MAX = 60

/** The name as it will be saved: without surrounding spaces. */
export const cleanName = (name: string) => name.trim()

/** Why a name can't be saved, or null if it can. Counts characters the way the database does. */
export function nameProblem(name: string): string | null {
  const clean = cleanName(name)
  if (!clean) return 'Enter your name.'
  if ([...clean].length > NAME_MAX) return `Keep it to ${NAME_MAX} characters.`
  return null
}
