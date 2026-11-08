// The shared practice accounts on the training site, which holds invented data only.

import { friendlyAuthError } from './authErrors'
import { isTrainingSite } from './env'
import { ACTING_KEY, supabase } from './supabase'

// The seeded accounts in supabase/seed.sql, with their names there. Keep the two in sync.
export const PRACTICE_ACCOUNTS = [
  { email: 'bishop@ward.test', name: 'Bishop Avery', role: 'Bishop (admin)' },
  { email: 'first@ward.test', name: 'Brother Lane', role: '1st counselor' },
  { email: 'second@ward.test', name: 'Brother Ortiz', role: '2nd counselor' },
  { email: 'secretary@ward.test', name: 'Brother Quinn', role: 'Executive secretary' },
  { email: 'assistant@ward.test', name: 'Brother Tate', role: 'Assistant executive secretary' },
  { email: 'clerk@ward.test', name: 'Brother Pike', role: 'Ward clerk' },
  { email: 'eqpres@ward.test', name: 'Brother Hollis', role: 'Elders Quorum president' },
  { email: 'rspres@ward.test', name: 'Sister Young', role: 'Relief Society president' },
  { email: 'ywpres@ward.test', name: 'Sister Vance', role: 'Young Women president' },
  { email: 'primarypres@ward.test', name: 'Sister Ellis', role: 'Primary president' },
  { email: 'mission@ward.test', name: 'Brother Navarro', role: 'Ward mission leader' },
  { email: 'temple@ward.test', name: 'Sister Whitfield', role: 'Temple and family history leader' },
  { email: 'activities@ward.test', name: 'Sister Okafor', role: 'Activities committee chair' },
  { email: 'leader@ward.test', name: 'Sister Reyes', role: 'Other called leader' },
]

/**
 * The seed password, when this build may sign in as a practice account in one tap. CI sets it for
 * the training site only, so the real site's build doesn't contain it.
 */
export const practicePassword = () => (isTrainingSite() && import.meta.env.VITE_PRACTICE_PASSWORD) || null

/** Signs in as a practice account, replacing any current session. Returns what went wrong, if anything. */
export async function signInAsPractice(email: string): Promise<string | null> {
  const password = practicePassword()
  if (!password) return "Practice sign-in isn't available on this site."
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return friendlyAuthError(error.message)
  try {
    // A choice to act for someone else belonged to the previous practice person.
    localStorage.removeItem(ACTING_KEY)
  } catch {
    // Private windows may refuse; there was nothing stored to clear.
  }
  return null
}
