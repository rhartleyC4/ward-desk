-- Admins choose someone's bishopric position when they add them, the same way as their roles.
-- It's applied at first sign-in, and later changes reach the profile right away, so the
-- Conducting and Interviewer pickers always match the Access page.

alter table public.allowlist add column initial_office public.bishopric_office;

-- Carry over positions already set by hand, so the Access page shows them.
update public.allowlist a
set initial_office = p.office
from public.profiles p
where p.email = a.email and p.office is not null and 'bishopric' = any (a.initial_roles);

alter table public.allowlist add constraint allowlist_office_needs_bishopric
  check (initial_office is null or 'bishopric' = any (initial_roles));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.allowlist;
begin
  select * into invite from public.allowlist where lower(email::text) = lower(new.email);
  if not found then
    raise exception 'Email % is not on the allowlist', new.email
      using errcode = 'P0001';
  end if;

  insert into public.profiles (id, email, display_name, office)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), invite.initial_office);

  insert into public.roles (user_id, role)
  select new.id, unnest(invite.initial_roles)
  on conflict do nothing;

  return new;
end;
$$;

-- Same as before, plus the position. Removing an email also clears it, so a released
-- counselor drops out of the pickers.
create or replace function public.sync_allowlist_roles()
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
    update public.profiles set office = null where id = member and office is not null;
  else
    delete from public.roles where user_id = member and role <> all (new.initial_roles);
    insert into public.roles (user_id, role)
    select member, unnest(new.initial_roles)
    on conflict do nothing;
    update public.profiles set office = new.initial_office
    where id = member and office is distinct from new.initial_office;
  end if;
  return null;
end;
$$;

drop trigger sync_allowlist_roles on public.allowlist;
create trigger sync_allowlist_roles
  after update of initial_roles, initial_office or delete on public.allowlist
  for each row execute function public.sync_allowlist_roles();
