-- Accounts can be deleted. Until now, removing someone from the allowlist only took away their
-- roles; their account, profile and sign-in records stayed forever.
--
--   * An admin deletes someone else's account with delete_account(). Their profile and personal
--     rows go with it (roles, away dates, hours, devices, notification choices, stewardships,
--     meeting attendance). Records the ward relies on stay, with the person left blank, shown
--     as "Former member".
--   * profiles.removed_at records when someone lost their last role, so the retention purge can
--     delete accounts that have been off long enough (it calls delete_person()). Getting any
--     role back clears it. A released counselor who becomes a ward leader, or a mentor kept on
--     for a while, still holds a role and isn't removed.
--
-- Deleting doesn't hand anything over: moving open work to a successor is the leadership
-- handover's job, done before anyone is removed.
--
-- Additive for the live frontend: it never deletes accounts, so it never sees the blank sender.

-- ---------------------------------------------------------------------------
-- Requests survive the people in them
-- ---------------------------------------------------------------------------

alter table public.requests
  alter column from_id drop not null,
  alter column to_id drop not null,
  drop constraint requests_from_id_fkey,
  drop constraint requests_to_id_fkey,
  add constraint requests_from_id_fkey foreign key (from_id) references public.profiles (id) on delete set null,
  add constraint requests_to_id_fkey foreign key (to_id) references public.profiles (id) on delete set null;

comment on column public.requests.from_id is 'Who sent it. Null once their account is deleted ("Former member").';
comment on column public.requests.to_id is 'Who it is for. Null once their account is deleted ("Former member").';

alter table public.calling_requests
  alter column requested_by drop not null,
  drop constraint calling_requests_requested_by_fkey,
  add constraint calling_requests_requested_by_fkey foreign key (requested_by) references public.profiles (id) on delete set null;

comment on column public.calling_requests.requested_by is 'Who asked. Null once their account is deleted ("Former member").';

-- The guards on these tables decide who may change what. Blanking a deleted person isn't anyone
-- changing anything, so they stand aside while delete_person() runs.
drop trigger requests_guard on public.requests;
create trigger requests_guard before update on public.requests
  for each row
  when (current_setting('ward.deleting_account', true) is distinct from 'on')
  execute function public.guard_request_change();

drop trigger agenda_assignments_guard on public.agenda_assignments;
create trigger agenda_assignments_guard before insert or update on public.agenda_assignments
  for each row
  when (current_setting('ward.deleting_account', true) is distinct from 'on')
  execute function public.guard_agenda_assignment();

-- ---------------------------------------------------------------------------
-- When someone was removed
-- ---------------------------------------------------------------------------

alter table public.profiles add column removed_at timestamptz;

comment on column public.profiles.removed_at is
  'When this person lost their last role or was taken off the allowlist; null while they hold any role. The retention purge deletes accounts removed long enough ago, with delete_person().';

create index profiles_removed_at_idx on public.profiles (removed_at) where removed_at is not null;

-- Accounts without a role today start their clock now.
update public.profiles p
set removed_at = now()
where not exists (select 1 from public.roles r where r.user_id = p.id);

create function public.track_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set removed_at = null
    where id = new.user_id and removed_at is not null;
  else
    update public.profiles set removed_at = now()
    where id = old.user_id and removed_at is null
      and not exists (select 1 from public.roles where user_id = old.user_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.track_removed() from public, anon, authenticated;

create trigger roles_track_removed
  after insert or delete on public.roles
  for each row execute function public.track_removed();

-- Allowlist changes reach the account, now also when an email is added back: the roles return
-- and the removal clock stops. Taking someone off the allowlist starts it even if they had no
-- roles to lose.
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
    update public.profiles set office = null, removed_at = coalesce(removed_at, now())
    where id = member;
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
  after insert or update of initial_roles, initial_office or delete on public.allowlist
  for each row execute function public.sync_allowlist_roles();

-- ---------------------------------------------------------------------------
-- Deleting
-- ---------------------------------------------------------------------------

-- Deletes an account and everything personal to it, and takes its email off the allowlist so
-- it can't quietly come back. Not callable from the app: delete_account() checks who is asking,
-- and the retention purge calls this directly.
create function public.delete_person(person uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('ward.deleting_account', 'on', true);
  delete from public.allowlist where profile_id = person;
  delete from auth.users where id = person;
  perform set_config('ward.deleting_account', 'off', true);
end;
$$;

revoke execute on function public.delete_person(uuid) from public, anon, authenticated;

create function public.delete_account(person uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role('admin') then
    raise exception 'Only an admin can delete an account' using errcode = '42501';
  end if;
  if person = (select auth.uid()) then
    raise exception 'You can''t delete your own account' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = person) then
    raise exception 'That account doesn''t exist' using errcode = 'P0002';
  end if;
  perform public.delete_person(person);
end;
$$;

revoke execute on function public.delete_account(uuid) from public, anon;
grant execute on function public.delete_account(uuid) to authenticated;
