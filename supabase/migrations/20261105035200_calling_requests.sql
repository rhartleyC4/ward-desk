-- Calling requests: a ward leader asks the bishopric to fill a calling, release someone, or both,
-- and may suggest names. The request lands on the bishopric agenda as a calling to fill and goes
-- to the bishopric member over that organization, who marks it received.
--
-- Callings stay confidential. Leaders still can't read calling_needs or calling_candidates; they
-- submit through submit_calling_request() and follow their own requests through
-- my_calling_requests(), which says only how far along each one is, never names or decisions.
--
-- Additive: the live frontend keeps sending loose suggestions the old way.

create type public.calling_request_kind as enum (
  'fill',    -- a calling is empty
  'release', -- someone should be released; no replacement asked for
  'replace', -- release someone and call someone new
  'suggest'  -- names for a calling, without asking for a change
);

create table public.calling_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind public.calling_request_kind not null,
  calling_title text not null check (btrim(calling_title) <> ''),
  organization text,
  release_name text,
  needed_by date,
  notes text,
  need_id uuid references public.calling_needs (id) on delete set null,
  routed_to uuid[] not null default '{}', -- bishopric members it was sent to
  received_by uuid references public.profiles (id) on delete set null,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  constraint calling_requests_release_name check ((kind in ('release', 'replace')) = (release_name is not null))
);

comment on table public.calling_requests is 'A ward leader''s request for a calling change. Leaders read their own through my_calling_requests().';

create index calling_requests_need_idx on public.calling_requests (need_id) where need_id is not null;
create index calling_requests_waiting_idx on public.calling_requests (created_at) where received_at is null;

-- Names that came with a request, so the agenda can say who suggested them.
alter table public.calling_candidates add column request_id uuid references public.calling_requests (id) on delete set null;

alter table public.calling_requests enable row level security;

create policy "bishopric read calling requests" on public.calling_requests
  for select to authenticated using (public.has_role('bishopric'));

create policy "bishopric update calling requests" on public.calling_requests
  for update to authenticated
  using (public.has_role('bishopric')) with check (public.has_role('bishopric'));

create policy "bishopric delete calling requests" on public.calling_requests
  for delete to authenticated using (public.has_role('bishopric'));

-- Nobody inserts directly; submit_calling_request() does, so it can add the calling to fill too.

-- ---------------------------------------------------------------------------
-- Routing
-- ---------------------------------------------------------------------------

