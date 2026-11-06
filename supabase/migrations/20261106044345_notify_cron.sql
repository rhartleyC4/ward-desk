-- Every 10 minutes, pg_cron asks the notify Edge Function (supabase/functions/notify) to send
-- whatever is due: the evening day-ahead summaries, a leader's nudge to report on today's
-- appointments, and a secretary's reminders to send for tomorrow. The function decides what is
-- due and logs each send in notification_log, so a call with nothing due sends nothing.
--
-- Where to call and the shared secret live in Vault, set once per environment by hand (see
-- "Notifications" in README.md). Until both are set, the job does nothing, so local databases
-- and fresh environments stay quiet.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function public.call_notify()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  notify_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_url');
  notify_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret');
begin
  if notify_url is null or notify_secret is null then
    return;
  end if;
  perform net.http_post(
    url := notify_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', notify_secret),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function public.call_notify() from public, anon, authenticated;

comment on function public.call_notify() is 'Run by pg_cron every 10 minutes: asks the notify Edge Function to send what is due.';

-- Scheduling by name replaces an existing job, so re-running this is harmless.
select cron.schedule('notify', '*/10 * * * *', 'select public.call_notify()');
