-- Mentoring: after a change of bishopric the outgoing bishop may keep access for a few weeks to
-- help the new one. He works *as* the new bishop: everything he does is recorded as the new
-- bishop, and he sees what the new bishop sees (callings only if the new bishop allows it).
--
--   * delegations says who may act for whom, until when. The handover creates them; the person
--     acted for may extend (never past 12 weeks from the start), end it, or allow callings.
--   * The app picks the identity for each request with the header `x-acting-as: <their id>`.
--     acting_as() returns that person only while the signed-in person holds an open delegation
--     for them and they're still in the bishopric; anything else gives back the signed-in
--     person. The header only selects, it never grants.
--   * has_role() and has_any_role() answer for acting_as(). While mentoring, only the
--     bishopric role carries over: never admin, never leader.
--
-- Additive: without the header (the live frontend never sends it) acting_as() is auth.uid(), so
-- nothing changes.

create table public.delegations (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles (id) on delete cascade,
  for_id uuid not null references public.profiles (id) on delete cascade,
  handover_id uuid, -- the handover that started it; linked once handovers exist
  sees_callings boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint delegations_not_self check (mentor_id <> for_id),
  constraint delegations_length check (ends_at > starts_at and ends_at <= starts_at + interval '12 weeks')
);

comment on table public.delegations is 'Who may use Ward Desk as someone else (a mentor for the new bishop), until when.';
comment on column public.delegations.sees_callings is 'Whether the mentor sees calling discussions. The person acted for decides; off to begin with.';

create unique index delegations_one_open_idx on public.delegations (mentor_id) where ended_at is null;
create index delegations_for_idx on public.delegations (for_id) where ended_at is null;

alter table public.delegations enable row level security;

-- Always the real people: acting for someone never shows or changes their delegations.
create policy "mentor and mentored read delegations" on public.delegations
  for select to authenticated
  using (mentor_id = (select auth.uid()) or for_id = (select auth.uid()));

create policy "mentored change delegations" on public.delegations
  for update to authenticated
  using (for_id = (select auth.uid())) with check (for_id = (select auth.uid()));

revoke insert, update, delete on public.delegations from anon, authenticated;
grant update (sees_callings, ends_at, ended_at) on public.delegations to authenticated;

-- Ending is for good; an end date can be moved but not before now.
create function public.guard_delegation_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if old.ended_at is not null and (new.ended_at is distinct from old.ended_at or new.ends_at is distinct from old.ends_at) then
    raise exception 'Mentoring has ended' using errcode = '42501';
  end if;
  if new.ended_at is not null and old.ended_at is null then
    new.ended_at := now();
  end if;
  if new.ends_at is distinct from old.ends_at and new.ends_at < now() then
    raise exception 'Pick a date that hasn''t passed' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger delegations_guard before update on public.delegations
  for each row execute function public.guard_delegation_change();

-- ---------------------------------------------------------------------------
-- Who a request acts as
-- ---------------------------------------------------------------------------

create function public.acting_as()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  wanted text := nullif(current_setting('request.headers', true), '')::json ->> 'x-acting-as';
  target uuid;
begin
  if me is null or wanted is null or wanted !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return me;
  end if;
  target := wanted::uuid;
  if target <> me
     and exists (
       select 1 from public.delegations d
       where d.mentor_id = me and d.for_id = target and d.ended_at is null
         and now() >= d.starts_at and now() < d.ends_at
     )
     and exists (select 1 from public.roles r where r.user_id = target and r.role = 'bishopric') then
    return target;
  end if;
  return me;
end;
$$;

comment on function public.acting_as() is 'The person this request acts as: the signed-in person, or whoever they mentor when the x-acting-as header names them and an open delegation allows it.';

create function public.is_mentoring()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.acting_as()) is distinct from (select auth.uid());
$$;

-- Callings stay with the bishopric; a mentor sees them only when the new bishop allows it.
create function public.can_see_callings()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('bishopric')
    and (
      not public.is_mentoring()
      or exists (
        select 1 from public.delegations d
        where d.mentor_id = (select auth.uid()) and d.for_id = (select public.acting_as())
          and d.ended_at is null and d.sees_callings
      )
    );
$$;

revoke execute on function public.acting_as() from public, anon;
revoke execute on function public.is_mentoring() from public, anon;
revoke execute on function public.can_see_callings() from public, anon;
grant execute on function public.acting_as() to authenticated;
grant execute on function public.is_mentoring() to authenticated;
grant execute on function public.can_see_callings() to authenticated;

-- While mentoring, only the bishopric role carries over.
create or replace function public.has_role(check_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.roles
    where user_id = (select public.acting_as()) and role = check_role
  )
  and (check_role = 'bishopric' or (select public.acting_as()) = (select auth.uid()));
$$;

create or replace function public.has_any_role()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.roles where user_id = (select public.acting_as()));
$$;
