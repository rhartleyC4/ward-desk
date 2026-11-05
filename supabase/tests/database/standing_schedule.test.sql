-- The standing schedule: the bishopric keep it, everyone with a role reads it, and a rotation's
-- day is either set in full or left for any time that month. Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

create function pg_temp.act_as(user_email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = user_email), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

select is(
  (select count(*)::int from public.rotations where title = 'Primary message' and weekday = 0 and week_of_month = 3), 3,
  'the seeded Primary messages fall on the 3rd Sunday'
);

-- ---------------------------------------------------------------------------
-- A counselor keeps the schedule
-- ---------------------------------------------------------------------------

select pg_temp.act_as('first@ward.test');

select lives_ok(
  $$ insert into public.rotations (title, assignee_id, months, weekday, week_of_month)
     values ('Test talk', '00000000-0000-0000-0000-000000000001', '{1,7}', 0, 4) $$,
  'a counselor adds a rotation on a set day'
);
select lives_ok(
  $$ update public.rotations set months = '{2,8}', weekday = null, week_of_month = null where title = 'Test talk' $$,
  'and changes it to any time in the month'
);
select throws_ok(
  $$ update public.rotations set week_of_month = 2 where title = 'Test talk' $$,
  '23514', null,
  'a week without a day is refused'
);
select throws_ok(
  $$ update public.rotations set months = '{}' where title = 'Test talk' $$,
  '23514', null,
  'a rotation needs at least one month'
);
select lives_ok(
  $$ update public.recurring_events set week_of_month = 4, start_time = '09:30' where title = 'YW Presidency' $$,
  'a counselor changes a regular meeting'
);
select lives_ok(
  $$ insert into public.stewardships (user_id, area) values ('00000000-0000-0000-0000-000000000002', 'Test area') $$,
  'and gives a counselor an assignment'
);
select lives_ok($$ delete from public.rotations where title = 'Test talk' $$, 'and deletes a rotation');
select is((select count(*)::int from public.rotations where title = 'Test talk'), 0, 'which is gone');

-- ---------------------------------------------------------------------------
-- Called leaders read it but can't change it
-- ---------------------------------------------------------------------------

select pg_temp.act_as('leader@ward.test');

select is((select count(*)::int from public.recurring_events where title = 'YW Presidency' and week_of_month = 4), 1, 'a leader sees the change');
update public.recurring_events set title = 'x';
delete from public.stewardships;
select is((select count(*)::int from public.recurring_events where title = 'x'), 0, 'a leader cannot change a regular meeting');
select is((select count(*)::int from public.stewardships where area = 'Test area'), 1, 'a leader cannot remove an assignment');

select * from finish();
rollback;
