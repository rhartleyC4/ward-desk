-- The steps a name to consider moves through, and when a calling counts as release only.
-- Run with `npm run test:db`. Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

create function pg_temp.act_as(user_email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = user_email), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.status(name text) returns text language sql as $$
  select status::text from public.calling_candidates where person_name = name
$$;

select pg_temp.act_as('first@ward.test');

insert into public.calling_needs (calling_title, release_name) values ('Test Chorister', 'Brother Old');
insert into public.calling_candidates (need_id, person_name, status)
select id, n, 'discussing' from public.calling_needs, unnest(array['Sister One', 'Sister Two']) n
where calling_title = 'Test Chorister';

-- ---------------------------------------------------------------------------
-- Forward, one step at a time
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.calling_candidates set status = 'accepted' where person_name = 'Sister One' $$,
  '23514', null,
  'a name has to be approved before it can be accepted'
);

update public.calling_candidates set status = 'approved' where person_name = 'Sister One';
select is(pg_temp.status('Sister One'), 'approved', 'a name under consideration can be approved');

select throws_ok(
  $$ update public.calling_candidates set status = 'approved' where person_name = 'Sister Two' $$,
  '23505', null,
  'only one name per calling can be approved at a time'
);

update public.calling_candidates set status = 'accepted', sustain_on = current_date + 7 where person_name = 'Sister One';
update public.calling_needs set release_on = current_date + 7 where calling_title = 'Test Chorister';
select is(pg_temp.status('Sister One'), 'accepted', 'an approved name can be accepted');

select throws_ok(
  $$ update public.calling_candidates set status = 'set_apart' where person_name = 'Sister One' $$,
  '23514', null,
  'no one is set apart before they are sustained'
);

-- ---------------------------------------------------------------------------
-- Taking back a mis-tap
-- ---------------------------------------------------------------------------

update public.calling_candidates set status = 'approved' where person_name = 'Sister One';
select is(
  (select sustain_on from public.calling_candidates where person_name = 'Sister One'),
  null, 'taking back an accept clears the sustain date'
);
select is(
  (select release_on from public.calling_needs where calling_title = 'Test Chorister'),
  null, 'and the release that was set for the same day'
);

update public.calling_candidates set status = 'discussing' where person_name = 'Sister One';
select is(pg_temp.status('Sister One'), 'discussing', 'an approval can be taken back');

update public.calling_candidates set status = 'approved' where person_name = 'Sister One';
update public.calling_candidates set status = 'accepted', sustain_on = current_date - 7 where person_name = 'Sister One';
select throws_ok(
  $$ update public.calling_candidates set status = 'approved' where person_name = 'Sister One' $$,
  '23514', null,
  'an accept cannot be taken back once they are sustained'
);

-- ---------------------------------------------------------------------------
-- Set apart completes it
-- ---------------------------------------------------------------------------

update public.calling_candidates set status = 'set_apart' where person_name = 'Sister One';
select is(
  (select set_apart_on from public.calling_candidates where person_name = 'Sister One'),
  current_date, 'setting apart records the day'
);

update public.calling_candidates set status = 'accepted' where person_name = 'Sister One';
select is(
  (select set_apart_on from public.calling_candidates where person_name = 'Sister One'),
  null, 'taking it back clears the day'
);

select throws_ok(
  $$ update public.calling_candidates set set_apart_on = current_date where person_name = 'Sister One' $$,
  '23514', null,
  'only a set-apart name has a set-apart day'
);

-- ---------------------------------------------------------------------------
-- Declined is final
-- ---------------------------------------------------------------------------

update public.calling_candidates set status = 'declined' where person_name = 'Sister Two';
select is(pg_temp.status('Sister Two'), 'declined', 'a name under consideration can be declined');
select throws_ok(
  $$ update public.calling_candidates set status = 'discussing' where person_name = 'Sister Two' $$,
  '23514', null,
  'a declined name stays declined'
);
select throws_ok(
  $$ update public.calling_needs set status = 'filled' where calling_title = 'Test Chorister' $$,
  '22P02', null,
  'a calling is no longer marked filled by hand'
);

-- ---------------------------------------------------------------------------
-- Release only
-- ---------------------------------------------------------------------------

select pg_temp.act_as('leader@ward.test');
select public.submit_calling_request('release', 'Test Librarian', null, 'Brother Gone', null, null, null);
select public.submit_calling_request('replace', 'Test Clerk', null, 'Brother Moving', null, null, null);

select pg_temp.act_as('first@ward.test');
select is((select release_only from public.calling_needs where calling_title = 'Test Librarian'), true, 'a request to release someone is release only');
select is((select release_only from public.calling_needs where calling_title = 'Test Clerk'), false, 'a request to replace someone is not');

select * from finish();
rollback;
