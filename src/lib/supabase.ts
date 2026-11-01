import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export type Client = SupabaseClient<Database>

export const supabase: Client = createClient<Database>(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

/** The ward's time zone, used when showing interview times on the agenda. */
export const WARD_TIME_ZONE: string = import.meta.env.VITE_WARD_TIME_ZONE || 'America/Denver'
