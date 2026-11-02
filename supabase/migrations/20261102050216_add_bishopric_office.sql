-- Which position someone holds in the bishopric. Everyone in it has the 'bishopric' role, but
-- only the bishop and counselors conduct and interview, so those pickers filter on this.
create type public.bishopric_office as enum ('bishop', 'first_counselor', 'second_counselor', 'executive_secretary', 'ward_clerk');

alter table public.profiles add column office public.bishopric_office;

-- People may edit their own profile, but only an admin assigns offices. SQL run without a
-- signed-in user (the seed, Studio) is allowed.
create function public.guard_profile_office()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.office is distinct from old.office
     and (select auth.uid()) is not null
     and not public.has_role('admin') then
    raise exception 'Only an admin can change someone''s office'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_profile_office
  before update on public.profiles
  for each row execute function public.guard_profile_office();
