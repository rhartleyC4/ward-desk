-- Accounts: what people may change on their own profile, and how removing someone from the
-- allowlist reaches their account. Run with `npm run test:db`. Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(53);

create function pg_temp.act_as(user_email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = user_email), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.uid(user_email text) returns uuid language sql security definer as $$
  select id from auth.users where email = user_email;
$$;

-- Runs a statement and swallows any error, like a client that tries and moves on.
create function pg_temp.try(statement text) returns void language plpgsql as $$
begin
  execute statement;
exception when others then
  null;
end;
$$;

create temp table ids as
  select pg_temp.uid('leader@ward.test') as leader, pg_temp.uid('first@ward.test') as counselor;
grant select on ids to authenticated;

-- ---------------------------------------------------------------------------
-- People may change their own name, and nothing else on their profile
-- ---------------------------------------------------------------------------

select pg_temp.act_as('leader@ward.test');

select throws_ok(
  $$ update public.profiles set email = 'someone.else@example.com' where id = (select auth.uid()) $$,
  '42501', null,
  'a leader cannot change their own email'
);
select throws_ok(
  $$ update public.profiles set office = 'bishop' where id = (select auth.uid()) $$,
  '42501', null,
  'a leader cannot change their own office'
);
select throws_ok(
  $$ update public.profiles set short_name = 'Boss' where id = (select auth.uid()) $$,
  '42501', null,
  'a leader cannot change the short name the bishopric uses for them'
);
select lives_ok(
  $$ update public.profiles set display_name = '  Sister Reyes-Lund  ' where id = (select auth.uid()) $$,
  'a leader changes their own name'
);
select is(
  (select display_name from public.profiles where id = (select auth.uid())),
  'Sister Reyes-Lund', 'the name is saved without surrounding spaces'
);
select throws_ok(
  $$ update public.profiles set display_name = '   ' where id = (select auth.uid()) $$,
  '23514', null,
  'a blank name is refused'
);
select throws_ok(
  $$ update public.profiles set display_name = repeat('a', 61) where id = (select auth.uid()) $$,
  '23514', null,
  'a name over 60 characters is refused'
);
with renamed as (update public.profiles set display_name = 'Not mine' where id = (select counselor from ids) returning 1)
select is((select count(*)::int from renamed), 0, 'a leader cannot rename someone else');

select is((select sends_reminders from public.profiles where id = (select auth.uid())), true, 'appointment reminders start on');
select lives_ok(
  $$ update public.profiles set sends_reminders = false where id = (select auth.uid()) $$,
  'a person turns their own appointment reminders off'
);
with changed as (update public.profiles set sends_reminders = false where id = (select counselor from ids) returning 1)
select is((select count(*)::int from changed), 0, 'a person cannot turn off someone else''s reminders');

select pg_temp.act_as('first@ward.test');

select throws_ok(
  $$ update public.profiles set email = 'lane@example.com' where id = (select auth.uid()) $$,
  '42501', null,
  'a bishopric member cannot change their own email'
);

-- ---------------------------------------------------------------------------
-- Removing someone takes their roles away, whatever they tried first
-- ---------------------------------------------------------------------------

select pg_temp.act_as('leader@ward.test');
select pg_temp.try($$ update public.profiles set email = 'hidden.leader@example.com' where id = (select auth.uid()) $$);

select pg_temp.act_as('bishop@ward.test');
delete from public.allowlist where email = 'leader@ward.test';

set local role postgres;
select is(
  (select count(*)::int from public.roles where user_id = (select leader from ids)),
  0, 'removing an email takes away the roles even after the person tried to change their email'
);
select is(
  (select email::text from public.profiles where id = (select leader from ids)),
  'leader@ward.test', 'the profile keeps the email they signed up with'
);

select pg_temp.act_as('bishop@ward.test');
select throws_ok(
  $$ update public.allowlist set profile_id = (select leader from ids) where email = 'first@ward.test' $$,
  '42501', null,
  'an admin cannot point an allowlist entry at a different account'
);
select throws_ok(
  $$ update public.allowlist set email = 'other@ward.test' where email = 'first@ward.test' $$,
  '42501', null,
  'an admin cannot change the email of an allowlist entry'
);

