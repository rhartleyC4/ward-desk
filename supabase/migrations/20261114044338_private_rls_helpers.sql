-- Move the RLS helpers out of the API.
--
-- RLS policies call these as the signed-in user, so authenticated needs EXECUTE.
-- In public, that also made each one an endpoint at /rest/v1/rpc/<name>. Most
-- only answer questions about the caller, but holds_role(person, role) and
-- has_a_role(person) told any signed-in person whether someone else held a role
-- (admin, leader, ...), which the roles table itself doesn't show them.
--
-- The API exposes only public and graphql_public, so the helpers live in
-- `private` from now on. Policies and column defaults refer to functions by
-- OID and follow the move. Function bodies refer to them by name, so every
-- body that calls one is recreated below to call private.<name> instead.
--
-- New RLS helpers go in private too. Only functions the app calls with
-- .rpc() belong in public.

create schema private;
grant usage on schema private to authenticated, service_role;

alter function public.acting_as() set schema private;
alter function public.attends(uuid) set schema private;
alter function public.attends_section(uuid) set schema private;
alter function public.can_manage_meetings() set schema private;
alter function public.can_see_callings() set schema private;
alter function public.can_use_prayer_roll() set schema private;
alter function public.has_a_role(uuid) set schema private;
alter function public.has_any_role() set schema private;
alter function public.has_role(public.app_role) set schema private;
alter function public.hears_ward_changes() set schema private;
alter function public.holds_role(uuid, public.app_role) set schema private;
alter function public.is_mentoring() set schema private;
alter function public.is_planner() set schema private;

-- Recreate every function whose body still calls public.<helper>(...).
-- CREATE OR REPLACE keeps each function's owner and grants.
do $$
declare
  helpers constant text := 'acting_as|attends_section|attends|can_manage_meetings|can_see_callings|can_use_prayer_roll|has_a_role|has_any_role|has_role|hears_ward_changes|holds_role|is_mentoring|is_planner';
  pattern constant text := 'public\.(' || helpers || ')(\s*\()';
  f record;
begin
  for f in
    select p.oid from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
      and p.prosrc ~ pattern
  loop
    execute regexp_replace(pg_get_functiondef(f.oid), pattern, 'private.\1\2', 'g');
  end loop;

  if exists (
    select 1 from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and p.prosrc ~ pattern
  ) then
    raise exception 'A function still calls a helper in public';
  end if;
end;
$$;
