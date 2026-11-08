-- Ward leaders and their organization. Run with `npm run test:db`. Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

create function pg_temp.act_as(user_email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = user_email), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

select is((select organization from public.profiles where email = 'rspres@ward.test'), 'Relief Society', 'a leader''s organization comes from the allowlist');

select pg_temp.act_as('rspres@ward.test');
select throws_ok(
  $$ update public.profiles set organization = 'Primary' where email = 'rspres@ward.test' $$,
  '42501', null, 'a leader can''t change her own organization');

select pg_temp.act_as('first@ward.test');
with changed as (update public.profiles set organization = 'Primary' where email = 'rspres@ward.test' returning 1)
select is((select count(*)::int from changed), 0, 'the bishopric changes leaders through a leadership change, not directly');

select pg_temp.act_as('bishop@ward.test');
update public.allowlist set initial_organization = 'Primary' where email = 'rspres@ward.test';
select is((select organization from public.profiles where email = 'rspres@ward.test'), 'Primary', 'an admin''s change on the allowlist reaches the profile');

update public.profiles set organization = 'Young Women' where email = 'rspres@ward.test';
select is((select organization from public.profiles where email = 'rspres@ward.test'), 'Young Women', 'an admin may set it on the profile too');

select throws_ok(
  $$ update public.allowlist set initial_organization = '  ' where email = 'rspres@ward.test' $$,
  '23514', null, 'a blank organization is refused');

delete from public.allowlist where email = 'rspres@ward.test';
reset role;
select is((select organization from public.profiles where email = 'rspres@ward.test'), null, 'taking someone off the allowlist clears their organization');

select * from finish();
rollback;
