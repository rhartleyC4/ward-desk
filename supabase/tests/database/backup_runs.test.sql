-- The backup marker table: the app's roles can neither read nor write it.
-- Run with `npm run test:db`.
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

select has_table('public', 'backup_runs', 'backup_runs exists');
select ok((select relrowsecurity from pg_class where oid = 'public.backup_runs'::regclass), 'row level security is on');

insert into public.backup_runs (object_key, bytes) values ('production/daily/test.dump.age', 1234);

set local role authenticated;
select throws_ok('select count(*) from public.backup_runs', '42501', null, 'a signed-in user can’t read backup runs');
select throws_ok($$insert into public.backup_runs (object_key, bytes) values ('x', 1)$$, '42501', null, 'a signed-in user can’t add a backup run');

set local role anon;
select throws_ok('select count(*) from public.backup_runs', '42501', null, 'an anonymous visitor can’t read backup runs');

select * from finish();
rollback;
