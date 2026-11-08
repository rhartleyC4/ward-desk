-- Ward leaders belong to an organization (Relief Society, Elders Quorum, Primary...), so a
-- leader can be changed: the bishopric picks the organization and names who leads it now.
--
--   * profiles.organization, set from allowlist.initial_organization like the office. Names match
--     the calling list's organizations (callings.organization). One per leader.
--   * Only an admin changes it directly (Access page). A leadership change (handover or a new
--     leader) changes offices and organizations through the allowlist with the setting
--     ward.leadership_change on, which guard_profile_update lets through.
--
-- Additive: the live frontend doesn't read or write these columns.

alter table public.profiles add column organization text check (organization is null or btrim(organization) <> '');
alter table public.allowlist add column initial_organization text check (initial_organization is null or btrim(initial_organization) <> '');

comment on column public.profiles.organization is 'The organization a ward leader leads, matching callings.organization. Set from the allowlist.';
comment on column public.allowlist.initial_organization is 'The organization this ward leader leads; copied to their profile.';

grant update (organization) on public.profiles to authenticated;
grant update (initial_organization) on public.allowlist to authenticated;

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or current_setting('ward.leadership_change', true) = 'on' then
    return new;
  end if;

  if new.office is distinct from old.office and not public.has_role('admin') then
    raise exception 'Only an admin can change someone''s office'
      using errcode = '42501';
  end if;
  if new.organization is distinct from old.organization and not public.has_role('admin') then
    raise exception 'Only an admin can change someone''s organization'
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

  insert into public.profiles (id, email, display_name, office, organization)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), invite.initial_office, invite.initial_organization);

  update public.allowlist set profile_id = new.id where email = invite.email;

  insert into public.roles (user_id, role)
  select new.id, unnest(invite.initial_roles)
  on conflict do nothing;

  return new;
end;
$$;

create or replace function public.sync_allowlist_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member uuid := case when tg_op = 'INSERT' then new.profile_id else old.profile_id end;
begin
  if member is null then
    return null; -- hasn't signed in yet
  end if;

  if tg_op <> 'INSERT'
     and member = (select auth.uid())
     and (tg_op = 'DELETE' or not ('admin' = any (new.initial_roles))) then
    raise exception 'You can''t remove your own admin access'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    delete from public.roles where user_id = member;
    update public.profiles set office = null, organization = null, removed_at = coalesce(removed_at, now())
    where id = member;
  else
    delete from public.roles where user_id = member and role <> all (new.initial_roles);
    insert into public.roles (user_id, role)
    select member, unnest(new.initial_roles)
    on conflict do nothing;
    update public.profiles set office = new.initial_office, organization = new.initial_organization
    where id = member and (office, organization) is distinct from (new.initial_office, new.initial_organization);
  end if;
  return null;
end;
$$;

drop trigger sync_allowlist_roles on public.allowlist;
create trigger sync_allowlist_roles
  after insert or update of initial_roles, initial_office, initial_organization or delete on public.allowlist
  for each row execute function public.sync_allowlist_roles();
