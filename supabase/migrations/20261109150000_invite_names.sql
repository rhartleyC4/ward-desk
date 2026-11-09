-- An admin can enter someone's first and last name before they ever sign in. The name becomes
-- their display name when their account is created, and the Sheets import can create that
-- account ahead of time so the person's trips and Sundays conducting link to them.

alter table public.allowlist
  add column first_name text,
  add column last_name text,
  add constraint allowlist_name_length check (char_length(concat_ws(' ', first_name, last_name)) <= 60);

comment on column public.allowlist.first_name is
  'Entered by an admin before the person signs in. Used once, when their account is created.';
comment on column public.allowlist.last_name is
  'Entered by an admin before the person signs in. Used once, when their account is created.';

grant update (first_name, last_name) on public.allowlist to authenticated;

-- A name an admin entered wins over the one from Google. The person can still change it later.
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
  values (
    new.id,
    new.email,
    coalesce(
      nullif(btrim(concat_ws(' ', invite.first_name, invite.last_name)), ''),
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
    invite.initial_office,
    invite.initial_organization
  );

  update public.allowlist set profile_id = new.id where email = invite.email;

  insert into public.roles (user_id, role)
  select new.id, unnest(invite.initial_roles)
  on conflict do nothing;

  perform public.apply_waiting_seats(new.id, invite.email);

  return new;
end;
$$;

-- Creates an account for each named person on the list who hasn't signed in, and returns how many.
-- For the Sheets import, which connects as the database owner; the app can't call it. The email
-- counts as confirmed so that Google sign-in joins this account instead of starting another.
-- handle_new_user fills in the profile, roles and position.
create function public.create_waiting_accounts()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  created integer;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', lower(a.email::text), now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''
  from public.allowlist a
  where a.profile_id is null
    and btrim(concat_ws(' ', a.first_name, a.last_name)) <> ''
    and not exists (select 1 from auth.users u where lower(u.email) = lower(a.email::text));

  get diagnostics created = row_count;
  return created;
end;
$$;

revoke execute on function public.create_waiting_accounts() from public, anon, authenticated, service_role;
