-- Accounts: what people may change on their own profile, and how removing someone from the
-- allowlist reaches their account. Run with `npm run test:db`. Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

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

set local role postgres;
-- The database owner (seed, Studio, migrations) may still correct an email.
select lives_ok(
  $$ update public.profiles set email = 'corrected@ward.test' where id = (select leader from ids) $$,
  'the database owner can still correct an email'
);

select * from finish();
rollback;
