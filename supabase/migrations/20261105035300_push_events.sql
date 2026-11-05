-- The push Edge Function (supabase/functions/push) sends a notification the moment a request is
-- sent or answered. It records each one here first, so asking it twice about the same change
-- never notifies anyone twice. Only the function writes here; it uses the service role, which RLS
-- doesn't apply to, so there are no policies.

create table public.push_events (
  key text primary key, -- what happened, e.g. 'request:<id>:seen'
  created_at timestamptz not null default now()
);

alter table public.push_events enable row level security;

comment on table public.push_events is 'Notifications the push Edge Function already sent, so a repeat call sends nothing.';
