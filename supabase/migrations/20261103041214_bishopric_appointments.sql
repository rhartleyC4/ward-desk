-- Appointments the bishopric hands to the executive secretaries. When a name is approved for a
-- calling, the bishopric assigns the bishop or a counselor to extend it; that creates an
-- appointment with no time yet, and the secretary who schedules for that leader books it.
-- Callings are now worked on the bishopric agenda, and interviews live only on the Appointments
-- page, so no agenda shows an interviews section any more.

-- An appointment without a time is waiting to be scheduled.
alter table public.interviews alter column scheduled_at drop not null;

-- One open calling appointment per candidate; reassigning updates it rather than adding another.
create unique index interviews_open_calling_idx on public.interviews (candidate_id)
  where candidate_id is not null and purpose = 'calling' and status = 'scheduled';

create index interviews_interviewer_idx on public.interviews (interviewer_id) where status = 'scheduled';

-- Which secretaries schedule for which leader. Several secretaries may share a leader, and the
-- split changes over time, so it's a list rather than a column on the profile.
create table public.secretary_assignments (
  leader_id uuid not null references public.profiles (id) on delete cascade,
  secretary_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (leader_id, secretary_id),
  check (leader_id <> secretary_id)
);

alter table public.secretary_assignments enable row level security;

create policy "bishopric read secretary assignments" on public.secretary_assignments
  for select to authenticated
  using (public.has_role('bishopric') or public.has_role('admin'));

create policy "bishopric manage secretary assignments" on public.secretary_assignments
  for all to authenticated
  using (public.can_manage_meetings()) with check (public.can_manage_meetings());

-- Positions are left with a gap: legacy_agenda_section() still finds the bishopric sections by
-- position, and the app only sorts by it. Postgres can't drop an enum value without rebuilding
-- what uses the type, so 'interviews' stays in the enum but can no longer be added.
delete from public.agenda_sections where kind = 'interviews';
alter table public.agenda_sections add constraint agenda_sections_not_interviews check (kind <> 'interviews');
