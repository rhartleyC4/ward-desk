-- Meeting assignments: the opening prayer, spiritual thought and closing prayer on an agenda go to
-- someone who can sign in, picked from a list instead of typed. They're told, and they accept or
-- decline (say they'll be away). Whoever asked hears the answer.
--
-- Who can read one: the meeting's attendees and the person asked. Attendees choose and change who
-- has it. The person asked answers, or an attendee (usually the executive secretary) records the
-- answer for someone who doesn't use the app, after asking them by text or email.
--
-- Additive: the live frontend still reads and writes agendas.opening_prayer and friends. A trigger
-- copies each assignee's name there, so that frontend and the meeting reminders keep showing who
-- has what.

create type public.meeting_part as enum ('opening_prayer', 'spiritual_thought', 'closing_prayer');
create type public.assignment_answer as enum ('asked', 'accepted', 'declined');

create table public.agenda_assignments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.agenda_templates (id) on delete cascade,
  meeting_date date not null,
  part public.meeting_part not null,
  assignee_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid default auth.uid() references public.profiles (id) on delete set null,
  status public.assignment_answer not null default 'asked',
  reply text, -- what the person said when they answered, e.g. "Out of town that week"
  answered_at timestamptz,
  answered_by uuid references public.profiles (id) on delete set null, -- the person asked, or whoever recorded it for them
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, meeting_date, part)
);

comment on table public.agenda_assignments is 'Who has each prayer and the spiritual thought on a meeting''s agenda, and whether they accepted.';
comment on column public.agenda_assignments.status is 'asked: waiting on the person. accepted, declined: their answer.';

create index agenda_assignments_assignee_idx on public.agenda_assignments (assignee_id, meeting_date);

alter table public.agenda_assignments enable row level security;

create policy "attendees and the person asked read assignments" on public.agenda_assignments
  for select to authenticated
  using (public.attends(template_id) or assignee_id = (select auth.uid()));

create policy "attendees make assignments" on public.agenda_assignments
  for insert to authenticated
  with check (public.attends(template_id) and assigned_by = (select auth.uid()) and public.has_a_role(assignee_id));

create policy "attendees and the person asked update assignments" on public.agenda_assignments
  for update to authenticated
  using (public.attends(template_id) or assignee_id = (select auth.uid()))
  with check (public.attends(template_id) or assignee_id = (select auth.uid()));

create policy "attendees remove assignments" on public.agenda_assignments
  for delete to authenticated
  using (public.attends(template_id));

-- RLS can't say which columns each side may change, so this does. Attendees choose who has it,
-- which starts it over for the new person. The person asked answers, or an attendee records the
-- answer for them; answered_by says which. Taking your own part is accepted from the start.
create function public.guard_agenda_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    new.status := case when new.assignee_id = me then 'accepted' else 'asked' end;
    new.reply := null;
    new.answered_at := case when new.status = 'accepted' then now() end;
    new.answered_by := case when new.status = 'accepted' then me end;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if (new.template_id, new.meeting_date, new.part, new.created_at) is distinct from (old.template_id, old.meeting_date, old.part, old.created_at) then
    raise exception 'Remove the assignment and make a new one instead' using errcode = '42501';
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    if me is not null and not public.attends(old.template_id) then
      raise exception 'Only the meeting''s attendees choose who has it' using errcode = '42501';
    end if;
    if not public.has_a_role(new.assignee_id) then
      raise exception 'That person can''t be given an assignment' using errcode = '42501';
    end if;
    -- Someone new has it, so it starts over for them.
    new.assigned_by := coalesce(me, new.assigned_by);
    new.status := case when new.assignee_id = me then 'accepted' else 'asked' end;
    new.reply := null;
    new.answered_at := case when new.status = 'accepted' then now() end;
    new.answered_by := case when new.status = 'accepted' then me end;
  else
    if me is not null and me <> old.assignee_id and not public.attends(old.template_id) then
      raise exception 'Only the person asked or the meeting''s attendees can answer' using errcode = '42501';
    end if;
    if me is not null and me = old.assignee_id and not public.attends(old.template_id) and new.assigned_by is distinct from old.assigned_by then
      raise exception 'Only the meeting''s attendees choose who has it' using errcode = '42501';
    end if;
    if (new.status, new.reply) is distinct from (old.status, old.reply) then
      new.answered_by := case when new.status = 'asked' then null else coalesce(me, new.answered_by) end;
    else
      new.answered_by := old.answered_by;
    end if;
    if new.status is distinct from old.status then
      new.answered_at := case when new.status = 'asked' then null else now() end;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger agenda_assignments_guard before insert or update on public.agenda_assignments
  for each row execute function public.guard_agenda_assignment();

