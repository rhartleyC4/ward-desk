-- Drop 'extended' from candidate_status. The bishopric's steps are Considering, Approved, Accepted
-- and Declined; the app already showed any old 'extended' row as Approved, so that's what they become.
--
-- Postgres can't remove an enum value, so the type is rebuilt. The one policy that names the type
-- has to be dropped around the column change, and calling_request_stage() is replaced because its
-- body still lists 'extended' (a SQL function body is only checked when it runs).

update public.calling_candidates set status = 'approved' where status::text = 'extended';

drop policy "leaders submit candidates" on public.calling_candidates;

alter type public.candidate_status rename to candidate_status_old;
create type public.candidate_status as enum (
  'suggested', 'discussing', 'approved', 'accepted', 'declined', 'sustained', 'set_apart'
);

alter table public.calling_candidates alter column status drop default;
alter table public.calling_candidates
  alter column status type public.candidate_status using status::text::public.candidate_status;
alter table public.calling_candidates alter column status set default 'suggested';

drop type public.candidate_status_old;

create policy "leaders submit candidates" on public.calling_candidates
  for insert to authenticated
  with check (
    public.has_role('leader')
    and suggested_by = (select auth.uid())
    and status = 'suggested'
    and need_id is null
  );

create or replace function public.calling_request_stage(request_id uuid)
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

revoke execute on function public.calling_request_stage(uuid) from public, anon, authenticated;
