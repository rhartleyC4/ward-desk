/** Words that come before a name ("Bishop Avery") but are not the name itself. */
const HONORIFICS = new Set(['bishop', 'brother', 'bro', 'sister', 'sis', 'elder', 'president', 'pres', 'mr', 'mrs', 'ms', 'dr'])

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function hasWholeWord(text: string, word: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, 'iu').test(text)
}

/**
 * Day-ahead push summaries show rotation and meeting titles on lock screens exactly as
 * typed. Returns what in `title` could be a person: the first or last name (a whole word,
 * any case) of anyone in `displayNames`, or the rotation's own assignee label.
 * Titles like "Bishop" or "Brother" are skipped, so "Bishop interviews" is not flagged.
 */
export function namesInTitle(title: string, displayNames: (string | null | undefined)[], assigneeLabel?: string | null): string[] {
  const found: string[] = []
  const add = (s: string) => {
    if (!found.some((f) => f.toLowerCase() === s.toLowerCase())) found.push(s)
  }
  for (const full of displayNames) {
    const words = (full ?? '').trim().split(/\s+/).filter(Boolean)
    while (words.length && HONORIFICS.has(words[0].toLowerCase().replace(/\.$/, ''))) words.shift()
    if (!words.length) continue
    for (const w of new Set([words[0], words[words.length - 1]])) {
      if (w.length < 2) continue
      if (hasWholeWord(title, w)) add(w)
    }
  }
  const label = assigneeLabel?.trim()
  if (label && hasWholeWord(title, label)) add(label)
  return found
}

export const TITLE_HELPER = "Shows on lock screens. Keep it general, like 'Primary message', not a name."

/** Soft warning text for `namesInTitle` results, or '' when there is nothing to warn about. */
export function titleNameWarning(names: string[]): string {
  return names.length ? `This looks like it has a name in it (${names.join(', ')}). It will show on lock screens.` : ''
}
