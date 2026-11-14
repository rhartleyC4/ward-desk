-- Run each policy's role check once per query, not once per row.
--
-- A policy like `using (private.has_role('bishopric'))` calls the helper for
-- every row the query reads, and SECURITY DEFINER functions are never inlined,
-- so each call is its own lookup in roles. Written as
-- `using ((select private.has_role('bishopric')))`, Postgres runs it once as an
-- initplan and reuses the answer. Reading 2,100 callings as the bishop went
-- from 49 ms to 3 ms locally.
--
-- Only calls that don't depend on the row can be wrapped: no arguments, or a
-- role literal. Calls that pass a column, like attends(template_id), stay as
-- they are. What each policy allows doesn't change.
--
-- New policies should wrap these calls too. supabase/tests/database/
-- policy_performance.test.sql fails on one that doesn't.

do $$
declare
  -- A helper call with no arguments or a single role literal, not already
  -- inside a scalar subquery. app_role deparses unqualified because public is
  -- on the search path; the replacement qualifies it.
  pattern constant text := $re$(?<!SELECT )private\.(\w+)\((?:'(\w+)'::(?:public\.)?app_role)?\)$re$;
  p record;
  wrap_using text;
  wrap_check text;
begin
  perform set_config('search_path', 'public, extensions', true);

  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public', 'realtime', 'storage')
      and (qual ~ pattern or with_check ~ pattern)
  loop
    wrap_using := regexp_replace(p.qual, pattern, '(select private.\1(\2))', 'g');
    wrap_check := regexp_replace(p.with_check, pattern, '(select private.\1(\2))', 'g');
    -- The second capture is the role name without its quotes and cast.
    wrap_using := regexp_replace(wrap_using, $re$\(select private\.(\w+)\((\w+)\)\)$re$, $r$(select private.\1('\2'::public.app_role))$r$, 'g');
    wrap_check := regexp_replace(wrap_check, $re$\(select private\.(\w+)\((\w+)\)\)$re$, $r$(select private.\1('\2'::public.app_role))$r$, 'g');

    if p.qual is not null then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, wrap_using);
    end if;
    if p.with_check is not null then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, wrap_check);
    end if;
  end loop;

  if exists (
    select 1 from pg_policies
    where schemaname in ('public', 'realtime', 'storage') and (qual ~ pattern or with_check ~ pattern)
  ) then
    raise exception 'A policy still calls a helper once per row';
  end if;
end;
$$;
