-- What happens to an appointment after the secretary books it.
--
-- Booked: the secretary sends a confirmation (confirmed_at), and the day before, a reminder
-- (reminded_at). Moving the time clears both, so the new time gets confirmed and reminded too.
--
-- Afterwards the leader who held it reports how it went: done (status 'completed'), or the person
-- didn't come (missed_at). For a missed one the leader either sends it back to the secretary to
-- find a new time (scheduled_at goes back to null, so it's waiting again) or says how they'll
-- handle it themselves (status 'cancelled', with report_note).
--
-- Standing meetings can name a secretary who reminds the people who attend (reminder_by) and the
-- agenda they use (agenda_template_id), whose prayers and spiritual thought the reminder can name.
-- meeting_reminders records each reminder sent, so it's only asked for once.
--
-- Additive: the live frontend ignores the new columns and table.

alter table public.interviews
  add column confirmed_at timestamptz,
  add column reminded_at timestamptz,
  add column missed_at timestamptz,
  add column report_note text check (report_note is null or length(report_note) <= 500),
  add column reported_at timestamptz,
  add column reported_by uuid references public.profiles (id) on delete set null;

comment on column public.interviews.confirmed_at is 'When the secretary confirmed the booked time with the person. Cleared when the time changes.';
comment on column public.interviews.reminded_at is 'When the secretary sent the day-before reminder. Cleared when the time changes.';
comment on column public.interviews.missed_at is 'When the person last missed this appointment (the time they were booked for).';
comment on column public.interviews.report_note is 'The leader''s note after a missed appointment: how they''ll handle it, or what to tell the secretary.';

-- Appointments already booked were confirmed the old way, so they don't all land in the new list.
update public.interviews set confirmed_at = now() where status = 'scheduled' and scheduled_at is not null;

create function public.reset_appointment_follow_up()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.scheduled_at is distinct from old.scheduled_at then
    -- Unless the same change sets them (it never needs to today).
    if new.confirmed_at is not distinct from old.confirmed_at then new.confirmed_at := null; end if;
    if new.reminded_at is not distinct from old.reminded_at then new.reminded_at := null; end if;
  end if;
  return new;
end;
$$;

create trigger interviews_reset_follow_up
  before update of scheduled_at on public.interviews
  for each row execute function public.reset_appointment_follow_up();

-- Leaders' unreported appointments and the day-before reminders are found by time.
create index interviews_booked_idx on public.interviews (scheduled_at) where status = 'scheduled' and scheduled_at is not null;

-- ---------------------------------------------------------------------------
-- Meeting reminders
-- ---------------------------------------------------------------------------

alter table public.recurring_events
  add column reminder_by uuid references public.profiles (id) on delete set null;

comment on column public.recurring_events.reminder_by is 'The secretary who reminds the people who attend, the day before.';

-- A standing meeting with an agenda (Ward Council), so its reminder can say who has the prayers
-- and the spiritual thought on that day's agenda. Filled in for meetings named like an agenda.
alter table public.recurring_events
  add column agenda_template_id uuid references public.agenda_templates (id) on delete set null;

comment on column public.recurring_events.agenda_template_id is 'The agenda this meeting uses, for the assignments in its reminder.';

update public.recurring_events e
set agenda_template_id = t.id
from public.agenda_templates t
where lower(trim(t.name)) = lower(trim(e.title));

create table public.meeting_reminders (
  event_id uuid not null references public.recurring_events (id) on delete cascade,
  for_date date not null,
  sent_by uuid default auth.uid() references public.profiles (id) on delete set null,
  sent_at timestamptz not null default now(),
  primary key (event_id, for_date)
);

alter table public.meeting_reminders enable row level security;

create policy "bishopric read meeting reminders" on public.meeting_reminders
  for select to authenticated using (public.has_role('bishopric'));

create policy "bishopric record meeting reminders" on public.meeting_reminders
  for insert to authenticated with check (public.has_role('bishopric'));

create policy "bishopric undo meeting reminders" on public.meeting_reminders
  for delete to authenticated using (public.has_role('bishopric'));

comment on table public.meeting_reminders is 'Reminders sent for a standing meeting on a date, so each is asked for once.';

-- ---------------------------------------------------------------------------
-- Notifications sent by the scheduled job, one per person and day
-- ---------------------------------------------------------------------------

alter table public.notification_log drop constraint notification_log_kind_check;
alter table public.notification_log
  add constraint notification_log_kind_check check (kind in ('day_summary', 'report_due', 'reminders'));

-- ---------------------------------------------------------------------------
-- Starting templates. Text stays general: it never says what the appointment is for.
-- ---------------------------------------------------------------------------

insert into public.message_templates (name, kind, audience, body, created_by) values
  ('Reminder', 'reminder', 'member', E'Hi {first_name}, just a reminder that you''re meeting with {leader} on {time}. Thanks, {my_name}', null),
  ('Reminder to a parent', 'reminder', 'parent', E'Hi {parent_name}, just a reminder that {first_name} is meeting with {leader} on {time}. Thanks, {my_name}', null),
  ('Meeting reminder', 'meeting', 'member', E'Hi all, a reminder that {meeting} is tomorrow, {when}.\n{assignments}\nSee you there. {my_name}', null);
