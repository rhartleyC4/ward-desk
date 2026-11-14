-- RLS policies run their role checks once per query, not once per row.
-- Run with `npm run test:db`.
--
-- Write `(select private.has_role('bishopric'))`, not `private.has_role('bishopric')`.
-- A helper that takes a column, like attends(template_id), can't be wrapped and isn't checked.
begin;
create extension if not exists pgtap with schema extensions;

select plan(2);

select is(
  array(
    select schemaname || '.' || tablename || ': ' || policyname
    from pg_policies
    where schemaname in ('public', 'realtime', 'storage')
      and (qual ~ $re$(?<!SELECT )private\.\w+\((?:'\w+'::(?:public\.)?app_role)?\)$re$
        or with_check ~ $re$(?<!SELECT )private\.\w+\((?:'\w+'::(?:public\.)?app_role)?\)$re$)
    order by 1
  ),
  '{}'::text[],
  'no policy calls a role helper once per row'
);

-- The same holds for auth.uid(), which Supabase's performance advisor checks too.
select is(
  array(
    select schemaname || '.' || tablename || ': ' || policyname
    from pg_policies
    where schemaname in ('public', 'realtime', 'storage')
      and (qual ~ $re$(?<!SELECT )auth\.(uid|jwt|role)\(\)$re$
        or with_check ~ $re$(?<!SELECT )auth\.(uid|jwt|role)\(\)$re$)
    order by 1
  ),
  '{}'::text[],
  'no policy calls auth.uid() once per row'
);

select * from finish();
rollback;