-- ---------------------------------------------------------------------------
-- The removal clock: starts when someone loses every role, stops when they get one back
-- ---------------------------------------------------------------------------

set local role postgres;
create function pg_temp.removed(person uuid) returns boolean language sql security definer as $$
  select removed_at is not null from public.profiles where id = person;
$$;
create function pg_temp.roles_of(person uuid) returns text language sql security definer as $$
  select coalesce(array_agg(role order by role)::text, '{}') from public.roles where user_id = person;
$$;

select ok(pg_temp.removed((select leader from ids)), 'taking someone off the allowlist starts the removal clock');

select pg_temp.act_as('bishop@ward.test');
insert into public.allowlist (email, initial_roles) values ('leader@ward.test', '{leader}');
select is(pg_temp.roles_of((select leader from ids)), '{leader}', 'adding an email back gives the existing account its roles again');
select ok(not pg_temp.removed((select leader from ids)), 'adding an email back stops the removal clock');

update public.allowlist set initial_roles = '{bishopric}' where email = 'leader@ward.test';
select ok(not pg_temp.removed((select leader from ids)), 'swapping one role for another is not a removal');
update public.allowlist set initial_roles = '{}' where email = 'leader@ward.test';
select ok(pg_temp.removed((select leader from ids)), 'losing every role starts the removal clock');
update public.allowlist set initial_roles = '{leader}' where email = 'leader@ward.test';
select ok(not pg_temp.removed((select leader from ids)), 'getting a role back stops it');

-- ---------------------------------------------------------------------------
-- Deleting an account
-- ---------------------------------------------------------------------------

-- Records others rely on: requests both ways, a calling request, a meeting part they assigned.
select pg_temp.act_as('bishop@ward.test');
insert into public.requests (to_id, title) values ((select counselor from ids), 'Visit the Lees');
select pg_temp.act_as('first@ward.test');
insert into public.requests (to_id, title) values ((select leader from ids), 'Bring the hymn list');
insert into public.agenda_assignments (template_id, meeting_date, part, assignee_id)
  select id, '2027-02-07', 'opening_prayer', (select leader from ids) from public.agenda_templates where slug = 'ward-council';
set local role postgres;
insert into public.calling_requests (requested_by, kind, calling_title) values ((select counselor from ids), 'fill', 'Primary teacher');

select pg_temp.act_as('leader@ward.test');
select throws_ok(
  $$ select public.delete_account((select counselor from ids)) $$,
  '42501', null,
  'a leader cannot delete an account'
);

select pg_temp.act_as('first@ward.test');
select throws_ok(
  $$ select public.delete_person((select leader from ids)) $$,
  '42501', null,
  'nobody signed in can call delete_person directly'
);

select pg_temp.act_as('bishop@ward.test');
select throws_ok(
  $$ select public.delete_account((select auth.uid())) $$,
  '42501', null,
  'an admin cannot delete their own account'
);
select throws_ok(
  $$ select public.delete_account(gen_random_uuid()) $$,
  'P0002', null,
  'deleting an account that does not exist says so'
);
select lives_ok(
  $$ select public.delete_account((select counselor from ids)) $$,
  'an admin deletes someone else''s account'
);

set local role postgres;
select is((select count(*)::int from auth.users where id = (select counselor from ids)), 0, 'the sign-in account is gone');
select is((select count(*)::int from public.profiles where id = (select counselor from ids)), 0, 'the profile is gone');
select is((select count(*)::int from public.roles where user_id = (select counselor from ids)), 0, 'the roles are gone');
select is((select count(*)::int from public.allowlist where email = 'first@ward.test'), 0, 'the email is off the allowlist, so it cannot sign in again unnoticed');
select is(
  (select count(*)::int from public.requests where title = 'Visit the Lees' and to_id is null),
  1, 'a request they received stays, with no one as the recipient'
);
select is(
  (select count(*)::int from public.requests where title = 'Bring the hymn list' and from_id is null and to_id = (select leader from ids)),
  1, 'a request they sent stays with the person asked'
);
select is(
  (select count(*)::int from public.calling_requests where calling_title = 'Primary teacher' and requested_by is null),
  1, 'a calling request they made stays'
);
select is(
  (select assigned_by from public.agenda_assignments where meeting_date = '2027-02-07' and part = 'opening_prayer'),
  null, 'a meeting part they assigned stays, with no one as who assigned it'
);
select is(
  (select count(*)::int from public.interviews where interviewer_id = (select counselor from ids)),
  0, 'appointments they were to hold no longer point at them'
);

