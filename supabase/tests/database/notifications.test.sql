-- Day-ahead summary notifications: who may save a device, and who may read the send log.
-- Run with `npm run test:db`. Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

create function pg_temp.act_as(user_email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = user_email), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.owner_of(sub_endpoint text) returns text language sql security definer as $$
  select p.email::text from public.push_subscriptions s join public.profiles p on p.id = s.user_id where s.endpoint = sub_endpoint;
$$;

create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Changes queued for the notify function, read as the database owner.
create function pg_temp.queued() returns text language sql security definer as $$
  select coalesce(string_agg(event, ',' order by id), '') from public.notification_outbox;
$$;

-- The sender logs a summary for the bishop.
insert into public.notification_log (user_id, kind, for_date)
select id, 'day_summary', '2026-11-08' from public.profiles where email = 'bishop@ward.test';

-- ---------------------------------------------------------------------------
-- Saving a device
-- ---------------------------------------------------------------------------

select pg_temp.act_as('first@ward.test');
select lives_ok($$ select public.save_push_subscription('https://push.test/device-1', 'key-1', 'auth-1') $$, 'counselor saves this device');
select is(pg_temp.owner_of('https://push.test/device-1'), 'first@ward.test', 'and owns it');
select is((select count(*)::int from public.push_subscriptions), 1, 'he sees only his own devices');
select lives_ok($$ select public.save_push_subscription('https://push.test/device-1', 'key-1b', 'auth-1b') $$, 'saving it again is fine');
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://push.test/device-1'), 1, 'and keeps one row');

-- The bishop signs in on the same phone and turns notifications on.
select pg_temp.act_as('bishop@ward.test');
select lives_ok($$ select public.save_push_subscription('https://push.test/device-1', 'key-2', 'auth-2') $$, 'someone else can take over the device');
select is(pg_temp.owner_of('https://push.test/device-1'), 'bishop@ward.test', 'and it is now theirs');

-- ---------------------------------------------------------------------------
-- The send log
-- ---------------------------------------------------------------------------

select is((select count(*)::int from public.notification_log), 1, 'bishop reads his own log');

select pg_temp.act_as('first@ward.test');
select is((select count(*)::int from public.notification_log), 0, 'counselor cannot read the bishop''s log');
select throws_ok(
  $$ insert into public.notification_log (user_id, kind, for_date) values (auth.uid(), 'day_summary', '2026-11-09') $$,
  '42501', null,
  'only the sender writes the log'
);

-- ---------------------------------------------------------------------------
-- Turning kinds of notification off
-- ---------------------------------------------------------------------------

select pg_temp.act_as('leader@ward.test');
select lives_ok($$ insert into public.notification_mutes (kind) values ('request_sent') $$, 'a ward leader turns new requests off');
select is((select count(*)::int from public.notification_mutes), 1, 'and sees that choice');
select throws_ok($$ insert into public.notification_mutes (kind) values ('everything') $$, '23514', null, 'only known kinds can be turned off');

select pg_temp.act_as('bishop@ward.test');
select is((select count(*)::int from public.notification_mutes), 0, 'nobody else sees their choices');
select throws_ok(
  $$ insert into public.notification_mutes (user_id, kind) values ((select id from public.profiles where email = 'leader@ward.test'), 'request_due') $$,
  '42501', null,
  'nobody turns off someone else''s notifications'
);

select pg_temp.act_as('leader@ward.test');
delete from public.notification_mutes where kind = 'request_sent';
select is((select count(*)::int from public.notification_mutes), 0, 'and they turn it back on');

-- ---------------------------------------------------------------------------
-- Changes queued for the notify function
-- ---------------------------------------------------------------------------

select pg_temp.as_owner();
insert into public.interviews (id, interviewer_id, person_name, purpose)
select '00000000-0000-0000-0000-0000000000aa', id, 'Outbox Test', 'other' from public.profiles where email = 'bishop@ward.test';
select is(pg_temp.queued(), '', 'the database owner''s changes notify no one');

select pg_temp.act_as('bishop@ward.test');
insert into public.interviews (interviewer_id, person_name, purpose)
select id, 'Outbox Test', 'other' from public.profiles where email = 'bishop@ward.test';
select is(pg_temp.queued(), 'added', 'a leader adding an appointment queues it for the secretary');

select pg_temp.act_as('secretary@ward.test');
update public.interviews set scheduled_at = '2026-11-10 19:00-07' where id = '00000000-0000-0000-0000-0000000000aa';
update public.interviews set scheduled_at = '2026-11-11 19:00-07' where id = '00000000-0000-0000-0000-0000000000aa';
update public.interviews set duration_minutes = 20 where id = '00000000-0000-0000-0000-0000000000aa';
select is(pg_temp.queued(), 'added,booked,moved', 'booking and moving are queued; other edits aren''t');

select pg_temp.act_as('bishop@ward.test');
update public.interviews set scheduled_at = null, missed_at = '2026-11-11 19:00-07' where id = '00000000-0000-0000-0000-0000000000aa';
select is(pg_temp.queued(), 'added,booked,moved,sent_back', 'a missed appointment sent back is queued');

select pg_temp.act_as('secretary@ward.test');
update public.interviews set scheduled_at = '2026-11-12 19:00-07' where id = '00000000-0000-0000-0000-0000000000aa';
update public.interviews set status = 'cancelled' where id = '00000000-0000-0000-0000-0000000000aa';
select is(pg_temp.queued(), 'added,booked,moved,sent_back,booked,cancelled', 'and so is cancelling a booked one');

select pg_temp.act_as('first@ward.test');
insert into public.absences (starts_on, ends_on) values ('2026-11-20', '2026-11-22');
select is(pg_temp.queued(), 'added,booked,moved,sent_back,booked,cancelled,away', 'away dates are queued');
select is((select count(*)::int from public.notification_outbox), 0, 'nobody signed in can read the queue');

select * from finish();
rollback;
