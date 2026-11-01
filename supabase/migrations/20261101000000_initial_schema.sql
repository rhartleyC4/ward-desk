-- Ward Planner initial schema.
-- Modeled on the bishopric's current Google Sheet: Sacrament tab, Bishopric Schedule tab,
-- Travel tab, and the weekly agenda tabs.
-- Access is enforced here with RLS; the UI only mirrors these rules.

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Users, roles, allowlist
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('admin', 'bishopric', 'scheduler', 'suggester');

-- Invite-only: an email must be listed here before it can sign in.
-- initial_roles are granted automatically on first sign-in.
create table public.allowlist (
  email citext primary key,
  initial_roles public.app_role[] not null default '{}',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null unique,
  display_name text,
  short_name text, -- how the sheet refers to them, e.g. "Ortiz" in the Conducting column
  created_at timestamptz not null default now()
);

create table public.roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- security definer so policies can call these without recursing through RLS on roles.
create function public.has_role(check_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.roles
    where user_id = (select auth.uid()) and role = check_role
  );
$$;

create function public.has_any_role()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.roles where user_id = (select auth.uid()));
$$;

create function public.is_planner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.roles
    where user_id = (select auth.uid()) and role in ('bishopric', 'scheduler')
  );
$$;

-- Rejects sign-ups for emails not on the allowlist, then creates the profile and roles.
create function public.handle_new_user()
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

  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));

  insert into public.roles (user_id, role)
  select new.id, unnest(invite.initial_roles)
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.allowlist enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;

create policy "admins manage allowlist" on public.allowlist
  for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "members read profiles" on public.profiles
  for select to authenticated
  using (public.has_any_role() or id = (select auth.uid()));

create policy "users update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "admins update profiles" on public.profiles
  for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "users read own roles" on public.roles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role('admin'));

-- Needed for the Conducting picker; other people's other roles stay private.
create policy "members see who is in the bishopric" on public.roles
  for select to authenticated
  using (role = 'bishopric' and public.has_any_role());

create policy "admins manage roles" on public.roles
  for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- Sacrament meetings (the "Sacrament" tab)
-- ---------------------------------------------------------------------------

create type public.meeting_type as enum (
  'regular', 'fast_sunday', 'stake_conference', 'general_conference', 'ward_conference', 'special_program'
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_date date not null unique,
  meeting_type public.meeting_type not null default 'regular',
  title text, -- e.g. "Christmas Program"
  presiding text,
  conducting_id uuid references public.profiles (id) on delete set null,
  opening_hymn smallint,
  sacrament_hymn smallint,
  closing_hymn smallint,
  invocation text,
  benediction text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.program_item_kind as enum (
  'talk', 'musical_number', 'intermediate_hymn', 'testimonies', 'other'
);

create type public.assignment_status as enum ('planned', 'invited', 'confirmed', 'declined');

-- Speakers 1-6 plus anything the sheet squeezed into a speaker column.
create table public.program_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  position smallint not null,
  kind public.program_item_kind not null default 'talk',
  person_name text, -- speakers are often not app users
  topic text,
  hymn_number smallint,
  note text, -- e.g. "Stake", "Youth speaker"
  status public.assignment_status not null default 'planned',
  created_at timestamptz not null default now()
);

create index program_items_meeting_idx on public.program_items (meeting_id, position);

alter table public.meetings enable row level security;
alter table public.program_items enable row level security;

create policy "members read meetings" on public.meetings
  for select to authenticated using (public.has_any_role());

create policy "planners manage meetings" on public.meetings
  for all to authenticated using (public.is_planner()) with check (public.is_planner());

create policy "members read program" on public.program_items
  for select to authenticated using (public.has_any_role());

create policy "planners manage program" on public.program_items
  for all to authenticated using (public.is_planner()) with check (public.is_planner());

-- ---------------------------------------------------------------------------
-- Standing schedule (the "Bishopric Schedule" tab)
-- ---------------------------------------------------------------------------

-- "First Sunday - 8:30 Bishopric, 9:15 Welfare"; "Thursdays - Interviews".
-- week_of_month null means every week.
create table public.recurring_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  week_of_month smallint check (week_of_month between 1 and 5),
  start_time time,
  notes text,
  created_at timestamptz not null default now()
);

-- "Elders Quorum President - Feb, Jun, Oct"; "Primary Message (3rd Sunday) - Lane - Mar, Jun, Sep, Dec".
create table public.rotations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  assignee_id uuid references public.profiles (id) on delete set null,
  assignee_label text, -- when the assignee isn't an app user
  months smallint[] not null check (months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  notes text,
  created_at timestamptz not null default now()
);

-- "Brother Lane: Young Men, Sunday School, Activities..."
create table public.stewardships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  area text not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.recurring_events enable row level security;
alter table public.rotations enable row level security;
alter table public.stewardships enable row level security;

create policy "members read recurring events" on public.recurring_events
  for select to authenticated using (public.has_any_role());
create policy "bishopric manage recurring events" on public.recurring_events
  for all to authenticated
  using (public.has_role('bishopric') or public.has_role('admin'))
  with check (public.has_role('bishopric') or public.has_role('admin'));

create policy "members read rotations" on public.rotations
  for select to authenticated using (public.has_any_role());
create policy "bishopric manage rotations" on public.rotations
  for all to authenticated
  using (public.has_role('bishopric') or public.has_role('admin'))
  with check (public.has_role('bishopric') or public.has_role('admin'));

create policy "members read stewardships" on public.stewardships
  for select to authenticated using (public.has_any_role());
