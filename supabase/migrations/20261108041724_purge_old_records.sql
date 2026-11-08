-- Old records are deleted on a schedule instead of kept forever. Every day at 09:23 UTC (early
-- morning in the Americas), pg_cron runs purge_old_records(), which applies these periods. They
-- live here and in README.md ("Data retention"); change both together, in a new migration.
--
--   Records                                          Rule
--   -----------------------------------------------  ------------------------------------------------
--   Declined names on a calling                      deleted 90 days after the decision (updated_at)
--   Cancelled callings ("no longer needed")          deleted 90 days after the decision (updated_at),
--                                                    with their names and calling requests
--   Finished callings (name set apart, or a          notes on the calling, its names and its calling
--   release-only calling whose release was           requests cleared 90 days after done; all of
--   announced)                                       them deleted 1 year after done
--   Calling requests left without a calling          notes cleared 90 days after they were made,
--   (suggested names, or the calling was deleted)    deleted after 1 year, once finished
--   Appointments (interviews)                        notes and report_note cleared 90 days after the
--                                                    appointment, the row deleted 1 year after
--   Requests, done or declined                       deleted 1 year after closed_at
--   Prayer roll names                                deleted 90 days after removed_on
--   Agenda items, resolved                           deleted 2 years after resolved_on
--   Sacrament meetings and their programs            deleted 3 years after the meeting
--   Away dates                                       deleted 1 year after ends_on
--   Meeting reminders sent                           deleted 90 days after the meeting
--   Meeting assignments (prayers, spiritual          deleted 90 days after the meeting; the name
--   thought) and the answers to them                 stays on that day's agenda
--   Accounts removed from every role                 deleted 180 days after profiles.removed_at,
--                                                    the way delete_account() does
--
-- "After N days" means the record goes on the first run once more than N days have passed, so a
-- record exactly N days old is still there. Dates count in UTC.
--
-- Nothing here deletes open work: a calling still being filled, an appointment not yet scheduled,
-- an open request, someone still on the prayer roll or an unresolved agenda item all stay.
--
-- The first run deletes everything already past its date, so the ward is told before this
-- reaches production. To see what a run would delete without deleting it:
--   begin; select public.purge_old_records(); rollback;
--
-- Additive for the live frontend: it only deletes rows the app already copes with losing (an
-- admin can delete each of them by hand today).

-- ---------------------------------------------------------------------------
-- Meeting assignments: deleting an old one keeps the agenda's name
-- ---------------------------------------------------------------------------

-- copy_assignment_to_agenda() blanks the agenda's prayer when an assignment is removed, which is
-- right when someone takes it away, but the purge only forgets who was asked and what they said.
drop trigger agenda_assignments_copy on public.agenda_assignments;
create trigger agenda_assignments_copy after insert or update or delete on public.agenda_assignments
  for each row
  when (current_setting('ward.purging', true) is distinct from 'on')
  execute function public.copy_assignment_to_agenda();

-- ---------------------------------------------------------------------------
-- The purge
-- ---------------------------------------------------------------------------

create function public.purge_old_records()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := current_date;
  counts jsonb := '{}';
  n int;
  cleared int;
  person uuid;
