-- Knowing when something breaks, without watching dashboards.
--
-- 1. The app reports errors it hits in someone's browser to client_errors (through
--    report_client_error, which anyone may call, a limited number of times an hour).
-- 2. call_notify() now notes each request it makes, so its answers in net._http_response can be
--    told apart from other pg_net calls.
-- 3. Every hour, pg_cron runs health_check(). It looks at the hour that just passed: failed or
--    unanswered calls to the notify function, pushes a push service refused, failed cron runs and
--    app errors. If any turned up, it emails the alert address through Resend. It also says when
--    the notify function hasn't answered for half an hour, at most twice a day.
--
-- The email holds counts and where to look, never names or message text. Where to send it lives
-- in Vault (alert_email, resend_api_key, and optionally alert_label), set by
-- `npm run alerts:setup -- <environment>`. Until both are set, health_check() only returns what it
-- found, so local databases stay quiet.
--
-- The check runs inside the database rather than in an Edge Function, so it still works when the
-- functions are the thing that broke.

-- ---------------------------------------------------------------------------
-- Errors from the app
-- ---------------------------------------------------------------------------

create table public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  source text, -- 'render', 'error', 'promise' or 'load'
  message text not null check (message <> ''),
  stack text,
  route text,
  app_version text,
  user_agent text
);

create index client_errors_created_at on public.client_errors (created_at);

alter table public.client_errors enable row level security;

create policy "admins read client errors" on public.client_errors
  for select to authenticated using (public.has_role('admin'));

comment on table public.client_errors is 'Errors the app hit in someone''s browser. Kept 90 days. Added only through report_client_error.';

create function public.report_client_error(
  message text,
  stack text default null,
  route text default null,
  app_version text default null,
  user_agent text default null,
  source text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(report_client_error.message, '') = '' then
    return;
  end if;
  -- A phone stuck in a loop, or someone filling the table on purpose, stops here.
  if (select count(*) from public.client_errors where created_at > now() - interval '1 hour') >= 200 then
    return;
  end if;
  insert into public.client_errors (user_id, source, message, stack, route, app_version, user_agent)
  values (
    (select auth.uid()),
    left(report_client_error.source, 20),
    left(report_client_error.message, 500),
    left(report_client_error.stack, 4000),
    left(report_client_error.route, 200),
    left(report_client_error.app_version, 40),
    left(report_client_error.user_agent, 300)
  );
end;
$$;

revoke execute on function public.report_client_error(text, text, text, text, text, text) from public;
-- Anon too, so a failure on the sign-in page is heard about.
grant execute on function public.report_client_error(text, text, text, text, text, text) to anon, authenticated;

comment on function public.report_client_error(text, text, text, text, text, text) is 'Saves an error from the app. At most 200 an hour are kept.';

-- ---------------------------------------------------------------------------
-- Which pg_net requests were calls to the notify function
-- ---------------------------------------------------------------------------

create table public.notify_calls (
  request_id bigint primary key, -- net._http_response.id
  called_at timestamptz not null default now()
);

alter table public.notify_calls enable row level security;

comment on table public.notify_calls is 'Each call call_notify() made, to match with its answer in net._http_response. Kept 7 days.';

create or replace function public.call_notify()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  notify_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_url');
  notify_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret');
  request bigint;
begin
  if notify_url is null or notify_secret is null then
    return;
  end if;
  request := net.http_post(
    url := notify_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', notify_secret),
    timeout_milliseconds := 30000
  );
  insert into public.notify_calls (request_id) values (request) on conflict do nothing;
end;
$$;

revoke execute on function public.call_notify() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The hourly check
-- ---------------------------------------------------------------------------

create table public.health_state (
  id boolean primary key default true check (id), -- one row
  checked_until timestamptz not null default now(), -- the next check starts here
  checked_at timestamptz,
  stalled_alerted_at timestamptz,
  last_email_request bigint, -- net._http_response.id of the last alert email
  last_email_at timestamptz
);

alter table public.health_state enable row level security;

insert into public.health_state default values;

comment on table public.health_state is 'Where the hourly health check got to, and when it last sent an alert.';

-- What went wrong between two times, one line each. Counts and offices only, never names.
create function public.health_report(since timestamptz, until timestamptz)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lines text[] := '{}';
  calls int;
  failed int;
  unanswered int;
  last_failure text;
  pushes_failed int;
  cron_failed int;
  cron_last text;
  errors int;
  distinct_errors int;
begin
  -- pg_net keeps answers 6 hours, so an older call without one may simply have been answered.
  select
    count(*),
    count(*) filter (where r.id is not null and (r.status_code is distinct from 200 or r.timed_out)),
    count(*) filter (where r.id is null and c.called_at > now() - interval '5 hours')
  into calls, failed, unanswered
  from public.notify_calls c
  left join net._http_response r on r.id = c.request_id
  where c.called_at > since and c.called_at <= until;

  if failed > 0 then
    select coalesce(r.status_code::text, case when r.timed_out then 'timed out' end, left(r.error_msg, 80), 'no status')
    into last_failure
    from public.notify_calls c
    join net._http_response r on r.id = c.request_id
    where c.called_at > since and c.called_at <= until and (r.status_code is distinct from 200 or r.timed_out)
    order by c.called_at desc
    limit 1;
    lines := lines || format('%s of %s calls to the notify function failed (last: %s).', failed, calls, last_failure);
  end if;
  if unanswered > 0 then
    lines := lines || format('%s of %s calls to the notify function got no answer.', unanswered, calls);
  end if;

  -- The notify function answers {"sent": ["<kind> → <office>: failed, 1 device", ...]}.
  select count(*)
  into pushes_failed
  from public.notify_calls c
  join net._http_response r on r.id = c.request_id
  cross join lateral jsonb_array_elements_text(
    case when r.status_code = 200 and r.content is json object and jsonb_typeof(r.content::jsonb -> 'sent') = 'array'
      then r.content::jsonb -> 'sent' else '[]'::jsonb end
  ) as line
  where c.called_at > since and c.called_at <= until and line like '%: failed,%';
  if pushes_failed > 0 then
    lines := lines || format('%s notification%s couldn''t be delivered (the push service refused).', pushes_failed, case when pushes_failed = 1 then '' else 's' end);
  end if;

  select count(*), (array_agg(format('%s: %s', j.jobname, left(d.return_message, 150)) order by d.start_time desc))[1]
  into cron_failed, cron_last
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
  where d.status = 'failed' and d.start_time > since and d.start_time <= until;
  if cron_failed > 0 then
    lines := lines || format('%s scheduled job run%s failed (last: %s).', cron_failed, case when cron_failed = 1 then '' else 's' end, cron_last);
  end if;

  select count(*), count(distinct e.message)
  into errors, distinct_errors
  from public.client_errors e
  where e.created_at > since and e.created_at <= until;
  if errors > 0 then
    lines := lines || format('%s error%s in the app (%s different).', errors, case when errors = 1 then '' else 's' end, distinct_errors);
  end if;

  return lines;
end;
$$;

revoke execute on function public.health_report(timestamptz, timestamptz) from public, anon, authenticated;

comment on function public.health_report(timestamptz, timestamptz) is 'What went wrong between two times: notify calls, pushes, cron runs and app errors. Counts only.';

-- Emails the alert address through Resend. Returns the pg_net request id, or null when no alert
-- address or Resend key is set.
create function public.send_alert(subject text, body text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  resend_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key');
  alert_to text := (select decrypted_secret from vault.decrypted_secrets where name = 'alert_email');
  label text := coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'alert_label'), 'Ward Desk');
