-- Appointment hours: who may read and change them, and what a row may hold. Also how long an
-- appointment may be booked for, and the message templates the secretaries share.
-- Run with `npm run test:db`. Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

create function pg_temp.act_as(user_email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = user_email), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Called leader: sees and changes nothing
-- ---------------------------------------------------------------------------

select pg_temp.act_as('leader@ward.test');

select is((select count(*)::int from public.availability), 0, 'leader cannot read anyone''s hours');
select is((select count(*)::int from public.availability_changes), 0, 'leader cannot read changed days');
select throws_ok(
  $$ insert into public.availability (weekday, starts_at, ends_at) values (1, '19:00', '20:00') $$,
  '42501', null,
  'leader cannot add hours'
);

-- ---------------------------------------------------------------------------
-- Second counselor: sets his own hours on first sign-in
-- ---------------------------------------------------------------------------

select pg_temp.act_as('second@ward.test');

select is((select count(*)::int from public.availability where user_id = auth.uid()), 0, 'second counselor starts with no hours');
select lives_ok(
  $$ insert into public.availability (weekday, starts_at, ends_at) values (4, '19:00', '20:30') $$,
  'counselor adds his usual hours, owned by him by default'
);
select is((select count(*)::int from public.availability where user_id = auth.uid()), 1, 'and sees them');
select ok((select count(*) from public.availability where user_id <> auth.uid()) > 0, 'counselor reads the others'' hours');

select throws_ok(
  $$ insert into public.availability (weekday, starts_at, ends_at) values (4, '20:00', '19:00') $$,
  '23514', null,
  'hours must end after they start'
);
select throws_ok(
  $$ insert into public.availability (weekday, starts_at, ends_at) values (7, '19:00', '20:00') $$,
  '23514', null,
  'weekday is 0 (Sunday) through 6'
);

-- ---------------------------------------------------------------------------
-- Executive secretary: takes a day out for a leader
-- ---------------------------------------------------------------------------

select pg_temp.act_as('secretary@ward.test');

select lives_ok(
  $$ insert into public.availability_changes (user_id, on_date) select id, '2030-01-09' from public.profiles where email = 'bishop@ward.test' $$,
  'secretary marks the bishop not available on a date'
);
select throws_ok(
  $$ insert into public.availability_changes (user_id, on_date) select id, '2030-01-09' from public.profiles where email = 'bishop@ward.test' $$,
  '23505', null,
  'a day is marked not available once'
);
select throws_ok(
  $$ insert into public.availability_changes (on_date, starts_at) values ('2030-01-10', '19:00') $$,
  '23514', null,
  'a changed day has both times or neither'
);
select lives_ok(
  $$ insert into public.availability_changes (user_id, on_date, starts_at, ends_at) select id, '2030-01-10', '18:00', '19:00' from public.profiles where email = 'bishop@ward.test' $$,
  'secretary gives the bishop different hours on a date'
);

-- ---------------------------------------------------------------------------
-- Appointment lengths
-- ---------------------------------------------------------------------------

insert into public.interviews (person_name, purpose) values ('Length Default', 'calling');
select is((select duration_minutes::int from public.interviews where person_name = 'Length Default'), 10, 'an appointment takes 10 minutes unless set');
select lives_ok(
  $$ update public.interviews set duration_minutes = 5 where person_name = 'Length Default' $$,
  'extending a calling can take 5 minutes'
);
select throws_ok(
  $$ insert into public.interviews (person_name, purpose, duration_minutes) values ('Length Short', 'temple_recommend', 5) $$,
  '23514', null,
  'a temple recommend interview takes at least 10 minutes'
);
select throws_ok(
  $$ update public.interviews set duration_minutes = 12 where person_name = 'Length Default' $$,
  '23514', null,
  'lengths go in 5-minute steps'
);
select throws_ok(
  $$ update public.interviews set duration_minutes = 0 where person_name = 'Length Default' $$,
  '23514', null,
  'an appointment takes some time'
);

-- ---------------------------------------------------------------------------
-- Message templates
-- ---------------------------------------------------------------------------

select is((select count(*)::int from public.message_templates where created_by is null and audience = 'member'), 2, 'the ward starts with an offer and a confirm template');
select is((select count(*)::int from public.message_templates where created_by is null and audience = 'parent'), 2, 'and the same two for writing to a parent');
insert into public.interviews (person_name, purpose) values ('Youth Default', 'youth');
select is((select is_youth from public.interviews where person_name = 'Youth Default'), false, 'an appointment is not a youth''s unless marked');
select lives_ok(
  $$ insert into public.message_templates (name, kind, body) values ('Short offer', 'offer', 'Hi {first_name}: {times}') $$,
  'secretary adds a template'
);
select throws_ok(
  $$ insert into public.message_templates (name, kind, body) values ('Empty', 'offer', '   ') $$,
  '23514', null,
  'a template needs some text'
);

select pg_temp.act_as('first@ward.test');
select is((select count(*)::int from public.message_templates where name = 'Short offer'), 1, 'the rest of the bishopric shares the templates');

select pg_temp.act_as('leader@ward.test');
select is((select count(*)::int from public.message_templates), 0, 'called leaders cannot read templates');
select throws_ok(
  $$ insert into public.message_templates (name, kind, body) values ('Leader', 'offer', 'Hi') $$,
  '42501', null,
  'called leaders cannot add templates'
);

select * from finish();
rollback;
