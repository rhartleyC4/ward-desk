-- Day-ahead summary notifications for the bishopric. The scheduled sender (scripts/notify, run by
-- .github/workflows/notify.yml) connects as the database owner, so it reads past RLS and is the
-- only writer of notification_log.

-- One row per person and day summarized, so a rerun of the job never sends the same day twice.
create table public.notification_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('day_summary')),
  for_date date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, for_date)
);

alter table public.notification_log enable row level security;

create policy "users read own notifications" on public.notification_log
  for select to authenticated using (user_id = (select auth.uid()));

-- A browser has one push endpoint, so whoever turns notifications on last on a device owns it.
-- RLS hides another person's row, so a plain upsert would fail when someone else signed in on
-- that device before; this takes the endpoint over instead.
create function public.save_push_subscription(sub_endpoint text, sub_p256dh text, sub_auth text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  select (select auth.uid()), sub_endpoint, sub_p256dh, sub_auth
  where (select auth.uid()) is not null and public.has_any_role()
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
$$;

revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
