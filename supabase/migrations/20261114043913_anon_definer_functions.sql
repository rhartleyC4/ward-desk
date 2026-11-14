-- Signed-out visitors could call the access helpers through /rest/v1/rpc, because
-- Postgres grants EXECUTE to public and Supabase grants it to anon by default.
-- They only ever answer "no" for anon, but they run as their owner and have no
-- reason to be reachable before sign-in. Every RLS policy that uses them is
-- `to authenticated`, so they keep working.
revoke execute on function public.attends(uuid) from public, anon;
revoke execute on function public.attends_section(uuid) from public, anon;
revoke execute on function public.can_manage_meetings() from public, anon;
revoke execute on function public.can_use_prayer_roll() from public, anon;
revoke execute on function public.has_any_role() from public, anon;
revoke execute on function public.has_role(public.app_role) from public, anon;
revoke execute on function public.is_planner() from public, anon;

-- Trigger functions run whatever their caller's grants, so no API role needs them.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.link_allowlist_profile() from public, anon, authenticated;
revoke execute on function public.sync_allowlist_roles() from public, anon, authenticated;

-- report_client_error stays callable by anon on purpose: errors on the sign-in
-- page are reported before anyone signs in.
