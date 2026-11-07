-- Callings follow fixed steps, and being set apart is what completes one.
--
-- A name goes Considering -> Approved -> Accepted, is sustained on its sustain date (worked out from
-- the date, never stored), and is then set apart. A declined name is final; to ask again, add the
-- name again. Only one name per calling can be approved at a time. The only steps back are for a
-- mis-tap: Approved -> Considering, Accepted -> Approved before the sustain date, and Set apart ->
-- Accepted.
--
-- A calling is done once its name is set apart, or, for a release with no one new, once the
-- release is announced. That is worked out from the dates, so an agenda for any day shows what was
-- still open that day. The calling's own status only says whether it's still wanted: 'open' or
-- 'cancelled' ("no longer needed"). The old manual 'filled' goes away, and so does 'sustained' on
-- names.

-- ---------------------------------------------------------------------------
-- Release-only callings
-- ---------------------------------------------------------------------------

alter table public.calling_needs add column release_only boolean not null default false;

comment on column public.calling_needs.release_only is 'Someone is released and no one new is called. Done once release_on has come.';

update public.calling_needs n set release_only = true
from public.calling_requests r
where r.need_id = n.id and r.kind = 'release';

-- submit_calling_request() makes the calling before the request, so the request marks it.
create function public.mark_release_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.calling_needs set release_only = true where id = new.need_id;
  return new;
end;
$$;

revoke execute on function public.mark_release_only() from public, anon, authenticated;

create trigger calling_requests_release_only after insert on public.calling_requests
  for each row when (new.kind = 'release' and new.need_id is not null)
  execute function public.mark_release_only();

-- ---------------------------------------------------------------------------
-- Set apart
-- ---------------------------------------------------------------------------

alter table public.calling_candidates add column set_apart_on date;

comment on column public.calling_candidates.set_apart_on is 'The day they were set apart. Null on a set-apart name means the date isn''t known (it came from the sheet or before this was tracked).';

-- ---------------------------------------------------------------------------
-- Move the existing rows onto the new steps
-- ---------------------------------------------------------------------------

-- A calling marked filled with an accepted name: that name was the one, so it's set apart (date
-- unknown), which keeps the calling done.
with picked as (
  select distinct on (c.need_id) c.id
  from public.calling_candidates c
  join public.calling_needs n on n.id = c.need_id
  where n.status::text = 'filled' and c.status::text in ('accepted', 'sustained', 'set_apart')
  order by c.need_id, array_position(array['set_apart', 'sustained', 'accepted'], c.status::text), c.updated_at desc
)
update public.calling_candidates c set status = 'set_apart', sustain_on = coalesce(c.sustain_on, c.updated_at::date)
from picked where c.id = picked.id;

-- Filled with no accepted name but someone to release: treat it as a release that happened.
update public.calling_needs n
set release_only = true, release_on = coalesce(n.release_on, n.updated_at::date)
where n.status::text = 'filled' and n.release_name is not null
  and not exists (select 1 from public.calling_candidates c where c.need_id = n.id and c.status::text = 'set_apart');

-- Anything else marked filled was only being hidden from the list.
update public.calling_needs n set status = 'cancelled'
where n.status::text = 'filled'
  and not exists (select 1 from public.calling_candidates c where c.need_id = n.id and c.status::text = 'set_apart')
  and n.release_name is null;

-- 'sustained' is worked out from the date now. A row without one gets the day it was last changed.
update public.calling_candidates set status = 'accepted', sustain_on = coalesce(sustain_on, updated_at::date)
where status::text = 'sustained';

-- One approved name per calling: keep the one furthest along and send the rest back to Considering.
with ranked as (
  select id, row_number() over (
    partition by need_id
    order by array_position(array['set_apart', 'accepted', 'approved'], status::text), updated_at desc
  ) as n
  from public.calling_candidates
  where need_id is not null and status::text in ('approved', 'accepted', 'set_apart')
)
update public.calling_candidates c set status = 'discussing', sustain_on = null
from ranked where ranked.id = c.id and ranked.n > 1;

-- ---------------------------------------------------------------------------
-- Rebuild the two status types without 'filled' and 'sustained'
-- ---------------------------------------------------------------------------

-- Postgres can't remove an enum value. The one policy that names candidate_status has to be dropped
-- around the column change; calling_request_stage() is replaced below.
drop policy "leaders submit candidates" on public.calling_candidates;

