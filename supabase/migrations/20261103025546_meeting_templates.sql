-- Agendas for more than one meeting. Each template (bishopric meeting, ward council, ...) is an
-- ordered list of sections, and each section is one of a fixed set of kinds the app knows how to
-- show. List sections hold their own open items; the others are filled from live data.
-- Templates are rows, so another meeting is an insert, not a code change.

create type public.agenda_section_kind as enum (
  'items',          -- open items carried forward until resolved
  'calendar',       -- dated items, dropped once the date passes
  'interviews',     -- interviews that day and rotations due this month
  'assignments',    -- rotations due this month (building, PPIs)
  'sacrament',      -- upcoming sacrament meetings
  'callings',       -- callings needed and new suggestions
  'releases',       -- releases that day
  'sustainings',    -- sustainings that day
  'prayer_roll',
  'closing_prayer'
);

create table public.agenda_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'), -- used in the URL
  name text not null,
  position smallint not null default 0,
  weekday smallint not null default 0 check (weekday between 0 and 6), -- 0 = Sunday
  weeks_of_month smallint[] check (weeks_of_month <@ array[1,2,3,4,5]::smallint[]), -- null = every week
  start_time time,
  created_at timestamptz not null default now()
);

create table public.agenda_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.agenda_templates (id) on delete cascade,
  position smallint not null,
  kind public.agenda_section_kind not null,
  title text not null,
  unique (template_id, position)
);

-- Who besides the bishopric attends a meeting and may see and edit its agenda.
create table public.agenda_attendees (
  template_id uuid not null references public.agenda_templates (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (template_id, user_id)
);

-- ---------------------------------------------------------------------------
-- The two templates in use
-- ---------------------------------------------------------------------------

insert into public.agenda_templates (slug, name, position, weekday, weeks_of_month, start_time) values
  ('bishopric', 'Bishopric Meeting', 1, 0, null, '08:30'),
  ('ward-council', 'Ward Council', 2, 0, '{2,4}', '09:15');

insert into public.agenda_sections (template_id, position, kind, title)
select t.id, s.position, s.kind::public.agenda_section_kind, s.title
from public.agenda_templates t
join (values
  ('bishopric', 1, 'interviews', 'Interviews & appointments'),
  ('bishopric', 2, 'items', 'Action / discussion items'),
  ('bishopric', 3, 'sacrament', 'Upcoming sacrament meetings'),
  ('bishopric', 4, 'calendar', 'Calendar'),
  ('bishopric', 5, 'items', 'Ward ordinations & advancements'),
  ('bishopric', 6, 'items', 'Ward missionary opportunities'),
  ('bishopric', 7, 'callings', 'Callings needed (to discuss)'),
  ('bishopric', 8, 'releases', 'Releases today'),
  ('bishopric', 9, 'sustainings', 'Sustainings today'),
  ('bishopric', 10, 'closing_prayer', 'Closing prayer'),
  ('bishopric', 11, 'prayer_roll', 'Prayer roll'),
  ('ward-council', 1, 'prayer_roll', 'Prayer roll'),
  ('ward-council', 2, 'items', 'General business'),
  ('ward-council', 3, 'assignments', 'Upcoming assignments'),
  ('ward-council', 4, 'items', 'Elders Quorum'),
  ('ward-council', 5, 'items', 'Relief Society'),
  ('ward-council', 6, 'items', 'Young Men'),
  ('ward-council', 7, 'items', 'Young Women'),
  ('ward-council', 8, 'items', 'Sunday School'),
  ('ward-council', 9, 'items', 'Primary'),
  ('ward-council', 10, 'items', 'Ward Mission'),
  ('ward-council', 11, 'items', 'Temple & Family History'),
  ('ward-council', 12, 'items', 'Activities Committee'),
  ('ward-council', 13, 'items', 'Reminders and announcements'),
  ('ward-council', 14, 'closing_prayer', 'Closing prayer')
) as s (slug, position, kind, title) on s.slug = t.slug;

-- ---------------------------------------------------------------------------
-- Agendas and items belong to a template
-- ---------------------------------------------------------------------------

create function public.bishopric_template()
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from public.agenda_templates where slug = 'bishopric';
$$;

-- Existing agendas are all bishopric meetings, and the frontend live before this change doesn't
-- send a template, so it defaults to bishopric.
alter table public.agendas add column template_id uuid references public.agenda_templates (id) on delete restrict;
update public.agendas set template_id = public.bishopric_template();
alter table public.agendas
  alter column template_id set default public.bishopric_template(),
  alter column template_id set not null,
  drop constraint agendas_meeting_date_key,
  add constraint agendas_template_date_key unique (template_id, meeting_date);

alter table public.agenda_items add column section_id uuid references public.agenda_sections (id) on delete restrict;

-- Which bishopric section an item lands in when it only says its kind.
create function public.legacy_agenda_section(item_kind public.agenda_item_kind)
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from public.agenda_sections
  where template_id = public.bishopric_template()
    and position = case item_kind when 'discussion' then 2 when 'calendar' then 4 when 'ordination' then 5 when 'missionary' then 6 end;
$$;

update public.agenda_items set section_id = public.legacy_agenda_section(kind);
alter table public.agenda_items alter column section_id set not null;

-- The frontend live before this change inserts items with a kind and no section.
-- Safe to drop once every deployed frontend sends section_id.
create function public.fill_agenda_item_section()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.section_id is null then
    new.section_id = public.legacy_agenda_section(new.kind);
  end if;
  return new;
end;
$$;

create trigger fill_agenda_item_section
  before insert on public.agenda_items
  for each row execute function public.fill_agenda_item_section();

-- ---------------------------------------------------------------------------
-- Access: the bishopric sees every agenda; others only the meetings they attend
-- ---------------------------------------------------------------------------

create function public.attends(template uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('bishopric') or exists (
    select 1 from public.agenda_attendees
    where template_id = template and user_id = (select auth.uid())
  );
$$;

create function public.attends_section(section uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.attends(template_id) from public.agenda_sections where id = section), false);
$$;

-- The prayer roll is shared by every meeting whose agenda shows it.
create function public.can_use_prayer_roll()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('bishopric') or exists (
    select 1 from public.agenda_attendees a
    join public.agenda_sections s on s.template_id = a.template_id
    where a.user_id = (select auth.uid()) and s.kind = 'prayer_roll'
  );
$$;

alter table public.agenda_templates enable row level security;
alter table public.agenda_sections enable row level security;
alter table public.agenda_attendees enable row level security;

create policy "attendees read templates" on public.agenda_templates
  for select to authenticated
  using (public.attends(id));

create policy "admins manage templates" on public.agenda_templates
  for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "attendees read sections" on public.agenda_sections
  for select to authenticated
  using (public.attends(template_id));

create policy "admins manage sections" on public.agenda_sections
  for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "bishopric and attendees read attendance" on public.agenda_attendees
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role('bishopric') or public.has_role('admin'));

create policy "admins manage attendance" on public.agenda_attendees
  for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

drop policy "bishopric manage agendas" on public.agendas;
create policy "attendees manage agendas" on public.agendas
  for all to authenticated
  using (public.attends(template_id)) with check (public.attends(template_id));

drop policy "bishopric manage agenda items" on public.agenda_items;
create policy "attendees manage agenda items" on public.agenda_items
  for all to authenticated
  using (public.attends_section(section_id)) with check (public.attends_section(section_id));

drop policy "bishopric manage prayer roll" on public.prayer_roll;
create policy "attendees manage prayer roll" on public.prayer_roll
  for all to authenticated
  using (public.can_use_prayer_roll()) with check (public.can_use_prayer_roll());
