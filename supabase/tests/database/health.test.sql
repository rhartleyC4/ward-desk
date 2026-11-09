-- Health checks: who may report and read app errors, and what the hourly check finds.
-- Run with `npm run test:db`. Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

create function pg_temp.act_as(user_email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = user_email), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reporting app errors
-- ---------------------------------------------------------------------------

select pg_temp.as_anon();
select lives_ok($$ select public.report_client_error('sign-in broke', null, '/', 'abc123', 'Test browser', 'error') $$, 'someone not signed in can report an error');
select is((select count(*)::int from public.client_errors), 0, 'but can''t read them back');

select pg_temp.act_as('leader@ward.test');
select lives_ok($$ select public.report_client_error(repeat('x', 900), repeat('s', 9000), '/agenda', 'abc123', 'Test browser', 'render') $$, 'a member can report an error');
select lives_ok($$ select public.report_client_error('') $$, 'an empty message is ignored');
select is((select count(*)::int from public.client_errors), 0, 'a member can''t read errors');
select throws_ok($$ insert into public.client_errors (message) values ('made up') $$, '42501', null, 'nobody adds errors directly');

select pg_temp.act_as('bishop@ward.test');
select is((select count(*)::int from public.client_errors), 2, 'an admin can read them');
select is(
  (select signed_in from public.client_errors where route = '/'),
  false,
  'an error from the sign-in page says no one was signed in'
);
select pg_temp.as_owner();
select is(
  (select (signed_in, char_length(message), char_length(stack))::text from public.client_errors where route = '/agenda'),
  '(t,500,4000)',
  'an error says someone was signed in, not who, and long text is cut short'
);
select hasnt_column('public', 'client_errors', 'user_id', 'nothing records who hit an error');

-- An older app sends its full user agent and unscrubbed text.
select pg_temp.act_as('leader@ward.test');
select public.report_client_error(
  'No request "Visit Sister Ames" for ames@example.com, call (555) 123-4567',
  E'Error: can''t load ''Ames''\n    at f (index.js:1:23456)',
  '/requests', 'old1234',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  'error'
);
select pg_temp.as_owner();
select is(
  (select row(message, stack, browser)::text from public.client_errors where route = '/requests'),
  row('No request … for …, call …', E'Error: can''t load …\n    at f (index.js:1:23456)', 'Safari 18 iOS')::text,
  'quotes, emails and phone numbers are scrubbed, and only the browser family is kept'
);

-- The same answers as browserFamily() in src/lib/errorReport.ts.
select is(
  array(select public.browser_family(ua) from unnest(array[
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
    'Chrome 131 Android',
    'Test browser',
    null
  ]) with ordinality as a(ua, n) order by n),
  array['Safari 17 iOS', 'Chrome 131 iOS', 'Samsung Internet 26 Android', 'Edge 131 Windows', 'Safari 18 macOS', 'Firefox 133 Linux', 'Chrome 131 Android', 'Other', 'Other'],
  'the browser family is worked out like the app does, and a current app''s is kept as sent'
);
select is(
  public.scrub_error_text('Record 000-1234-5678 at index.js:12:345678, status 404, by first.last+ward@example.co.uk'),
  'Record … at index.js:12:345678, status 404, by …',
  'line numbers and short numbers stay'
);
delete from public.client_errors where route = '/requests';

select pg_temp.act_as('bishop@ward.test');
select throws_ok($$ select public.health_check() $$, '42501', null, 'only the database runs the health check');

-- At most 200 are kept an hour.
select pg_temp.as_owner();
insert into public.client_errors (message) select 'loop ' || i from generate_series(1, 198) as i;
select pg_temp.as_anon();
select public.report_client_error('one more');
select public.report_client_error('and another');
select pg_temp.as_owner();
select is((select count(*)::int from public.client_errors), 200, 'reports past 200 in an hour are dropped');
delete from public.client_errors;

-- ---------------------------------------------------------------------------
-- What the check finds
-- ---------------------------------------------------------------------------

select is(public.health_report(now() - interval '1 hour', now()), '{}'::text[], 'a quiet hour reports nothing');

insert into public.notify_calls (request_id, called_at) values
  (990000001, now() - interval '40 minutes'),
  (990000002, now() - interval '30 minutes'),
  (990000003, now() - interval '20 minutes'),
  (990000004, now() - interval '10 minutes');
insert into net._http_response (id, status_code, content_type, content, timed_out, created) values
  (990000001, 200, 'application/json', '{"sent":["summary → bishop: sent, 2 devices","request_due → member: failed, 1 device"]}', false, now() - interval '40 minutes'),
  (990000002, 200, 'application/json', '{"sent":[]}', false, now() - interval '30 minutes'),
  (990000003, 500, 'application/json', '{"error":"notify failed"}', false, now() - interval '20 minutes');
