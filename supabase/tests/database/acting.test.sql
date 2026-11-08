-- A mentor's changes are recorded as the person he mentors; his own things stay his.
-- Run with `npm run test:db`. Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

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
  select pg_temp.uid('leader@ward.test') as mentor, pg_temp.uid('first@ward.test') as bishop,
    pg_temp.uid('secretary@ward.test') as secretary;
grant select on ids to authenticated;

-- Sister Reyes mentors Brother Lane (standing in for the new bishop).
insert into public.delegations (mentor_id, for_id, ends_at)
select mentor, bishop, now() + interval '4 weeks' from ids;

-- Something already waiting for him.
insert into public.requests (from_id, to_id, title)
select pg_temp.uid('bishop@ward.test'), bishop, 'Visit the Lees' from ids;

select pg_temp.act_as('leader@ward.test');
select is((select count(*)::int from public.requests where title = 'Visit the Lees'), 0, 'as herself, the mentor can''t read his requests');

select pg_temp.act_as('leader@ward.test', 'first@ward.test');
select is((select count(*)::int from public.requests where title = 'Visit the Lees'), 1, 'acting for him, she reads requests sent to him');
select ok(exists (select 1 from public.roles where user_id = (select bishop from ids) and role = 'bishopric'), 'and sees his roles, so the app shows his pages');

-- What she does is his.
insert into public.requests (to_id, title) select secretary, 'Book the Ortegas' from ids;
select is((select from_id from public.requests where title = 'Book the Ortegas'), (select bishop from ids), 'a request she sends is from him');
select throws_ok(
  $$ insert into public.requests (from_id, to_id, title) select mentor, secretary, 'From me' from ids $$,
  '42501', null, 'she can''t send one in her own name while acting for him');

update public.requests set status = 'seen' where title = 'Visit the Lees';
select is((select status::text from public.requests where title = 'Visit the Lees'), 'seen', 'she answers a request sent to him');

insert into public.agenda_items (body) values ('Ward conference plans');
select is((select created_by from public.agenda_items where body = 'Ward conference plans'), (select bishop from ids), 'an agenda item she adds is his');

insert into public.absences (starts_on, ends_on) values (current_date + 30, current_date + 32);
select is((select user_id from public.absences where starts_on = current_date + 30), (select bishop from ids), 'away dates she adds are his');

insert into public.interviews (interviewer_id, scheduled_at, person_name) select bishop, now() + interval '3 days', 'Test Person' from ids;
reset role;
select is(
  (select row(actor_id, acted_by)::text from public.notification_outbox where interview_id = (select id from public.interviews where person_name = 'Test Person')),
  (select row(bishop, mentor)::text from ids),
  'the outbox counts the booking as his and remembers she made it');
select pg_temp.act_as('leader@ward.test', 'first@ward.test');

-- Her own things stay hers.
with renamed as (update public.profiles set display_name = 'Not his' where id = (select bishop from ids) returning 1)
select is((select count(*)::int from renamed), 0, 'she can''t change his name');

select public.save_push_subscription('https://push.example/mentor-device', 'p256', 'auth');
reset role;
select is((select user_id from public.push_subscriptions where endpoint = 'https://push.example/mentor-device'), (select mentor from ids), 'a device she turns on is hers, not his');

select pg_temp.act_as('leader@ward.test', 'first@ward.test');
insert into public.notification_mutes (kind) values ('request_sent');
reset role;
select is((select user_id from public.notification_mutes where kind = 'request_sent'), (select mentor from ids), 'notification choices stay hers');

-- Without the header she's herself again.
select pg_temp.act_as('leader@ward.test');
select is((select count(*)::int from public.agenda_items where body = 'Ward conference plans'), 0, 'as herself she can''t read the bishopric agenda');
select throws_ok(
  $$ insert into public.requests (to_id, title) select secretary, 'Mine' from ids $$,
  '42501', null, 'and can''t send requests');

-- Ordinary people are themselves, as before.
select pg_temp.act_as('first@ward.test');
insert into public.requests (to_id, title) select secretary, 'His own' from ids;
select is((select from_id from public.requests where title = 'His own'), (select bishop from ids), 'without mentoring, a request is from whoever sends it');

select * from finish();
rollback;
