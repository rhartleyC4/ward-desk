-- Match ward terminology. The bishopric role now covers the bishop, both counselors, the
-- executive secretary and the ward clerk. Other called leaders get 'leader' (was 'suggester'),
-- which only submits names for callings. 'scheduler' is retired.

alter type public.app_role rename value 'suggester' to 'leader';

alter policy "suggesters read calling list" on public.callings rename to "leaders read calling list";
alter policy "suggesters submit candidates" on public.calling_candidates rename to "leaders submit candidates";

-- Postgres can't drop an enum value without rebuilding every policy that uses the type, so
-- 'scheduler' stays in the enum but can no longer be held or granted.
delete from public.roles where role = 'scheduler';
update public.allowlist set initial_roles = array_remove(initial_roles, 'scheduler');

alter table public.roles add constraint roles_not_scheduler check (role <> 'scheduler');
alter table public.allowlist add constraint allowlist_not_scheduler check (not ('scheduler' = any (initial_roles)));

create or replace function public.is_planner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('bishopric');
$$;
