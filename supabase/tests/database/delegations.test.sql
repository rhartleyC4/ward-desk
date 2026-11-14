-- Mentoring: who a request acts as, and what carries over. Run with `npm run test:db`.
-- Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

-- Signs in as someone, optionally asking to act for someone else (the x-acting-as header).
create function pg_temp.act_as(user_email text, for_email text default null) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = user_email), 'role', 'authenticated')::text, true);
  perform set_config('request.headers',
    case when for_email is null then '{}' else json_build_object('x-acting-as', (select id from auth.users where email = for_email))::text end, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.uid(user_email text) returns uuid language sql security definer as $$
  select id from auth.users where email = user_email;
$$;

create temp table ids as
  select pg_temp.uid('leader@ward.test') as mentor, pg_temp.uid('first@ward.test') as bishop, pg_temp.uid('bishop@ward.test') as admin;
grant select on ids to authenticated;

-- A calling under discussion, and the appointment to extend it.
insert into public.calling_needs (calling_title) values ('Test Calling For Mentors');
insert into public.interviews (interviewer_id, scheduled_at, person_name, purpose)
values (pg_temp.uid('first@ward.test'), now() + interval '2 days', 'Calling Visit', 'calling'),
       (pg_temp.uid('first@ward.test'), now() + interval '2 days', 'Recommend Visit', 'temple_recommend');

-- Sister Reyes (a ward leader) mentors Brother Lane, who stands in for the new bishop here.
insert into public.delegations (mentor_id, for_id, ends_at)
select mentor, bishop, now() + interval '4 weeks' from ids;

-- ---------------------------------------------------------------------------
-- Who a request acts as
-- ---------------------------------------------------------------------------

select pg_temp.act_as('leader@ward.test');
select is(private.acting_as(), (select mentor from ids), 'without the header, a mentor is herself');
select ok(not private.has_role('bishopric'), 'and has only her own roles');

select pg_temp.act_as('leader@ward.test', 'first@ward.test');
select is(private.acting_as(), (select bishop from ids), 'with the header, she acts as the person she mentors');
select ok(private.is_mentoring(), 'and is mentoring');
select ok(private.has_role('bishopric'), 'she has his bishopric role');
select ok(not private.has_role('leader'), 'but not her own leader role while acting for him');
select ok(not private.can_see_callings(), 'callings stay hidden until he allows them');
select is((select count(*)::int from public.calling_needs where calling_title = 'Test Calling For Mentors'), 0, 'she can''t read callings being discussed');
select is((select count(*)::int from public.interviews where person_name = 'Calling Visit'), 0, 'nor appointments to extend a calling');
select is((select count(*)::int from public.interviews where person_name = 'Recommend Visit'), 1, 'but sees his other appointments');

select pg_temp.act_as('second@ward.test', 'first@ward.test');
select is(private.acting_as(), pg_temp.uid('second@ward.test'), 'someone without a delegation who sends the header is themself');

select pg_temp.act_as('leader@ward.test', 'second@ward.test');
select is(private.acting_as(), (select mentor from ids), 'a mentor can''t act for someone else');

-- An admin who mentors doesn't take admin into it, nor does the person mentored lend theirs.
reset role;
insert into public.delegations (mentor_id, for_id, ends_at)
select admin, bishop, now() + interval '1 week' from ids;
select pg_temp.act_as('bishop@ward.test', 'first@ward.test');
select ok(private.has_role('bishopric') and not private.has_role('admin'), 'an admin acting for someone is not an admin while doing it');

-- ---------------------------------------------------------------------------
-- The person mentored decides
-- ---------------------------------------------------------------------------

select pg_temp.act_as('leader@ward.test');
with changed as (update public.delegations set sees_callings = true where mentor_id = (select mentor from ids) returning 1)
select is((select count(*)::int from changed), 0, 'a mentor can''t let herself see callings');
select throws_ok(
  $$ insert into public.delegations (mentor_id, for_id, ends_at) select mentor, bishop, now() + interval '1 week' from ids $$,
  '42501', null, 'nobody starts mentoring from the app directly');

select pg_temp.act_as('leader@ward.test', 'first@ward.test');
with changed as (update public.delegations set sees_callings = true where mentor_id = (select mentor from ids) returning 1)
select is((select count(*)::int from changed), 0, 'acting as him doesn''t let her change it either');

select pg_temp.act_as('first@ward.test');
select lives_ok(
  $$ update public.delegations set sees_callings = true where mentor_id = (select mentor from ids) $$,
  'the person mentored allows callings');
select throws_ok(
  $$ update public.delegations set ends_at = starts_at + interval '13 weeks' where mentor_id = (select mentor from ids) $$,
  '23514', null, 'mentoring can''t run past 12 weeks');

select pg_temp.act_as('leader@ward.test', 'first@ward.test');
select ok(private.can_see_callings(), 'once allowed, the mentor sees callings');
select is((select count(*)::int from public.calling_needs where calling_title = 'Test Calling For Mentors'), 1, 'and reads them');
select is((select count(*)::int from public.interviews where person_name = 'Calling Visit'), 1, 'and the appointments to extend them');

-- He loses the bishopric: the mentor is herself again.
reset role;
delete from public.roles where user_id = (select bishop from ids) and role = 'bishopric';
select pg_temp.act_as('leader@ward.test', 'first@ward.test');
select is(private.acting_as(), (select mentor from ids), 'mentoring stops when the person mentored leaves the bishopric');
reset role;
insert into public.roles (user_id, role) select bishop, 'bishopric' from ids;

-- Ended, and expired.
select pg_temp.act_as('first@ward.test');
update public.delegations set ended_at = now() where mentor_id = (select mentor from ids);
select throws_ok(
  $$ update public.delegations set ended_at = null where mentor_id = (select mentor from ids) $$,
  '42501', null, 'ended mentoring can''t be reopened');
select pg_temp.act_as('leader@ward.test', 'first@ward.test');
select is(private.acting_as(), (select mentor from ids), 'after it ends, the mentor is herself');

reset role;
select set_config('request.jwt.claims', '', true);
update public.delegations set starts_at = now() - interval '5 weeks', ends_at = now() - interval '1 week'
where mentor_id = (select admin from ids);
select pg_temp.act_as('bishop@ward.test', 'first@ward.test');
select is(private.acting_as(), (select admin from ids), 'after the end date, the mentor is himself');

select * from finish();
rollback;
