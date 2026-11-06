-- Which notifications each person gets, and the new ones about appointments, away dates, requests
-- due and callings.
--
-- notification_mutes holds the kinds a person turned off. Everything is on until they do, so a
-- missing row means "send it". The senders read it as the database owner; each person manages
-- only their own rows.
--
-- notification_outbox records changes that someone should hear about: an appointment added, booked,
-- moved, cancelled, sent back or handed to another leader, and away dates that may cover booked
-- appointments. Triggers write it, then ask the notify Edge Function to run straight away
-- (public.call_notify, which does nothing until an environment is set up). The function decides
-- who to tell, using who books for whom, and claims each row so it's only sent once. Changes the
-- database owner makes (seed, imports, maintenance) aren't recorded, so they notify no one.
--
-- Additive: the live frontend ignores the new tables.

-- ---------------------------------------------------------------------------
-- The kinds
-- ---------------------------------------------------------------------------

-- Logged once per person and day, like the existing scheduled ones.
alter table public.notification_log drop constraint notification_log_kind_check;
alter table public.notification_log
  add constraint notification_log_kind_check check (kind in ('day_summary', 'report_due', 'reminders', 'request_due', 'callings_to_record'));

create table public.notification_mutes (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'request_sent', 'request_answered', 'request_due',
    'calling_request_sent', 'calling_request_received', 'calling_request_progress', 'callings_to_record',
    'day_summary', 'report_due', 'reminders',
    'appointment_to_book', 'appointment_sent_back', 'away_conflict',
    'appointment_booked', 'appointment_changed', 'appointment_handed_over'
  )),
  created_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.notification_mutes enable row level security;

create policy "people read their notification choices" on public.notification_mutes
  for select to authenticated using (user_id = (select auth.uid()));

create policy "people turn off their notifications" on public.notification_mutes
  for insert to authenticated with check (user_id = (select auth.uid()) and public.has_any_role());

create policy "people turn their notifications back on" on public.notification_mutes
  for delete to authenticated using (user_id = (select auth.uid()));

comment on table public.notification_mutes is 'Notifications a person turned off. A kind with no row here is sent.';

-- ---------------------------------------------------------------------------
-- Changes to tell people about
-- ---------------------------------------------------------------------------

create table public.notification_outbox (
  id bigint generated always as identity primary key,
  event text not null check (event in ('added', 'booked', 'moved', 'unbooked', 'cancelled', 'sent_back', 'handed_over', 'away')),
  actor_id uuid references public.profiles (id) on delete set null,
  interview_id uuid references public.interviews (id) on delete cascade,
  absence_id uuid references public.absences (id) on delete cascade,
  -- The leader it's about: the appointment's leader (the new one, when handed over), or who's away.
  leader_id uuid references public.profiles (id) on delete cascade,
  old_leader_id uuid references public.profiles (id) on delete set null,
  scheduled_at timestamptz,
  old_scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create index notification_outbox_waiting_idx on public.notification_outbox (id) where claimed_at is null;

-- Only the notify function reads or writes it, as the database owner.
alter table public.notification_outbox enable row level security;

comment on table public.notification_outbox is 'Changes to appointments and away dates waiting for the notify function to tell whoever they concern.';

create function public.queue_appointment_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  happened text;
begin
  if actor is null then
    return null;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'scheduled' and new.interviewer_id is not null then
      insert into public.notification_outbox (event, actor_id, interview_id, leader_id, scheduled_at)
      values (case when new.scheduled_at is null then 'added' else 'booked' end, actor, new.id, new.interviewer_id, new.scheduled_at);
    end if;
    return null;
  end if;

  if old.status <> 'scheduled' then
    return null;
  end if;

  if new.status = 'cancelled' then
    -- A leader closing a missed appointment themselves (missed_at set) tells no one.
    if old.scheduled_at is not null and new.missed_at is not distinct from old.missed_at then
      insert into public.notification_outbox (event, actor_id, interview_id, leader_id, old_scheduled_at)
      values ('cancelled', actor, new.id, old.interviewer_id, old.scheduled_at);
    end if;
    return null;
  end if;

  if new.status <> 'scheduled' then
    return null;
  end if;

  if new.interviewer_id is distinct from old.interviewer_id then
    if new.interviewer_id is not null then
      insert into public.notification_outbox (event, actor_id, interview_id, leader_id, old_leader_id, scheduled_at, old_scheduled_at)
      values ('handed_over', actor, new.id, new.interviewer_id, old.interviewer_id, new.scheduled_at, old.scheduled_at);
    end if;
    return null;
  end if;

  if new.scheduled_at is not distinct from old.scheduled_at then
    return null;
  end if;

  happened := case
    when new.scheduled_at is null and new.missed_at is distinct from old.missed_at then 'sent_back'
    when new.scheduled_at is null then 'unbooked'
    when old.scheduled_at is null then 'booked'
    else 'moved'
  end;
  insert into public.notification_outbox (event, actor_id, interview_id, leader_id, scheduled_at, old_scheduled_at)
  values (happened, actor, new.id, new.interviewer_id, new.scheduled_at, old.scheduled_at);
  return null;
end;
$$;

create trigger interviews_queue_notice
  after insert or update of status, scheduled_at, interviewer_id on public.interviews
  for each row execute function public.queue_appointment_notice();

-- Whether the dates cover a booked appointment depends on the ward's time zone, so the notify
-- function checks; this only records that the dates changed.
create function public.queue_away_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.starts_on = old.starts_on and new.ends_on = old.ends_on then
    return null;
  end if;
  insert into public.notification_outbox (event, actor_id, absence_id, leader_id)
  values ('away', actor, new.id, new.user_id);
  return null;
end;
$$;

create trigger absences_queue_notice
  after insert or update of starts_on, ends_on on public.absences
  for each row execute function public.queue_away_notice();

-- Once per statement, so a change to many rows asks once.
create function public.send_queued_notices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.call_notify();
  return null;
end;
$$;

create trigger notification_outbox_send
  after insert on public.notification_outbox
  for each statement execute function public.send_queued_notices();

revoke execute on function public.queue_appointment_notice() from public, anon, authenticated;
revoke execute on function public.queue_away_notice() from public, anon, authenticated;
revoke execute on function public.send_queued_notices() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Calling request progress
-- ---------------------------------------------------------------------------

-- The notify function tells a leader when the bishopric starts on their calling request and when
-- it's finished, recording each in push_events. Requests already past those stages are recorded
-- now, so the first run doesn't announce old news.
insert into public.push_events (key)
select format('calling:%s:stage:%s', r.id, stage)
from public.calling_requests r,
  unnest(case public.calling_request_stage(r.id)
    when 'finished' then array['in_progress', 'finished']
    when 'in_progress' then array['in_progress']
    else array[]::text[]
  end) as stage
on conflict (key) do nothing;
