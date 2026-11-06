-- Health checks: who may report and read app errors, and what the hourly check finds.
-- Run with `npm run test:db`. Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

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
  (select user_id from public.client_errors where route = '/'),
  null,
  'an error from the sign-in page has no person'
);
select pg_temp.as_owner();
select is(
  (select (user_id = (select id from auth.users where email = 'leader@ward.test'), char_length(message), char_length(stack))::text from public.client_errors where route = '/agenda'),
  '(t,500,4000)',
  'an error is tied to who hit it, and long text is cut short'
);

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
