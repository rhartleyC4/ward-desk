-- Live updates: when someone changes ward data, everyone else's open page reloads.
--
-- Each change sends a broadcast on the private 'ward' Realtime channel that says only which
-- table changed, never the row. The app then reloads through its normal requests, so the
-- access rules (and acting as someone, which Realtime can't see) work exactly as before.
--
-- Additive: a frontend that doesn't listen ignores the messages, and realtime.send swallows its
-- own errors, so a Realtime outage can never fail a save.

-- Whether the signed-in person may listen: anyone with a role of their own, or a mentor.
create function public.hears_ward_changes()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.roles where user_id = (select auth.uid()))
    or exists (
      select 1 from public.delegations d
      where d.mentor_id = (select auth.uid()) and d.ended_at is null
        and now() >= d.starts_at and now() < d.ends_at
    );
$$;

revoke execute on function public.hears_ward_changes() from public, anon;
grant execute on function public.hears_ward_changes() to authenticated;

create policy "ward members hear ward changes"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() = 'ward'
  and extension = 'broadcast'
  and (select public.hears_ward_changes())
);

-- Tells listeners which table just changed. Once per statement, so a bulk save sends one.
create function public.signal_ward_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'ward', true);
  return null;
end;
$$;

revoke execute on function public.signal_ward_change() from public, anon, authenticated;

-- Every table people see on a page. Logs, queues, health checks and per-device settings
-- are left out: nobody is looking at them, and some change on a schedule.
do $$
declare
  t text;
begin
  foreach t in array array[
    'absences', 'agenda_assignments', 'agenda_attendees', 'agenda_items', 'agenda_sections',
    'agenda_templates', 'agendas', 'allowlist', 'appointment_lengths', 'availability',
    'availability_changes', 'calling_candidates', 'calling_needs', 'calling_requests', 'callings',
    'delegations', 'handover_seats', 'handovers', 'interviews', 'meeting_reminders', 'meetings',
    'message_templates', 'prayer_roll', 'profiles', 'program_items', 'recurring_events',
    'requests', 'roles', 'rotations', 'secretary_assignments', 'stewardships'
  ] loop
    execute format(
      'create trigger signal_ward_change after insert or update or delete on public.%I
         for each statement execute function public.signal_ward_change()', t);
  end loop;
end;
$$;