-- The bishop and counselors whose bishopric assignment names this organization. When no one's
-- does, the bishop; when there's no bishop yet, everyone in the bishopric.
create function public.calling_request_recipients(org text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with leaders as (
    select p.id, p.office from public.profiles p
    where p.office in ('bishop', 'first_counselor', 'second_counselor') and public.holds_role(p.id, 'bishopric')
  ),
  over as (
    select distinct l.id from leaders l
    join public.stewardships s on s.user_id = l.id
    where org is not null and lower(btrim(s.area)) = lower(btrim(org))
  )
  select coalesce(
    (select array_agg(id order by id) from over),
    (select array_agg(id order by id) from leaders where office = 'bishop'),
    (select array_agg(user_id order by user_id) from public.roles where role = 'bishopric'),
    '{}'
  );
$$;

revoke execute on function public.calling_request_recipients(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Submitting
-- ---------------------------------------------------------------------------

create function public.submit_calling_request(
  request_kind public.calling_request_kind,
  title text,
  org text default null,
  releasing text default null,
  needed date default null,
  request_notes text default null,
  names text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  clean_title text := regexp_replace(btrim(coalesce(title, '')), '\s+', ' ', 'g');
  clean_release text := nullif(btrim(coalesce(releasing, '')), '');
  clean_org text := nullif(btrim(coalesce(org, '')), '');
  clean_notes text := nullif(btrim(coalesce(request_notes, '')), '');
  new_need uuid;
  new_request uuid;
  person text;
begin
  if me is null or not (public.has_role('leader') or public.has_role('bishopric')) then
    raise exception 'Only ward leaders and the bishopric can send calling requests' using errcode = '42501';
  end if;
  if clean_title = '' then
    raise exception 'Say which calling' using errcode = '22023';
  end if;
  if request_kind in ('release', 'replace') and clean_release is null then
    raise exception 'Say who should be released' using errcode = '22023';
  end if;
  if request_kind in ('fill', 'suggest') then
    clean_release := null;
  end if;
  if request_kind = 'suggest' and not exists (select 1 from unnest(names) n where btrim(n) <> '') then
    raise exception 'Add at least one name to suggest' using errcode = '22023';
  end if;

  -- The calling list knows most callings' organization; the leader's pick is the fallback.
  clean_org := coalesce((select c.organization from public.callings c where lower(c.title) = lower(clean_title)), clean_org);

  -- Anything but a plain suggestion becomes a calling on the bishopric's list right away.
  if request_kind <> 'suggest' then
    insert into public.calling_needs (calling_title, release_name)
    values (clean_title, clean_release)
    returning id into new_need;
  end if;

  insert into public.calling_requests (requested_by, kind, calling_title, organization, release_name, needed_by, notes, need_id, routed_to)
  values (me, request_kind, clean_title, clean_org, clean_release, needed, clean_notes, new_need, public.calling_request_recipients(clean_org))
  returning id into new_request;

  foreach person in array coalesce(names, '{}') loop
    if btrim(person) <> '' then
      insert into public.calling_candidates (need_id, calling_title, person_name, status, suggested_by, request_id)
      values (new_need, clean_title, btrim(person), 'suggested', me, new_request);
    end if;
  end loop;

  return new_request;
end;
$$;

revoke execute on function public.submit_calling_request(public.calling_request_kind, text, text, text, date, text, text[]) from public, anon;
grant execute on function public.submit_calling_request(public.calling_request_kind, text, text, text, date, text, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- What the leader sees
-- ---------------------------------------------------------------------------

-- How far along a request is, in words a leader may see:
--   sent        not opened yet
--   received    a bishopric member has it
--   in_progress the bishopric has started on it (a name is being considered, a release is set)
--   finished    filled, released, or closed. Deliberately doesn't say which, or who.
create function public.calling_request_stage(request_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- A request for a change whose calling was removed is closed.
    when r.kind <> 'suggest' and (n.id is null or n.status <> 'open') then 'finished'
    when r.kind = 'release' and n.release_on is not null and n.release_on <= current_date then 'finished'
    when r.kind <> 'release' and exists (
      select 1 from public.calling_candidates c
      where c.need_id = n.id and c.status in ('accepted', 'sustained', 'set_apart') and c.sustain_on <= current_date
    ) then 'finished'
    -- Suggested names are finished once the bishopric has decided on each of them.
    when r.kind = 'suggest' and not exists (
      select 1 from public.calling_candidates c
      where c.request_id = r.id and c.status in ('suggested', 'discussing', 'approved', 'extended')
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

revoke execute on function public.calling_request_stage(uuid) from public, anon, authenticated;

create function public.my_calling_requests()
returns table (
  id uuid,
  kind public.calling_request_kind,
  calling_title text,
  organization text,
  release_name text,
  needed_by date,
  notes text,
  names text[],
  created_at timestamptz,
  received_at timestamptz,
  received_by_name text,
  stage text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.kind, r.calling_title, r.organization, r.release_name, r.needed_by, r.notes,
    -- Only the names this leader suggested, as they typed them.
    coalesce((select array_agg(c.person_name order by c.created_at) from public.calling_candidates c where c.request_id = r.id), '{}'),
    r.created_at, r.received_at, p.display_name, public.calling_request_stage(r.id)
  from public.calling_requests r
  left join public.profiles p on p.id = r.received_by
  where r.requested_by = (select auth.uid())
  order by r.created_at desc;
$$;

revoke execute on function public.my_calling_requests() from public, anon;
grant execute on function public.my_calling_requests() to authenticated;