begin
  if resend_key is null or alert_to is null then
    return null;
  end if;
  return net.http_post(
    url := 'https://api.resend.com/emails',
    body := jsonb_build_object(
      'from', 'Ward Desk <noreply@warddesk.app>',
      'to', to_jsonb(string_to_array(replace(alert_to, ' ', ''), ',')),
      'subject', label || ': ' || send_alert.subject,
      'text', send_alert.body
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || resend_key),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke execute on function public.send_alert(text, text) from public, anon, authenticated;

comment on function public.send_alert(text, text) is 'Emails the alert address (Vault alert_email) through Resend. Null when alerts aren''t set up.';

create function public.health_check()
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  state public.health_state;
  -- Leave the last few minutes for the next check, so a call still waiting on its answer isn't
  -- counted as unanswered.
  check_until timestamptz := now() - interval '5 minutes';
  lines text[];
  stalled boolean := false;
  last_ok timestamptz;
  request bigint;
begin
  select * into state from public.health_state for update;
  lines := public.health_report(state.checked_until, check_until);

  -- No good answer for half an hour, once calls have been tracked that long: the cron job, pg_net
  -- or the function itself has stopped. Said at most every 12 hours.
  if exists (select 1 from vault.decrypted_secrets where name = 'notify_url')
    and exists (select 1 from public.notify_calls where called_at < now() - interval '30 minutes') then
    select max(c.called_at) into last_ok
    from public.notify_calls c
    join net._http_response r on r.id = c.request_id
    where r.status_code = 200 and not coalesce(r.timed_out, false);
    if (last_ok is null or last_ok < now() - interval '30 minutes')
      and (state.stalled_alerted_at is null or state.stalled_alerted_at < now() - interval '12 hours') then
      stalled := true;
      lines := lines || format(
        'The notify function hasn''t answered %s, so scheduled notifications may have stopped.',
        case when last_ok is null then 'in the last few hours' else 'since ' || to_char(last_ok at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC' end
      );
    end if;
  end if;

  if cardinality(lines) > 0 then
    request := public.send_alert(
      format('%s problem%s in the last hour', cardinality(lines), case when cardinality(lines) = 1 then '' else 's' end),
      concat_ws(E'\n',
        array_to_string(array(select '- ' || l from unnest(lines) as l), E'\n'),
        '',
        'Where to look:',
        '- npm run env:check -- <environment>',
        '- Supabase dashboard: Edge Functions, notify, Logs',
        '- App errors: select created_at, route, message from client_errors order by id desc limit 20;',
        '',
        'Checked ' || to_char(state.checked_until at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' to ' || to_char(check_until at time zone 'UTC', 'HH24:MI') || ' UTC.'
      )
    );
  end if;

  update public.health_state set
    checked_until = check_until,
    checked_at = now(),
    stalled_alerted_at = case when stalled then now() else stalled_alerted_at end,
    last_email_request = coalesce(request, last_email_request),
    last_email_at = case when request is not null then now() else last_email_at end
  where id;

  delete from public.client_errors where created_at < now() - interval '90 days';
  delete from public.notify_calls where called_at < now() - interval '7 days';

  return lines;
end;
$$;

revoke execute on function public.health_check() from public, anon, authenticated;

comment on function public.health_check() is 'Run by pg_cron every hour: emails the alert address when the last hour had failures.';

select cron.schedule('health', '7 * * * *', 'select public.health_check()');
