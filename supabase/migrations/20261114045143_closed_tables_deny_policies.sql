-- Tables the app never reaches. Only the database owner (the notify job, the
-- health check, the backup workflow), SECURITY DEFINER triggers and the push
-- Edge Function's service role use them, and all of those skip RLS.
--
-- RLS with no policies already kept anon and authenticated out of the rows.
-- Two changes make that explicit:
--   * revoke their table grants, as backup_runs already did. RLS doesn't
--     cover TRUNCATE, so this is the only thing that stops it.
--   * add a policy that denies everything, so the intent is in the schema and
--     the advisor stops reporting "RLS enabled, no policy".

revoke all on public.health_state from anon, authenticated;
revoke all on public.notification_outbox from anon, authenticated;
revoke all on public.notify_calls from anon, authenticated;
revoke all on public.push_events from anon, authenticated;

create policy "no app access" on public.backup_runs for all to anon, authenticated using (false) with check (false);
create policy "no app access" on public.health_state for all to anon, authenticated using (false) with check (false);
create policy "no app access" on public.notification_outbox for all to anon, authenticated using (false) with check (false);
create policy "no app access" on public.notify_calls for all to anon, authenticated using (false) with check (false);
create policy "no app access" on public.push_events for all to anon, authenticated using (false) with check (false);
