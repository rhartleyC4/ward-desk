-- Messages the executive secretaries copy into their phone's messaging app: one offering a few
-- times to choose from, and one confirming the time booked. The bishopric shares one set and can
-- change it. Text stays generic: it never says what the appointment is for.

create type public.message_kind as enum ('offer', 'confirm');

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  kind public.message_kind not null,
  body text not null check (length(trim(body)) > 0),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.message_templates enable row level security;

create policy "bishopric read message templates" on public.message_templates
  for select to authenticated using (public.can_manage_meetings());

create policy "bishopric manage message templates" on public.message_templates
  for all to authenticated
  using (public.can_manage_meetings()) with check (public.can_manage_meetings());

insert into public.message_templates (name, kind, body, created_by) values
  ('Offer times', 'offer', E'Hi {first_name}, {leader} would like to meet with you for about {length}. Would one of these times work?\n{times}\nThanks, {my_name}', null),
  ('Confirm time', 'confirm', E'Hi {first_name}, you''re set to meet with {leader} on {time}. Thanks, {my_name}', null);

-- When the secretary last sent times to choose from, and which, so the list can say "offered" and
-- the picker can show those times when the person replies.
alter table public.interviews
  add column offered_at timestamptz,
  add column offered_times timestamptz[] not null default '{}';
