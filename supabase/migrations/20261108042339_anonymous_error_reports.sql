-- Error reports from the app no longer say who hit the error, and can't carry member details.
--
--   * client_errors.user_id becomes signed_in: whether someone was signed in, which is enough to
--     tell a sign-in page error apart, without saying who.
--   * The full user agent becomes the browser family, major version and system ("Safari 18 iOS"),
--     in a column now called browser.
--   * Anything in quotes, email addresses and long runs of digits are replaced with "…" in the
--     message and stack. The app does this before sending (src/lib/errorReport.ts) and
--     report_client_error() does it again, so an older app version can't send them.
--   * Reports are kept 30 days instead of 90.
--
-- Rows already saved are converted the same way.
--
-- Compatible with the live frontend: report_client_error() keeps its arguments (an older app
-- sends its full user agent as user_agent, which is reduced here), and the app never reads
-- client_errors.

-- ---------------------------------------------------------------------------
-- Scrubbing
-- ---------------------------------------------------------------------------

-- Kept in step with scrubText() in src/lib/errorReport.ts.
create function public.scrub_error_text(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(t, '[\w.+-]+@[\w-]+(\.[\w-]+)+', '…', 'g'),
        '"[^"\n]*"|`[^`\n]*`|“[^”\n]*”|‘[^’\n]*’', '…', 'g'),
      -- A single quote after a letter is an apostrophe ("can't"), not the start of a quote.
      '(^|[^A-Za-z])''[^''\n]*''', '\1…', 'g'),
    '\(?\d([ ().-]{0,2}\d){6,}', '…', 'g');
$$;

revoke execute on function public.scrub_error_text(text) from public, anon, authenticated;

comment on function public.scrub_error_text(text) is 'Error text with anything quoted, email addresses and long digit runs replaced with "…".';

-- Kept in step with browserFamily() in src/lib/errorReport.ts. Text already in that form (from a
-- current app) comes back as it is.
create function public.browser_family(user_agent text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  ua text := coalesce(user_agent, '');
  browser text;
  version text;
  system text;
begin
  if ua ~ '^(Edge|Samsung Internet|Opera|Firefox|Chrome|Safari|Other)( \d{1,4})?( (iOS|Android|ChromeOS|Windows|macOS|Linux))?$' then
    return ua;
  end if;

  system := case
    when ua ~ 'iPhone|iPad|iPod' then 'iOS'
    when ua ~ 'Android' then 'Android'
    when ua ~ 'CrOS' then 'ChromeOS'
    when ua ~ 'Windows' then 'Windows'
    when ua ~ 'Macintosh|Mac OS X' then 'macOS'
    when ua ~ 'Linux' then 'Linux'
  end;

  if ua ~ 'Edg(e|A|iOS)?/\d' then
    browser := 'Edge'; version := substring(ua from 'Edg(?:e|A|iOS)?/(\d+)');
  elsif ua ~ 'SamsungBrowser/\d' then
    browser := 'Samsung Internet'; version := substring(ua from 'SamsungBrowser/(\d+)');
  elsif ua ~ 'OPR/\d' then
    browser := 'Opera'; version := substring(ua from 'OPR/(\d+)');
  elsif ua ~ '(Firefox|FxiOS)/\d' then
    browser := 'Firefox'; version := substring(ua from '(?:Firefox|FxiOS)/(\d+)');
  elsif ua ~ '(Chrome|CriOS)/\d' then
    browser := 'Chrome'; version := substring(ua from '(?:Chrome|CriOS)/(\d+)');
  elsif ua ~ 'Version/\d+[^ ]* (Mobile/\S+ )?Safari/' then
    browser := 'Safari'; version := substring(ua from 'Version/(\d+)');
  elsif system = 'iOS' and ua ~ 'OS \d+_\d+(_\d+)? like Mac OS X' then
    -- An app added to the Home Screen on iOS says only which iOS it runs on.
    browser := 'Safari'; version := substring(ua from 'OS (\d+)_\d+');
  else
    browser := 'Other';
  end if;

  return concat_ws(' ', browser, version, system);
end;
$$;

revoke execute on function public.browser_family(text) from public, anon, authenticated;

comment on function public.browser_family(text) is 'The browser family, major version and system from a user agent, like "Safari 18 iOS".';

-- ---------------------------------------------------------------------------
-- The table, and what's already in it
-- ---------------------------------------------------------------------------

alter table public.client_errors add column signed_in boolean not null default false;

update public.client_errors set
  signed_in = user_id is not null,
  message = left(public.scrub_error_text(message), 500),
  stack = public.scrub_error_text(stack),
  user_agent = public.browser_family(user_agent);

alter table public.client_errors drop column user_id;
alter table public.client_errors rename column user_agent to browser;

comment on table public.client_errors is 'Errors the app hit in someone''s browser, without who. Kept 30 days. Added only through report_client_error.';
comment on column public.client_errors.signed_in is 'Whether someone was signed in when it happened (not who).';
comment on column public.client_errors.browser is 'Browser family, major version and system, like "Safari 18 iOS".';

create or replace function public.report_client_error(
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
declare
  scrubbed text := public.scrub_error_text(report_client_error.message);
begin
  if coalesce(scrubbed, '') = '' then
    return;
  end if;
  -- A phone stuck in a loop, or someone filling the table on purpose, stops here.
  if (select count(*) from public.client_errors where created_at > now() - interval '1 hour') >= 200 then
    return;
  end if;
  insert into public.client_errors (signed_in, source, message, stack, route, app_version, browser)
  values (
    (select auth.uid()) is not null,
    left(report_client_error.source, 20),
    left(scrubbed, 500),
    left(public.scrub_error_text(report_client_error.stack), 4000),
    left(report_client_error.route, 200),
    left(report_client_error.app_version, 40),
    left(public.browser_family(report_client_error.user_agent), 60)
  );
end;
$$;

comment on function public.report_client_error(text, text, text, text, text, text) is
  'Saves an error from the app, without who hit it: quotes, emails and long digit runs scrubbed, the user agent cut to the browser family. At most 200 an hour are kept.';

-- ---------------------------------------------------------------------------
-- Kept 30 days
-- ---------------------------------------------------------------------------

create or replace function public.prune_logs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.client_errors where created_at < now() - interval '30 days';
  delete from public.notify_calls where called_at < now() - interval '7 days';
  delete from public.notification_log where sent_at < now() - interval '30 days';
  delete from public.push_events e
  where e.created_at < now() - interval '30 days'
    and not (
      e.key like 'calling:%:stage:%'
      and exists (select 1 from public.calling_requests r where r.id::text = split_part(e.key, ':', 2))
    );
end;
$$;

comment on function public.prune_logs() is
  'Run by health_check() every hour. Error reports 30 days, notify calls 7 days, notification_log and push_events 30 days (calling request stage keys while the request exists).';