alter type public.candidate_status rename to candidate_status_old;
create type public.candidate_status as enum ('suggested', 'discussing', 'approved', 'accepted', 'declined', 'set_apart');
alter table public.calling_candidates alter column status drop default;
alter table public.calling_candidates
  alter column status type public.candidate_status using status::text::public.candidate_status;
alter table public.calling_candidates alter column status set default 'suggested';
drop type public.candidate_status_old;

update public.calling_needs set status = 'open' where status::text = 'filled';

alter type public.need_status rename to need_status_old;
create type public.need_status as enum ('open', 'cancelled');
alter table public.calling_needs alter column status drop default;
alter table public.calling_needs
  alter column status type public.need_status using status::text::public.need_status;
alter table public.calling_needs alter column status set default 'open';
drop type public.need_status_old;

create policy "leaders submit candidates" on public.calling_candidates
  for insert to authenticated
  with check (
    public.has_role('leader')
    and suggested_by = (select auth.uid())
    and status = 'suggested'
    and need_id is null
  );

-- ---------------------------------------------------------------------------
-- The rules
-- ---------------------------------------------------------------------------

alter table public.calling_candidates
  add constraint calling_candidates_set_apart_on check (set_apart_on is null or status = 'set_apart');

create unique index calling_candidates_one_approved on public.calling_candidates (need_id)
  where status in ('approved', 'accepted', 'set_apart');

create function public.check_candidate_step()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not (
    (old.status = 'suggested' and new.status in ('discussing', 'approved', 'declined'))
    or (old.status = 'discussing' and new.status in ('approved', 'declined'))
    or (old.status = 'approved' and new.status in ('discussing', 'accepted', 'declined'))
    or (old.status = 'accepted' and new.status in ('approved', 'set_apart'))
    or (old.status = 'set_apart' and new.status = 'accepted')
  ) then
    raise exception 'A name can''t go from % to %', old.status, new.status
      using errcode = 'check_violation', hint = 'A declined name is final; add the name again instead.';
  end if;

  -- Taking back an accept: only before they're sustained. Clear the dates accepting set.
  if old.status = 'accepted' and new.status = 'approved' then
    if old.sustain_on is not null and old.sustain_on <= current_date then
      raise exception 'They have already been sustained' using errcode = 'check_violation';
    end if;
    new.sustain_on := null;
    update public.calling_needs set release_on = null
    where id = new.need_id and not release_only and release_on = old.sustain_on;
  end if;

  if new.status = 'set_apart' then
    new.set_apart_on := coalesce(new.set_apart_on, current_date);
    if new.sustain_on is null or new.sustain_on > new.set_apart_on then
      raise exception 'Someone is set apart after they are sustained' using errcode = 'check_violation';
    end if;
  else
    new.set_apart_on := null;
  end if;

  return new;
end;
$$;

create trigger calling_candidates_step before update of status on public.calling_candidates
  for each row when (old.status is distinct from new.status)
  execute function public.check_candidate_step();

-- ---------------------------------------------------------------------------
-- What the leader sees: finished once the person is set apart (or released)
-- ---------------------------------------------------------------------------

create or replace function public.calling_request_stage(request_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- A request for a change whose calling was removed or is no longer needed is closed.
    when r.kind <> 'suggest' and (n.id is null or n.status <> 'open') then 'finished'
    when r.kind = 'release' and n.release_on is not null and n.release_on <= current_date then 'finished'
    when r.kind <> 'release' and exists (
      select 1 from public.calling_candidates c
      where c.need_id = n.id and c.status = 'set_apart' and coalesce(c.set_apart_on, current_date) <= current_date
    ) then 'finished'
    -- Suggested names are finished once the bishopric has decided on each of them.
    when r.kind = 'suggest' and not exists (
      select 1 from public.calling_candidates c
      where c.request_id = r.id and c.status in ('suggested', 'discussing', 'approved')
    ) then 'finished'
    when n.release_on is not null or exists (
      select 1 from public.calling_candidates c
      where (c.need_id = n.id or c.request_id = r.id) and c.status <> 'suggested'
    ) then 'in_progress'
    when r.received_at is not null then 'received'
    else 'sent'
  end
  from public.calling_requests r
  left join public.calling_needs n on n.id = r.need_id
  where r.id = request_id;
$$;