-- 990000004 never got an answer.
insert into cron.job_run_details (runid, jobid, job_pid, database, username, command, status, return_message, start_time, end_time)
select 990000001, jobid, 1, 'postgres', 'postgres', command, 'failed', 'ERROR: something broke', now() - interval '15 minutes', now() - interval '15 minutes'
from cron.job where jobname = 'notify';
insert into public.client_errors (message, created_at) values ('a', now() - interval '5 minutes'), ('a', now() - interval '6 minutes'), ('b', now() - interval '7 minutes');

select is(
  public.health_report(now() - interval '1 hour', now()),
  array[
    '1 of 4 calls to the notify function failed (last: 500).',
    '1 of 4 calls to the notify function got no answer.',
    '1 notification couldn''t be delivered (the push service refused).',
    '1 scheduled job run failed (last: notify: ERROR: something broke).',
    '3 errors in the app (2 different).'
  ],
  'a bad hour lists each kind of problem'
);

select is(
  public.health_report(now() - interval '25 minutes', now() - interval '12 minutes'),
  array[
    '1 of 1 calls to the notify function failed (last: 500).',
    '1 scheduled job run failed (last: notify: ERROR: something broke).'
  ],
  'only what happened in the window counts'
);

-- The check picks up from where the last one stopped, so each problem is sent once.
update public.health_state set checked_until = now() - interval '1 hour';
select is(cardinality(public.health_check()), 5, 'the check finds the hour''s problems');
select is(public.health_check(), '{}'::text[], 'and the next check doesn''t repeat them');

select is(
  (select last_email_request from public.health_state),
  null,
  'without Resend set up, no email is sent'
);

-- With Resend set up, the problems go to the alert address. pg_net only sends once this
-- transaction commits, and the test rolls back.
delete from public.notify_calls;
delete from cron.job_run_details where runid = 990000001;
delete from public.client_errors;
select vault.create_secret('re_test', 'resend_api_key');
select vault.create_secret('one@example.com, two@example.com', 'alert_email');
select vault.create_secret('Ward Desk test', 'alert_label');
insert into public.client_errors (message, created_at) values ('c', now() - interval '6 minutes');
update public.health_state set checked_until = now() - interval '1 hour';
select is(public.health_check(), array['1 error in the app (1 different).'], 'the check finds the new error');
select is(
  (select (q.url, convert_from(q.body, 'utf8')::jsonb -> 'to', convert_from(q.body, 'utf8')::jsonb ->> 'subject', q.headers ->> 'Authorization')::text
   from net.http_request_queue q where q.id = (select last_email_request from public.health_state)),
  '(https://api.resend.com/emails,"[""one@example.com"", ""two@example.com""]","Ward Desk test: 1 problem in the last hour","Bearer re_test")',
  'and emails it to each alert address through Resend'
);
select ok(
  (select convert_from(q.body, 'utf8')::jsonb ->> 'text' like '- 1 error in the app (1 different).%' from net.http_request_queue q where q.id = (select last_email_request from public.health_state)),
  'the email lists the problems'
);
select is(
  (select convert_from(q.body, 'utf8')::jsonb ->> 'from' from net.http_request_queue q where q.id = (select last_email_request from public.health_state)),
  'Ward Desk <noreply@warddesk.app>',
  'with no sender saved, alerts keep the original address'
);
select vault.create_secret('Ward Desk <alerts@example.org>', 'alert_from');
select set_config('test.alert_request', public.send_alert('a subject', 'a body')::text, true);
select is(
  (select convert_from(q.body, 'utf8')::jsonb ->> 'from' from net.http_request_queue q where q.id = current_setting('test.alert_request')::bigint),
  'Ward Desk <alerts@example.org>',
  'a ward''s saved sender is used for its alerts'
);

-- ---------------------------------------------------------------------------
-- Missing backups
-- ---------------------------------------------------------------------------

delete from public.client_errors;
update public.health_state set checked_until = now() - interval '5 minutes';
select is(public.health_check(), '{}'::text[], 'with backups not expected here, none is fine');

update public.health_state set expects_backups = true, checked_until = now() - interval '5 minutes';
select is(
  public.health_check(),
  array['No off-site backup has been recorded yet (public.backup_runs). Check the "Database backup" workflow.'],
  'where backups are expected, having none is a problem'
);

insert into public.backup_runs (object_key, bytes, finished_at) values ('production/daily/old.dump.age', 1234, now() - interval '30 hours');
update public.health_state set checked_until = now() - interval '5 minutes';
select is(public.health_check(), '{}'::text[], 'it''s said at most every 12 hours');

update public.health_state set backup_alerted_at = now() - interval '13 hours', checked_until = now() - interval '5 minutes';
select ok((public.health_check())[1] like 'The last off-site backup finished % UTC, over 26 hours ago.%', 'a backup over 26 hours old is a problem');

insert into public.backup_runs (object_key, bytes, finished_at) values ('production/daily/new.dump.age', 1234, now() - interval '2 hours');
update public.health_state set backup_alerted_at = null, checked_until = now() - interval '5 minutes';
select is(public.health_check(), '{}'::text[], 'a backup in the last 26 hours is fine');

select * from finish();
rollback;
