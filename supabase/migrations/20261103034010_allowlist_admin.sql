-- Admins manage the allowlist in the app. It used to matter only at first sign-in; now
-- changing someone's roles or removing them also applies to an account they already have.

alter table public.allowlist alter column invited_by set default auth.uid();

-- Removing an email takes away every role, so the person lands on "no access" and RLS shows
-- them nothing. An admin can't remove their own admin access, so the ward is never locked out.
-- SQL run without a signed-in user (the seed, Studio) skips that check.
create function public.sync_allowlist_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member uuid;
begin
  if (select auth.uid()) is not null
     and old.email = (select email from public.profiles where id = (select auth.uid()))
     and (tg_op = 'DELETE' or not ('admin' = any (new.initial_roles))) then
    raise exception 'You can''t remove your own admin access'
      using errcode = '42501';
  end if;

  -- citext, so this matches regardless of case.
  select id into member from public.profiles where email = old.email;
  if member is null then
    return null;
  end if;

  if tg_op = 'DELETE' then
    delete from public.roles where user_id = member;
  else
    delete from public.roles where user_id = member and role <> all (new.initial_roles);
    insert into public.roles (user_id, role)
    select member, unnest(new.initial_roles)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger sync_allowlist_roles
  after update of initial_roles or delete on public.allowlist
  for each row execute function public.sync_allowlist_roles();
