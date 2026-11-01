-- RLS tests: run with `npm run test:db` (supabase test db). Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- Act as a seeded user for the rest of the transaction, or until the next call.
create function pg_temp.act_as(user_email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = user_email), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Allowlist sign-up trigger
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'stranger@example.com', 'authenticated', 'authenticated') $$,
  'P0001', null,
  'sign-up is rejected for an email not on the allowlist'
);

insert into public.allowlist (email, initial_roles) values ('New.Member@Ward.test', '{scheduler}');
insert into auth.users (id, email, aud, role)
  values ('20000000-0000-0000-0000-000000000001', 'new.member@ward.test', 'authenticated', 'authenticated');

select is(
  (select count(*)::int from public.profiles where id = '20000000-0000-0000-0000-000000000001'),
  1, 'allowlisted sign-up creates a profile (email match ignores case)'
);
select is(
  (select array_agg(role)::text from public.roles where user_id = '20000000-0000-0000-0000-000000000001'),
  '{scheduler}', 'allowlisted sign-up receives initial_roles'
);

insert into public.allowlist (email) values ('noroles@ward.test');
insert into auth.users (id, email, aud, role)
  values ('20000000-0000-0000-0000-000000000002', 'noroles@ward.test', 'authenticated', 'authenticated');

-- ---------------------------------------------------------------------------
-- Scheduler: meetings yes, anything confidential no
-- ---------------------------------------------------------------------------

select pg_temp.act_as('scheduler@ward.test');

select ok((select count(*) from public.meetings) > 0, 'scheduler reads meetings');
select ok((select count(*) from public.program_items) > 0, 'scheduler reads program items');
select lives_ok(
  $$ insert into public.meetings (meeting_date) values ('2027-01-10') $$,
  'scheduler creates a meeting'
);
select is((select count(*)::int from public.calling_needs), 0, 'scheduler cannot see calling needs');
select is((select count(*)::int from public.calling_candidates), 0, 'scheduler cannot see calling candidates');
select is((select count(*)::int from public.interviews), 0, 'scheduler cannot see interviews');
select is((select count(*)::int from public.agendas), 0, 'scheduler cannot see agendas');
select is((select count(*)::int from public.agenda_items), 0, 'scheduler cannot see agenda items');
select is((select count(*)::int from public.prayer_roll), 0, 'scheduler cannot see the prayer roll');
select is((select count(*)::int from public.allowlist), 0, 'scheduler cannot see the allowlist');
select ok((select count(*) from public.absences) > 0, 'scheduler reads everyone''s away dates');
select is(
  (select array_agg(distinct role)::text from public.roles where user_id <> (select auth.uid())),
  '{bishopric}', 'scheduler sees who is in the bishopric, but no one''s other roles'
);
select lives_ok(
  $$ insert into public.absences (starts_on, ends_on, location) values ('2027-01-01', '2027-01-03', 'Trip') $$,
  'scheduler records their own away dates'
);
select throws_ok(
  $$ insert into public.absences (user_id, starts_on, ends_on) values ('00000000-0000-0000-0000-000000000001', '2027-01-01', '2027-01-02') $$,
  '42501', null,
  'scheduler cannot record away dates for someone else'
);
select throws_ok(
  $$ insert into public.rotations (title, months) values ('x', '{1}') $$,
  '42501', null,
  'scheduler cannot change the standing schedule'
);

-- ---------------------------------------------------------------------------
-- Suggester: may only submit names
-- ---------------------------------------------------------------------------

select pg_temp.act_as('suggester@ward.test');

select lives_ok(
  $$ insert into public.calling_candidates (calling_title, person_name) values ('Primary Teacher', 'Sister Vale') $$,
  'suggester submits a name'
);
select is((select count(*)::int from public.calling_candidates), 0, 'suggester cannot read candidates, even their own');
select is((select count(*)::int from public.calling_needs), 0, 'suggester cannot see calling needs');
select throws_ok(
  $$ insert into public.calling_candidates (calling_title, person_name, status) values ('Primary Teacher', 'Sister Vale', 'approved') $$,
  '42501', null,
  'suggester cannot submit a name as already approved'
);
select throws_ok(
  $$ insert into public.calling_candidates (need_id, person_name) values ('10000000-0000-0000-0000-000000000001', 'Sister Vale') $$,
  '42501', null,
  'suggester cannot attach a name to a specific need'
);
select throws_ok(
  $$ insert into public.meetings (meeting_date) values ('2027-01-17') $$,
  '42501', null,
  'suggester cannot create meetings'
);

-- ---------------------------------------------------------------------------
-- Signed in, allowlisted, but no roles yet
-- ---------------------------------------------------------------------------

select pg_temp.act_as('noroles@ward.test');

select is((select count(*)::int from public.meetings), 0, 'a user without roles sees no meetings');
select throws_ok(
  $$ insert into public.absences (starts_on, ends_on) values ('2027-01-01', '2027-01-02') $$,
  '42501', null,
  'a user without roles cannot record away dates'
);

-- ---------------------------------------------------------------------------
-- Bishopric and admin
-- ---------------------------------------------------------------------------

select pg_temp.act_as('first@ward.test');

select is((select count(*)::int from public.calling_needs), 5, 'bishopric sees all calling needs');
select ok((select count(*) from public.calling_candidates) >= 4, 'bishopric sees all candidates, including suggestions');
select ok((select count(*) from public.interviews) > 0, 'bishopric sees interviews');
select lives_ok(
  $$ insert into public.agenda_items (body) values ('New discussion item') $$,
  'bishopric adds agenda items'
);
select is((select count(*)::int from public.allowlist), 0, 'bishopric who is not admin cannot see the allowlist');

select pg_temp.act_as('bishop@ward.test');

select ok((select count(*) from public.allowlist) >= 5, 'admin manages the allowlist');

select * from finish();
rollback;