create policy "bishopric manage stewardships" on public.stewardships
  for all to authenticated
  using (public.has_role('bishopric') or public.has_role('admin'))
  with check (public.has_role('bishopric') or public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- Away dates (the "Travel" tab)
-- ---------------------------------------------------------------------------

create table public.absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  location text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index absences_dates_idx on public.absences (starts_on, ends_on);

alter table public.absences enable row level security;

create policy "members read absences" on public.absences
  for select to authenticated using (public.has_any_role());

create policy "users manage own absences" on public.absences
  for all to authenticated
  using (user_id = (select auth.uid()) and public.has_any_role())
  with check (user_id = (select auth.uid()) and public.has_any_role());

create policy "admins manage absences" on public.absences
  for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- Callings (the "Callings Needed" table, Releases Today, Sustainings Today)
-- Confidential: bishopric only. Suggesters may only insert candidates.
-- ---------------------------------------------------------------------------

create table public.callings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  organization text,
  created_at timestamptz not null default now()
);

create type public.need_status as enum ('open', 'filled', 'cancelled');

-- One row of the Callings Needed table: a calling to fill and, optionally, who is being released.
create table public.calling_needs (
  id uuid primary key default gen_random_uuid(),
  calling_id uuid references public.callings (id) on delete set null,
  calling_title text not null,
  release_name text,
  release_on date, -- the Sunday the release is announced ("Releases Today")
  status public.need_status not null default 'open',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.candidate_status as enum (
  'suggested', 'discussing', 'approved', 'extended', 'accepted', 'declined', 'sustained', 'set_apart'
);

-- "Names to Consider" and the "Appr?" column, carried through to sustaining and setting apart.
create table public.calling_candidates (
  id uuid primary key default gen_random_uuid(),
  need_id uuid references public.calling_needs (id) on delete cascade,
  calling_title text, -- free text from suggesters who don't see the needs list
  person_name text not null,
  status public.candidate_status not null default 'suggested',
  sustain_on date, -- the Sunday they are sustained ("Sustainings Today")
  notes text,
  suggested_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (need_id is not null or calling_title is not null)
);

alter table public.callings enable row level security;
alter table public.calling_needs enable row level security;
alter table public.calling_candidates enable row level security;

create policy "bishopric manage callings" on public.callings
  for all to authenticated
  using (public.has_role('bishopric')) with check (public.has_role('bishopric'));

create policy "suggesters read calling list" on public.callings
  for select to authenticated using (public.has_role('suggester'));

create policy "bishopric manage needs" on public.calling_needs
  for all to authenticated
  using (public.has_role('bishopric')) with check (public.has_role('bishopric'));

create policy "bishopric manage candidates" on public.calling_candidates
  for all to authenticated
  using (public.has_role('bishopric')) with check (public.has_role('bishopric'));

create policy "suggesters submit candidates" on public.calling_candidates
  for insert to authenticated
  with check (
    public.has_role('suggester')
    and suggested_by = (select auth.uid())
    and status = 'suggested'
    and need_id is null
  );

-- ---------------------------------------------------------------------------
-- Interviews and appointments (bishopric only; temple recommends are sensitive)
-- ---------------------------------------------------------------------------

create type public.interview_purpose as enum (
  'calling', 'temple_recommend', 'ppi', 'youth', 'tithing_declaration', 'advancement', 'other'
);

create type public.interview_status as enum ('scheduled', 'completed', 'cancelled');

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  interviewer_id uuid references public.profiles (id) on delete set null,
  scheduled_at timestamptz not null,
  person_name text,
  purpose public.interview_purpose not null default 'other',
  candidate_id uuid references public.calling_candidates (id) on delete set null,
  location text,
  status public.interview_status not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now()
);

create index interviews_scheduled_idx on public.interviews (scheduled_at);

alter table public.interviews enable row level security;

create policy "bishopric manage interviews" on public.interviews
  for all to authenticated
  using (public.has_role('bishopric')) with check (public.has_role('bishopric'));

-- ---------------------------------------------------------------------------
-- Weekly bishopric agenda (replaces copying a new tab each Sunday)
-- Most sections are computed from the tables above; these hold the rest.
-- ---------------------------------------------------------------------------

create table public.agendas (
  id uuid primary key default gen_random_uuid(),
  meeting_date date not null unique,
  start_time time default '08:30',
  opening_prayer text,
  spiritual_thought text,
  closing_prayer text,
  notes text,
  created_at timestamptz not null default now()
);

create type public.agenda_item_kind as enum ('discussion', 'calendar', 'ordination', 'missionary');

-- Items stay on every agenda until resolved, instead of being copied forward by hand.
create table public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  kind public.agenda_item_kind not null default 'discussion',
  body text not null,
  event_date date, -- for calendar items
  resolved_on date,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.prayer_roll (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  added_on date not null default current_date,
  removed_on date
);

alter table public.agendas enable row level security;
alter table public.agenda_items enable row level security;
alter table public.prayer_roll enable row level security;

create policy "bishopric manage agendas" on public.agendas
  for all to authenticated
  using (public.has_role('bishopric')) with check (public.has_role('bishopric'));

create policy "bishopric manage agenda items" on public.agenda_items
  for all to authenticated
  using (public.has_role('bishopric')) with check (public.has_role('bishopric'));

create policy "bishopric manage prayer roll" on public.prayer_roll
  for all to authenticated
  using (public.has_role('bishopric')) with check (public.has_role('bishopric'));

-- ---------------------------------------------------------------------------
-- Web Push subscriptions
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "users manage own subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger meetings_touch before update on public.meetings
  for each row execute function public.touch_updated_at();
create trigger calling_needs_touch before update on public.calling_needs
  for each row execute function public.touch_updated_at();
create trigger calling_candidates_touch before update on public.calling_candidates
  for each row execute function public.touch_updated_at();