begin
  perform set_config('ward.purging', 'on', true);

  -- Callings ------------------------------------------------------------------

  delete from public.calling_candidates
  where status = 'declined' and updated_at < now() - interval '90 days';
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('declined_names', n);

  -- When each open calling was done: the day its release was announced for a release with no one
  -- new, else the day its name was set apart (or, for a name set apart before that was tracked,
  -- the day the name was added). Callings not done yet aren't listed.
  create temporary table finished on commit drop as
  select n.id, d.done_on
  from public.calling_needs n
  cross join lateral (
    select case
      when n.release_only then n.release_on
      else (
        select max(coalesce(c.set_apart_on, c.created_at::date))
        from public.calling_candidates c
        where c.need_id = n.id and c.status = 'set_apart'
      )
    end as done_on
  ) d
  where n.status = 'open' and d.done_on <= today;

  create temporary table gone on commit drop as
  select id, 'cancelled' as why from public.calling_needs
  where status = 'cancelled' and updated_at < now() - interval '90 days'
  union all
  select id, 'finished' from pg_temp.finished where done_on < today - 365;

  -- A calling's requests point at it with on delete set null, so they go first. Its names go with
  -- it (on delete cascade).
  delete from public.calling_requests where need_id in (select id from pg_temp.gone);
  delete from public.calling_needs where id in (select id from pg_temp.gone where why = 'cancelled');
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('cancelled_callings', n);
  delete from public.calling_needs where id in (select id from pg_temp.gone where why = 'finished');
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('finished_callings', n);

  update public.calling_needs set notes = null
  where notes is not null and id in (select id from pg_temp.finished where done_on < today - 90);
  get diagnostics n = row_count;
  cleared := n;
  -- Declined names have their own, shorter rule; leaving them alone keeps their decision date.
  update public.calling_candidates set notes = null
  where notes is not null and status <> 'declined'
    and need_id in (select id from pg_temp.finished where done_on < today - 90);
  get diagnostics n = row_count;
  cleared := cleared + n;
  update public.calling_requests set notes = null
  where notes is not null and need_id in (select id from pg_temp.finished where done_on < today - 90);
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('finished_calling_notes_cleared', cleared + n);

  drop table pg_temp.finished, pg_temp.gone;

  -- Requests for names, or whose calling was deleted by hand: nothing to date them by but when
  -- they were made, so they go a year after that once the bishopric is done with them.
  delete from public.calling_requests r
  where r.need_id is null and r.created_at < now() - interval '365 days'
    and public.calling_request_stage(r.id) = 'finished';
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('calling_requests', n);
  update public.calling_requests r set notes = null
  where r.need_id is null and r.notes is not null and r.created_at < now() - interval '90 days'
    and public.calling_request_stage(r.id) = 'finished';

  -- Appointments --------------------------------------------------------------

  -- Dated by when it was (or was to be). A cancelled one never given a time is dated by when it
  -- was made; one still waiting for a time stays.
  delete from public.interviews
  where coalesce(scheduled_at, case when status = 'cancelled' then created_at end) < now() - interval '365 days';
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('appointments', n);

  update public.interviews set notes = null, report_note = null
  where (notes is not null or report_note is not null)
    and coalesce(scheduled_at, case when status = 'cancelled' then created_at end) < now() - interval '90 days';
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('appointment_notes_cleared', n);

  -- Everything else, by its own date -----------------------------------------

  delete from public.requests
  where status in ('done', 'declined') and closed_at < now() - interval '365 days';
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('requests', n);

  delete from public.prayer_roll where removed_on < today - 90;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('prayer_roll', n);

  delete from public.agenda_items where resolved_on < today - 730;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('agenda_items', n);

  delete from public.meetings where meeting_date < today - 1095;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('sacrament_meetings', n);

  delete from public.absences where ends_on < today - 365;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('away_dates', n);

  delete from public.meeting_reminders where for_date < today - 90;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('meeting_reminders', n);

  delete from public.agenda_assignments where meeting_date < today - 90;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('meeting_assignments', n);

  -- Accounts ------------------------------------------------------------------

  n := 0;
  for person in
    select p.id from public.profiles p
    where p.removed_at < now() - interval '180 days'
      and not exists (select 1 from public.roles r where r.user_id = p.id)
  loop
    perform public.delete_person(person);
    n := n + 1;
  end loop;
  counts := counts || jsonb_build_object('accounts', n);

  perform set_config('ward.purging', 'off', true);
  return counts;
end;
$$;

revoke execute on function public.purge_old_records() from public, anon, authenticated;

comment on function public.purge_old_records() is
  'Run by pg_cron every day: deletes records past their retention period (see the migration that made it, or "Data retention" in README.md). Returns how many of each kind it deleted or cleared.';

select cron.schedule('purge', '23 9 * * *', 'select public.purge_old_records()');
