-- Which SECURITY DEFINER functions the API can reach through /rest/v1/rpc.
-- Run with `npm run test:db`.
--
-- New functions get EXECUTE for public (and from Supabase, anon and authenticated)
-- by default, so a function left reachable by mistake shows up here. RLS helpers
-- belong in the private schema, which the API doesn't expose.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

select is(
  array(
    select p.proname::text
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and has_function_privilege('anon', p.oid, 'execute')
    order by 1
  ),
  array['report_client_error'],
  'anon can execute no SECURITY DEFINER function in public except the error reporter'
);

-- Each of these checks who is calling before it does anything.
select is(
  array(
    select p.proname::text
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')
    order by 1
  ),
  array[
    'accounts_not_signed_in', 'change_leader', 'delete_account', 'delete_agenda_section',
    'delete_agenda_template', 'leadership_work', 'meeting_assignees', 'merge_calling',
    'my_calling_requests', 'my_meeting_assignments', 'report_client_error', 'request_recipients',
    'run_handover', 'save_push_subscription', 'submit_calling_request', 'whoami'
  ],
  'signed-in people can execute only the SECURITY DEFINER functions the app calls'
);

select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot use the private schema');

set local role anon;
select throws_ok(
  $$ select private.attends(gen_random_uuid()) $$,
  '42501', null,
  'an anonymous visitor cannot call attends()'
);
reset role;

-- RLS policies call the helpers as the signed-in person.
select ok(has_function_privilege('authenticated', 'private.attends(uuid)', 'execute'),
  'signed-in people can still execute attends()');
select ok(has_function_privilege('authenticated', 'private.has_role(public.app_role)', 'execute'),
  'signed-in people can still execute has_role()');

select * from finish();
rollback;
