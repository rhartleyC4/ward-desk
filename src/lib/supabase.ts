import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export type Client = SupabaseClient<Database>

// A mentor uses Ward Desk as the new bishop by sending x-acting-as with each request. The database
// (acting_as()) and the push function only honour it while a delegation allows it, so this just
// says which of the identities they may use is wanted.
let actingFor: string | null = null

/** Sends later requests as this person (a mentor acting for the new bishop), or as yourself. */
export function setActingFor(id: string | null) {
  actingFor = id
}

export const getActingFor = () => actingFor

const withActing: typeof fetch = (input, init) => {
  if (!actingFor) return fetch(input, init)
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  headers.set('x-acting-as', actingFor)
  return fetch(input, { ...init, headers })
}

export const supabase: Client = createClient<Database>(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  global: { fetch: withActing },
})

/** The ward's time zone, used when showing appointment times. */
export const WARD_TIME_ZONE: string = import.meta.env.VITE_WARD_TIME_ZONE || 'America/Denver'
