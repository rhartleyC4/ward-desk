-- The calling list: who may read and change it, and how calling needs stay linked to it.
-- Run with `npm run test:db`. Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

create function pg_temp.act_as(user_email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = user_email), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Called leader: reads the list for the Suggest page, changes nothing
-- ---------------------------------------------------------------------------

select pg_temp.act_as('leader@ward.test');

select ok((select count(*) from public.callings) > 50, 'leader reads the calling list');
select throws_ok(
  $$ insert into public.callings (title) values ('Leader Added') $$,
  '42501', null,
  'leader cannot add to the list'
);
update public.callings set title = 'Renamed by leader' where title = 'Primary Teacher';
select is((select count(*)::int from public.callings where title = 'Primary Teacher'), 1, 'leader cannot rename a calling');

-- ---------------------------------------------------------------------------
-- Bishopric: new titles join the list as they're used
-- ---------------------------------------------------------------------------

select pg_temp.act_as('first@ward.test');

insert into public.calling_needs (calling_title) values ('  Ward Greeter ');
select is(
  (select c.organization from public.calling_needs n join public.callings c on c.id = n.calling_id where n.calling_title = 'Ward Greeter'),
  null, 'a new title joins the list with no organization, for review'
);

insert into public.calling_needs (calling_title) values ('primary teacher');
select is(
  (select c.title from public.calling_needs n join public.callings c on c.id = n.calling_id where n.calling_title = 'primary teacher'),
  'Primary Teacher', 'a known title in other case links to the existing entry'
);
select is((select count(*)::int from public.callings where lower(title) = 'primary teacher'), 1, 'and adds no duplicate');

select throws_ok(
  $$ insert into public.callings (title) values ('WARD GREETER') $$,
  '23505', null,
  'the list holds each title once, ignoring case'
);

-- ---------------------------------------------------------------------------
-- Admin who is not in the bishopric: tidies the list
-- ---------------------------------------------------------------------------

set local role postgres;
select set_config('request.jwt.claims', '', true);
insert into public.allowlist (email, initial_roles) values ('listadmin@ward.test', '{admin}');
insert into auth.users (id, email, aud, role)
  values ('20000000-0000-0000-0000-000000000010', 'listadmin@ward.test', 'authenticated', 'authenticated');
update public.calling_needs set status = 'filled' where calling_title = 'primary teacher';

select pg_temp.act_as('listadmin@ward.test');

select is((select count(*)::int from public.calling_needs), 0, 'an admin outside the bishopric still cannot see calling needs');
select lives_ok(
  $$ update public.callings set title = 'Ward Host', organization = 'Other' where title = 'Ward Greeter' $$,
  'admin renames and groups a list entry'
);
select lives_ok(
  $$ update public.callings set title = 'Primary Class Teacher' where title = 'Primary Teacher' $$,
  'admin renames a handbook title'
);
select lives_ok(
  $$ delete from public.callings where title = 'Interpreter' $$,
  'admin removes a list entry'
);

select pg_temp.act_as('first@ward.test');

select is((select count(*)::int from public.calling_needs where calling_title = 'Ward Host'), 1, 'renaming updates the open calling that used the old title');
select is(
  (select array_agg(calling_title order by calling_title)::text from public.calling_needs where calling_id = (select id from public.callings where title = 'Primary Class Teacher')),
  '{"Primary Class Teacher","primary teacher"}', 'open needs take the new name; a filled one keeps its history'
);
select is((select count(*)::int from public.callings where title = 'Interpreter'), 0, 'the removed entry is gone for everyone');

-- ---------------------------------------------------------------------------
-- Merging a stray title into the right one
-- ---------------------------------------------------------------------------

insert into public.calling_needs (calling_title) values ('YW Sec');
insert into public.calling_needs (calling_title, status) values ('YW Sec', 'filled');
insert into public.calling_candidates (calling_title, person_name) values ('yw sec', 'Sister Merge');
create temp table merge_ids as
  select (select id from public.callings where title = 'YW Sec') as stray, (select id from public.callings where title = 'Young Women Secretary') as keep;
grant select on merge_ids to authenticated;

select throws_ok(
  $$ select public.merge_calling(stray, keep) from merge_ids $$,
  '42501', null,
  'bishopric who is not admin cannot merge'
);

select pg_temp.act_as('listadmin@ward.test');

select throws_ok(
  $$ select public.merge_calling(keep, keep) from merge_ids $$,
  'P0001', null,
  'a calling cannot merge into itself'
);
select lives_ok($$ select public.merge_calling(stray, keep) from merge_ids $$, 'admin merges a stray title');

select pg_temp.act_as('first@ward.test');

select is((select count(*)::int from public.callings where title = 'YW Sec'), 0, 'the stray title leaves the list');
select is(
  (select count(*)::int from public.calling_needs where status = 'open' and calling_title = 'Young Women Secretary' and calling_id = (select keep from merge_ids)),
  1, 'the open calling takes the right title'
);
select is(
  (select calling_title from public.calling_needs where status = 'filled' and calling_id = (select keep from merge_ids)),
  'YW Sec', 'a filled calling keeps its title but points at the right entry'
);
select is(
  (select calling_title from public.calling_candidates where person_name = 'Sister Merge'),
  'Young Women Secretary', 'an unsorted suggestion takes the right title'
);

select * from finish();
rollback;
