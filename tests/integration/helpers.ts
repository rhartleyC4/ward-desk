// Integration tests run against the local Supabase stack (`npm run db:start`) with the seed data
// from supabase/seed.sql. They sign in as the seeded fake accounts with the local-only password.

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import type { Database } from '../../src/lib/database.types'
import type { Client } from '../../src/lib/supabase'

export const LOCAL_PASSWORD = 'gp7'

let cached: { url: string; anonKey: string } | undefined

function localEnv() {
  if (cached) return cached
  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
    cached = { url: process.env.VITE_SUPABASE_URL, anonKey: process.env.VITE_SUPABASE_ANON_KEY }
  } else {
    const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
    cached = { url: status.API_URL, anonKey: status.ANON_KEY }
  }
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(cached.url)) {
    throw new Error(`Integration tests only run against a local Supabase, not ${cached.url}`)
  }
  return cached
}

export function anonClient(): Client {
  const { url, anonKey } = localEnv()
  return createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type SeedUser = 'bishop' | 'first' | 'second' | 'secretary' | 'assistant' | 'clerk' | 'leader' | 'eqpres' | 'rspres' | 'ywpres' | 'primarypres' | 'mission' | 'temple' | 'activities'

export async function signIn(user: SeedUser): Promise<Client & { userId: string }> {
  const client = anonClient()
  const { data, error } = await client.auth.signInWithPassword({ email: `${user}@ward.test`, password: LOCAL_PASSWORD })
  if (error) throw new Error(`Could not sign in as ${user}: ${error.message}. Is local Supabase running and seeded?`)
  return Object.assign(client, { userId: data.user.id })
}
