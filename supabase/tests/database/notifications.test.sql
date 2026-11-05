-- Day-ahead summary notifications: who may save a device, and who may read the send log.
-- Run with `npm run test:db`. Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

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

select * from finish();
rollback;
