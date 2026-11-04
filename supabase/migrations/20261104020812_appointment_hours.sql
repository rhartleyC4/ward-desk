-- When the bishop and counselors are free for appointments, so the executive secretaries can offer
-- times. Each leader sets usual weekly hours once, then changes a single date when a week is
-- different. Away dates (absences) still take a whole day out on top of this.

-- Usual hours: one row per block of time on a weekday. A leader may have several blocks a day.
create table public.availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday, as in src/lib/dates.ts
  starts_at time not null,
  ends_at time not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index availability_user_idx on public.availability (user_id, weekday);

-- A different day: when a leader has any rows for a date, they replace that weekday's usual hours.
-- A row with no times means "not available that day".
create table public.availability_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  on_date date not null,
  starts_at time,
  ends_at time,
  created_at timestamptz not null default now(),
  check ((starts_at is null) = (ends_at is null)),
  check (ends_at > starts_at)
);

create index availability_changes_date_idx on public.availability_changes (on_date, user_id);
create unique index availability_changes_day_off_idx on public.availability_changes (user_id, on_date) where starts_at is null;

alter table public.availability enable row level security;
alter table public.availability_changes enable row level security;

-- The bishopric reads everyone's hours. Anyone who manages meetings may change them, so a secretary
-- can take a day out when a counselor texts that he can't make it.
create policy "bishopric read availability" on public.availability
  for select to authenticated using (public.can_manage_meetings());

create policy "bishopric manage availability" on public.availability
  for all to authenticated
  using (public.can_manage_meetings()) with check (public.can_manage_meetings());

create policy "bishopric read availability changes" on public.availability_changes
  for select to authenticated using (public.can_manage_meetings());

create policy "bishopric manage availability changes" on public.availability_changes
  for all to authenticated
  using (public.can_manage_meetings()) with check (public.can_manage_meetings());