-- Copies who has each part onto the agenda, where the meeting reminders and the live frontend read
-- it. A declined or removed assignment clears it. Security definer: the person asked may answer
-- without being able to edit the agenda.
create function public.copy_assignment_to_agenda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.agenda_assignments := case when tg_op = 'DELETE' then old else new end;
  who text;
begin
  if tg_op <> 'DELETE' and a.status <> 'declined' then
    select display_name into who from public.profiles where id = a.assignee_id;
  end if;

  insert into public.agendas (template_id, meeting_date) values (a.template_id, a.meeting_date)
  on conflict (template_id, meeting_date) do nothing;

  update public.agendas set
    opening_prayer = case when a.part = 'opening_prayer' then who else opening_prayer end,
    spiritual_thought = case when a.part = 'spiritual_thought' then who else spiritual_thought end,
    closing_prayer = case when a.part = 'closing_prayer' then who else closing_prayer end
  where template_id = a.template_id and meeting_date = a.meeting_date;
  return null;
end;
$$;

revoke execute on function public.copy_assignment_to_agenda() from public, anon, authenticated;

create trigger agenda_assignments_copy after insert or update or delete on public.agenda_assignments
  for each row execute function public.copy_assignment_to_agenda();

-- Who an attendee can give a part to: everyone who can sign in, bishopric first, including
-- themselves. RLS on roles hides who holds which, so the picker asks here. Empty for anyone who
-- attends no meeting.
create function public.meeting_assignees()
returns table (id uuid, display_name text, office public.bishopric_office, in_bishopric boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.office, public.holds_role(p.id, 'bishopric')
  from public.profiles p
  where (public.has_role('bishopric') or exists (select 1 from public.agenda_attendees where user_id = (select auth.uid())))
    and public.has_a_role(p.id)
  order by public.holds_role(p.id, 'bishopric') desc, p.office nulls last, p.display_name;
$$;

revoke execute on function public.meeting_assignees() from public, anon;
grant execute on function public.meeting_assignees() to authenticated;

-- The signed-in person's assignments with the meeting's name and time, which they may not be able
-- to read otherwise (they might not attend that meeting).
create function public.my_meeting_assignments()
returns table (
  id uuid,
  meeting_name text,
  meeting_date date,
  start_time time,
  part public.meeting_part,
  status public.assignment_answer,
  reply text,
  assigned_by uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, t.name, a.meeting_date, t.start_time, a.part, a.status, a.reply, a.assigned_by, a.created_at
  from public.agenda_assignments a
  join public.agenda_templates t on t.id = a.template_id
  where a.assignee_id = (select auth.uid())
  order by a.meeting_date, t.position, a.part;
$$;

revoke execute on function public.my_meeting_assignments() from public, anon;
grant execute on function public.my_meeting_assignments() to authenticated;

-- Each can be turned off, like the other notifications.
alter table public.notification_mutes drop constraint notification_mutes_kind_check;
alter table public.notification_mutes
  add constraint notification_mutes_kind_check check (kind in (
    'request_sent', 'request_answered', 'request_due',
    'calling_request_sent', 'calling_request_received', 'calling_request_progress', 'callings_to_record',
    'day_summary', 'report_due', 'reminders',
    'appointment_to_book', 'appointment_sent_back', 'away_conflict',
    'appointment_booked', 'appointment_changed', 'appointment_handed_over',
    'short_sunday',
    'assignment_sent', 'assignment_answered'
  ));
