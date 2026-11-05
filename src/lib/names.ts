/** "Bishop Avery" → "BA", for the Settings button. */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase()
}