-- The guards are back on once the deletion is done.
select pg_temp.act_as('leader@ward.test');
select throws_ok(
  $$ update public.requests set title = 'Changed' where title = 'Bring the hymn list' $$,
  '42501', null,
  'request guards still apply after a deletion'
);

set local role postgres;
-- The database owner (seed, Studio, migrations) may still correct an email.
select lives_ok(
  $$ update public.profiles set email = 'corrected@ward.test' where id = (select leader from ids) $$,
  'the database owner can still correct an email'
);

-- ---------------------------------------------------------------------------
-- Names entered before someone signs in
-- ---------------------------------------------------------------------------

set local role postgres;
select set_config('request.jwt.claims', '', true);

create function pg_temp.new_user(user_email text, full_name text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', user_email, jsonb_build_object('full_name', full_name));
$$;

insert into public.allowlist (email, initial_roles, first_name, last_name) values
  ('named@ward.test', '{leader}', 'Robin', 'Vale'),
  ('blank@ward.test', '{leader}', '   ', null),
  ('waiting@ward.test', '{bishopric}', 'Sky', 'Marsh'),
  ('Mixed.Case@Ward.test', '{}', null, 'Tarn'),
  ('nameless@ward.test', '{leader}', null, null);

select pg_temp.new_user('named@ward.test', 'Name From Google');
select is((select display_name from public.profiles where email = 'named@ward.test'), 'Robin Vale', 'a name an admin entered wins over the one from Google');
select pg_temp.new_user('blank@ward.test', 'Name From Google');
select is((select display_name from public.profiles where email = 'blank@ward.test'), 'Name From Google', 'a blank name falls back to the one from Google');

select throws_ok(
  $$ update public.allowlist set first_name = repeat('a', 40), last_name = repeat('b', 40) where email = 'nameless@ward.test' $$,
  '23514', null,
  'first and last name together must fit a display name'
);

select is(public.create_waiting_accounts(), 2, 'creates accounts only for named people who have none');
select is((select display_name from public.profiles where email = 'waiting@ward.test'), 'Sky Marsh', 'the waiting account has the entered name');
select ok(
  (select profile_id is not null from public.allowlist where email = 'waiting@ward.test') and exists (select 1 from public.roles r join public.profiles p on p.id = r.user_id where p.email = 'waiting@ward.test' and r.role = 'bishopric'),
  'the waiting account is linked and has its roles'
);
select is((select count(*)::int from auth.users where email = 'waiting@ward.test' and email_confirmed_at is not null), 1, 'its email counts as confirmed, so Google sign-in joins it');
select is((select email::text from public.profiles where display_name = 'Tarn'), 'mixed.case@ward.test', 'a mixed-case email still gets its account');
select is((select count(*)::int from public.profiles where email = 'nameless@ward.test'), 0, 'someone with no name gets no account');
select is(public.create_waiting_accounts(), 0, 'running it again creates nothing');

select pg_temp.act_as('leader@ward.test');
select throws_ok($$ select public.create_waiting_accounts() $$, '42501', null, 'the app cannot create waiting accounts');

-- ---------------------------------------------------------------------------
-- Who hasn't signed in yet, even with an account made for them
-- ---------------------------------------------------------------------------

select is((select count(*)::int from public.accounts_not_signed_in()), 0, 'only an admin can see who has not signed in');

select pg_temp.act_as('bishop@ward.test');
select ok(pg_temp.uid('waiting@ward.test') in (select public.accounts_not_signed_in()), 'an account made ahead of time counts as not signed in');

select set_config('role', 'postgres', true);
update auth.users set last_sign_in_at = now() where email = 'waiting@ward.test';
select pg_temp.act_as('bishop@ward.test');
select ok(pg_temp.uid('waiting@ward.test') not in (select public.accounts_not_signed_in()), 'signing in takes them off the list');

select set_config('role', 'anon', true);
select throws_ok($$ select public.accounts_not_signed_in() $$, '42501', null, 'someone signed out cannot ask');

select * from finish();
rollback;
