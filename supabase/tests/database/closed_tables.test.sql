-- Tables the app never reaches: only the database owner, SECURITY DEFINER
-- triggers and the service role use them. Run with `npm run test:db`.
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

select is(
  array(
    select c.relname::text from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'no app access')
    order by 1
  ),
  array['backup_runs', 'health_state', 'notification_outbox', 'notify_calls', 'push_events'],
  'these tables are closed to the app'
);

select is(
  array(
    select c.relname::text from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and (not c.relrowsecurity or not exists (select 1 from pg_policy p where p.polrelid = c.oid))
    order by 1
  ),
  '{}'::text[],
  'every table has RLS on and at least one policy, so none is closed or open by accident'
);

-- A closed table keeps one policy and no grants for the API roles. RLS doesn't
-- cover TRUNCATE, so the missing grant is what stops it.
select is(
  array(
    select distinct g.table_name::text from information_schema.role_table_grants g
    join pg_class c on c.relname = g.table_name and c.relnamespace = 'public'::regnamespace
    where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated')
      and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'no app access')
    order by 1
  ),
  '{}'::text[],
  'anon and signed-in users hold no grants on a closed table'
);

select is(
  array(
    select c.relname::text from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'no app access')
      and (select count(*) from pg_policy p where p.polrelid = c.oid) <> 1
    order by 1
  ),
  '{}'::text[],
  'a closed table has no other policy that could let someone in'
);

set local role authenticated;
select throws_ok('truncate public.push_events', '42501', null, 'a signed-in user can’t empty push_events');

select * from finish();
rollback;
