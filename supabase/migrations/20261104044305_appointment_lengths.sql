-- How long each kind of appointment usually takes, so a new one starts at the right length
-- (extending a calling can be quicker than a temple recommend interview). The secretary can still
-- change any one appointment's length. Shared by the bishopric, like the message templates.

create table public.appointment_lengths (
  purpose public.interview_purpose primary key,
  minutes smallint not null default 10,
  updated_at timestamptz not null default now(),
  check (minutes between 5 and 120 and minutes % 5 = 0),
  check (purpose <> 'temple_recommend' or minutes >= 10)
);

alter table public.appointment_lengths enable row level security;

create policy "bishopric read appointment lengths" on public.appointment_lengths
  for select to authenticated using (public.can_manage_meetings());

create policy "bishopric change appointment lengths" on public.appointment_lengths
  for update to authenticated
  using (public.can_manage_meetings()) with check (public.can_manage_meetings());

-- Every kind starts at 10 minutes; the bishopric shortens or lengthens them as they find fits.
insert into public.appointment_lengths (purpose)
select unnest(enum_range(null::public.interview_purpose));
