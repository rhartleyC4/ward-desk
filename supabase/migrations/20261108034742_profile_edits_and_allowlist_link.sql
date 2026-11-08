-- People could update every column of their own profile, email included. Removing someone from
-- the allowlist found their account by profiles.email, so changing it first kept their roles.
--
-- Now:
--   * People may change only their own name. Admins may also set the short name and office.
--     Nobody signed in can change an email; the database owner (seed, Studio) still can.
--   * Each allowlist entry is linked to the account that signed in with it, by profile id, and
--     allowlist changes reach the account through that link instead of the email.

-- ---------------------------------------------------------------------------
-- Profile columns
-- ---------------------------------------------------------------------------

revoke update on public.profiles from anon, authenticated;
grant update (display_name, short_name, office) on public.profiles to authenticated;

-- Replaces guard_profile_office: the same office rule, plus the short name, plus a tidy name.
-- SQL run without a signed-in user (the seed, Studio) is allowed.
drop trigger guard_profile_office on public.profiles;
drop function public.guard_profile_office();

create function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.office is distinct from old.office and not public.has_role('admin') then
    raise exception 'Only an admin can change someone''s office'
      using errcode = '42501';
  end if;
  if new.short_name is distinct from old.short_name and not public.has_role('admin') then
    raise exception 'Only an admin can change someone''s short name'
      using errcode = '42501';
  end if;

  if new.display_name is distinct from old.display_name then
    new.display_name := btrim(new.display_name);
    if coalesce(char_length(new.display_name), 0) not between 1 and 60 then
      raise exception 'A name needs 1 to 60 characters'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Allowlist entry -> account link
-- ---------------------------------------------------------------------------

alter table public.allowlist
  add column profile_id uuid unique references public.profiles (id) on delete set null;

comment on column public.allowlist.profile_id is
  'The account that signed in with this email. Set by the database, never by the app; allowlist changes reach the account through it.';

update public.allowlist a
set profile_id = p.id
from public.profiles p
where p.email = a.email;

-- Admins change roles and position; the email and the link stay as they are.
revoke update on public.allowlist from anon, authenticated;
grant update (initial_roles, initial_office) on public.allowlist to authenticated;

-- A new entry for someone who already has an account links to it straight away.
create function public.link_allowlist_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.profile_id := (select id from public.profiles where email = new.email);
  return new;
end;
$$;

create trigger link_allowlist_profile
  before insert on public.allowlist
  for each row execute function public.link_allowlist_profile();

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

  update public.allowlist set profile_id = new.id where email = invite.email;

  insert into public.roles (user_id, role)
  select new.id, unnest(invite.initial_roles)
  on conflict do nothing;

  return new;
end;
$$;

-- Same rules as before, but the account is found by the link, never by an email.
create or replace function public.sync_allowlist_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member uuid := old.profile_id;
begin
  if member is null then
    return null; -- hasn't signed in yet
  end if;

  if member = (select auth.uid())
     and (tg_op = 'DELETE' or not ('admin' = any (new.initial_roles))) then
    raise exception 'You can''t remove your own admin access'
      using errcode = '42501';
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
