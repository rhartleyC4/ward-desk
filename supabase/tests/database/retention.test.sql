-- Retention: purge_old_records() deletes each kind of record once it is past its period, and
-- nothing a day younger. Each rule gets a row just inside (kept) and one just outside (gone).
-- Run with `npm run test:db`. Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(62);

-- A stable id for each test row, from a label.
create function pg_temp.k(label text) returns uuid language sql immutable as $$
  select md5('retention:' || label)::uuid;
$$;

create function pg_temp.uid(user_email text) returns uuid language sql as $$
  select id from auth.users where email = user_email;
$$;

create function pg_temp.has(tbl text, label text) returns boolean language plpgsql as $$
declare
  found boolean;
begin
  execute format('select exists (select 1 from public.%I where id = %L)', tbl, pg_temp.k(label)) into found;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rows on both sides of each line
-- ---------------------------------------------------------------------------

-- Declined names: 90 days after the decision.
insert into public.calling_candidates (id, calling_title, person_name, status, updated_at) values
  (pg_temp.k('declined in'), 'Ward Organist', 'Brother Ashby', 'declined', now() - interval '90 days' + interval '1 hour'),
  (pg_temp.k('declined out'), 'Ward Organist', 'Sister Bram', 'declined', now() - interval '90 days' - interval '1 hour'),
  (pg_temp.k('suggested old'), 'Ward Organist', 'Sister Cole', 'suggested', now() - interval '3 years');

-- Cancelled callings: 90 days after the decision, with their names and calling requests.
insert into public.calling_needs (id, calling_title, status, notes, updated_at) values
  (pg_temp.k('cancelled in'), 'Activities Committee', 'cancelled', 'Maybe later', now() - interval '90 days' + interval '1 hour'),
  (pg_temp.k('cancelled out'), 'Choir Director', 'cancelled', 'Choir paused', now() - interval '90 days' - interval '1 hour');
insert into public.calling_candidates (id, need_id, person_name, status) values
  (pg_temp.k('cancelled out name'), pg_temp.k('cancelled out'), 'Sister Dane', 'discussing');
insert into public.calling_requests (id, requested_by, kind, calling_title, need_id) values
  (pg_temp.k('cancelled out request'), pg_temp.uid('rspres@ward.test'), 'fill', 'Choir Director', pg_temp.k('cancelled out'));

-- Finished release-only callings: done on release_on. Notes cleared after 90 days, rows after a year.
insert into public.calling_needs (id, calling_title, release_name, release_on, release_only, notes) values
  (pg_temp.k('release year in'), 'Sunday School Teacher', 'Brother Eads', current_date - 365, true, 'Moving'),
  (pg_temp.k('release year out'), 'Sunday School Teacher', 'Brother Fenn', current_date - 366, true, 'Moving'),
  (pg_temp.k('release notes in'), 'Nursery Leader', 'Sister Gale', current_date - 90, true, 'Asked to be released'),
  (pg_temp.k('release notes out'), 'Nursery Leader', 'Sister Hale', current_date - 91, true, 'Asked to be released'),
  (pg_temp.k('release coming'), 'Nursery Leader', 'Sister Imes', current_date + 7, true, 'Next month');
insert into public.calling_requests (id, requested_by, kind, calling_title, release_name, need_id, notes) values
  (pg_temp.k('release year out request'), pg_temp.uid('eqpres@ward.test'), 'release', 'Sunday School Teacher', 'Brother Fenn', pg_temp.k('release year out'), 'Moving'),
  (pg_temp.k('release notes out request'), pg_temp.uid('eqpres@ward.test'), 'release', 'Nursery Leader', 'Sister Hale', pg_temp.k('release notes out'), 'Asked to be released');

-- Finished callings with someone set apart: done on set_apart_on, or when the name was added if
-- that day isn't known.
insert into public.calling_needs (id, calling_title, notes) values
  (pg_temp.k('set apart in'), 'Ward Clerk Assistant', 'Needs records training'),
  (pg_temp.k('set apart out'), 'Ward Mission Leader', 'Needs a companion'),
  (pg_temp.k('set apart undated'), 'Librarian', null),
  (pg_temp.k('open'), 'Primary Pianist', 'Still looking');
insert into public.calling_candidates (id, need_id, person_name, status, set_apart_on, notes, created_at) values
  (pg_temp.k('set apart in name'), pg_temp.k('set apart in'), 'Brother Jett', 'set_apart', current_date - 365, 'Works nights', now()),
  (pg_temp.k('set apart out name'), pg_temp.k('set apart out'), 'Brother Kerr', 'set_apart', current_date - 366, 'Works nights', now()),
  (pg_temp.k('set apart undated name'), pg_temp.k('set apart undated'), 'Sister Lowe', 'set_apart', null, null, now() - interval '400 days'),
  (pg_temp.k('open name'), pg_temp.k('open'), 'Sister Mott', 'approved', null, 'Ask after Christmas', now() - interval '3 years');
insert into public.calling_requests (id, requested_by, kind, calling_title, need_id, notes) values
  (pg_temp.k('set apart out request'), pg_temp.uid('mission@ward.test'), 'fill', 'Ward Mission Leader', pg_temp.k('set apart out'), 'Soon please');

-- Calling requests with no calling: a year after they were made, once finished.
insert into public.calling_requests (id, requested_by, kind, calling_title, created_at) values
  (pg_temp.k('suggest in'), pg_temp.uid('ywpres@ward.test'), 'suggest', 'Class Adviser', now() - interval '365 days' + interval '1 hour'),
  (pg_temp.k('suggest out'), pg_temp.uid('ywpres@ward.test'), 'suggest', 'Class Adviser', now() - interval '365 days' - interval '1 hour'),
  (pg_temp.k('suggest waiting'), pg_temp.uid('ywpres@ward.test'), 'suggest', 'Class Adviser', now() - interval '2 years');
insert into public.calling_candidates (id, calling_title, person_name, status, request_id) values
  (pg_temp.k('suggest waiting name'), 'Class Adviser', 'Sister Nye', 'suggested', pg_temp.k('suggest waiting'));

-- Appointments: notes cleared 90 days after, the row deleted a year after.
insert into public.interviews (id, interviewer_id, scheduled_at, person_name, status, notes, report_note, created_at) values
  (pg_temp.k('appt notes in'), pg_temp.uid('bishop@ward.test'), now() - interval '90 days' + interval '1 hour', 'Brother Oakes', 'completed', 'Talked about work', 'Follow up', now() - interval '100 days'),
  (pg_temp.k('appt notes out'), pg_temp.uid('bishop@ward.test'), now() - interval '90 days' - interval '1 hour', 'Brother Penn', 'completed', 'Talked about work', 'Follow up', now() - interval '100 days'),
  (pg_temp.k('appt year in'), pg_temp.uid('bishop@ward.test'), now() - interval '365 days' + interval '1 hour', 'Sister Quill', 'completed', null, null, now() - interval '400 days'),
  (pg_temp.k('appt year out'), pg_temp.uid('bishop@ward.test'), now() - interval '365 days' - interval '1 hour', 'Sister Rook', 'completed', null, null, now() - interval '400 days'),
  (pg_temp.k('appt unscheduled'), pg_temp.uid('bishop@ward.test'), null, 'Brother Sloan', 'scheduled', 'Call him', null, now() - interval '2 years'),
  (pg_temp.k('appt cancelled untimed'), pg_temp.uid('bishop@ward.test'), null, 'Brother Tull', 'cancelled', null, null, now() - interval '366 days');

-- Requests: a year after closed_at, if done or declined.
insert into public.requests (id, from_id, to_id, title, status, closed_at, created_at) values
  (pg_temp.k('request in'), pg_temp.uid('bishop@ward.test'), pg_temp.uid('leader@ward.test'), 'Visit the Ueda family', 'done', now() - interval '365 days' + interval '1 hour', now() - interval '400 days'),
  (pg_temp.k('request out'), pg_temp.uid('bishop@ward.test'), pg_temp.uid('leader@ward.test'), 'Visit the Vale family', 'declined', now() - interval '365 days' - interval '1 hour', now() - interval '400 days'),
  (pg_temp.k('request open'), pg_temp.uid('bishop@ward.test'), pg_temp.uid('leader@ward.test'), 'Visit the Wynn family', 'sent', null, now() - interval '3 years');

-- Prayer roll: 90 days after removed_on.
insert into public.prayer_roll (id, name, added_on, removed_on) values
  (pg_temp.k('prayer in'), 'Sister Xu', current_date - 200, current_date - 90),
  (pg_temp.k('prayer out'), 'Brother Yale', current_date - 200, current_date - 91),
  (pg_temp.k('prayer on'), 'Brother Zorn', current_date - 2000, null);

-- Resolved agenda items: 2 years after resolved_on.
insert into public.agenda_items (id, body, section_id, resolved_on) values
  (pg_temp.k('item in'), 'Plan the ward picnic', (select s.id from public.agenda_sections s join public.agenda_templates t on t.id = s.template_id where t.slug = 'bishopric' and s.kind = 'items' limit 1), current_date - 730),
  (pg_temp.k('item out'), 'Plan the ward social', (select s.id from public.agenda_sections s join public.agenda_templates t on t.id = s.template_id where t.slug = 'bishopric' and s.kind = 'items' limit 1), current_date - 731),
  (pg_temp.k('item open'), 'Fix the gym lights', (select s.id from public.agenda_sections s join public.agenda_templates t on t.id = s.template_id where t.slug = 'bishopric' and s.kind = 'items' limit 1), null);

-- Sacrament meetings and their programs: 3 years after the meeting.
insert into public.meetings (id, meeting_date) values
  (pg_temp.k('meeting in'), current_date - 1095),
  (pg_temp.k('meeting out'), current_date - 1096);
insert into public.program_items (id, meeting_id, position, kind, person_name, topic) values
  (pg_temp.k('talk out'), pg_temp.k('meeting out'), 1, 'talk', 'Sister Abel', 'Gratitude');

-- Away dates: a year after ends_on.
insert into public.absences (id, user_id, starts_on, ends_on) values
  (pg_temp.k('away in'), pg_temp.uid('first@ward.test'), current_date - 370, current_date - 365),
  (pg_temp.k('away out'), pg_temp.uid('first@ward.test'), current_date - 370, current_date - 366);

-- Meeting reminders: 90 days after the meeting.
insert into public.meeting_reminders (event_id, for_date, sent_by) values
  ((select id from public.recurring_events where reminder_by is not null limit 1), current_date - 90, pg_temp.uid('secretary@ward.test')),
  ((select id from public.recurring_events where reminder_by is not null limit 1), current_date - 91, pg_temp.uid('secretary@ward.test'));

-- Meeting assignments: 90 days after the meeting, keeping the name on the agenda.
insert into public.agenda_assignments (id, template_id, meeting_date, part, assignee_id) values
  (pg_temp.k('assignment in'), (select id from public.agenda_templates where slug = 'ward-council'), current_date - 90, 'opening_prayer', pg_temp.uid('rspres@ward.test')),
  (pg_temp.k('assignment out'), (select id from public.agenda_templates where slug = 'ward-council'), current_date - 91, 'opening_prayer', pg_temp.uid('rspres@ward.test'));

-- Accounts: 180 days after losing every role. Taken off the allowlist, then backdated.
delete from public.allowlist where email in ('temple@ward.test', 'activities@ward.test');
update public.profiles set removed_at = now() - interval '180 days' + interval '1 hour' where email = 'temple@ward.test';
update public.profiles set removed_at = now() - interval '180 days' - interval '1 hour' where email = 'activities@ward.test';
insert into public.requests (id, from_id, to_id, title) values
  (pg_temp.k('request from removed'), pg_temp.uid('activities@ward.test'), pg_temp.uid('bishop@ward.test'), 'Book the gym');
-- Someone with an old removal date who holds a role again (shouldn't happen, but never deleted).
update public.profiles set removed_at = now() - interval '2 years' where email = 'leader@ward.test';

create temp table before_purge as select
  pg_temp.uid('temple@ward.test') as temple,
  pg_temp.uid('activities@ward.test') as activities,
  (select id from public.recurring_events where reminder_by is not null limit 1) as reminded_event;

-- ---------------------------------------------------------------------------
-- Run it
-- ---------------------------------------------------------------------------

create temp table result as select public.purge_old_records() as counts;

-- Callings
select ok(pg_temp.has('calling_candidates', 'declined in'), 'a name declined 90 days ago stays');
select ok(not pg_temp.has('calling_candidates', 'declined out'), 'a name declined over 90 days ago is deleted');
select ok(pg_temp.has('calling_candidates', 'suggested old'), 'a name still being considered stays however old');

select ok(pg_temp.has('calling_needs', 'cancelled in'), 'a calling cancelled 90 days ago stays');
select ok(not pg_temp.has('calling_needs', 'cancelled out'), 'a calling cancelled over 90 days ago is deleted');
select ok(not pg_temp.has('calling_candidates', 'cancelled out name'), 'with its names');
select ok(not pg_temp.has('calling_requests', 'cancelled out request'), 'and the calling request that asked for it');

select ok(pg_temp.has('calling_needs', 'release year in'), 'a release announced a year ago stays');
select ok(not pg_temp.has('calling_needs', 'release year out'), 'a release announced over a year ago is deleted');
select ok(not pg_temp.has('calling_requests', 'release year out request'), 'with its calling request');
select is((select notes from public.calling_needs where id = pg_temp.k('release notes in')), 'Asked to be released', 'notes on a release announced 90 days ago stay');
select is((select notes from public.calling_needs where id = pg_temp.k('release notes out')), null, 'notes on a release announced over 90 days ago are cleared');
select is((select notes from public.calling_requests where id = pg_temp.k('release notes out request')), null, 'and on its calling request');
select ok(pg_temp.has('calling_requests', 'release notes out request'), 'which itself stays');
select is((select notes from public.calling_needs where id = pg_temp.k('release coming')), 'Next month', 'a release not yet announced keeps its notes');

select ok(pg_temp.has('calling_needs', 'set apart in'), 'a calling whose name was set apart a year ago stays');
select is((select notes from public.calling_needs where id = pg_temp.k('set apart in')), null, 'without its notes');
select is((select notes from public.calling_candidates where id = pg_temp.k('set apart in name')), null, 'or the notes on the name');
select ok(not pg_temp.has('calling_needs', 'set apart out'), 'a calling whose name was set apart over a year ago is deleted');
select ok(not pg_temp.has('calling_candidates', 'set apart out name'), 'with the name');
select ok(not pg_temp.has('calling_requests', 'set apart out request'), 'and its calling request');
select ok(not pg_temp.has('calling_needs', 'set apart undated'), 'a name set apart on an unknown day counts from when it was added');
select ok(pg_temp.has('calling_needs', 'open'), 'a calling still being filled stays however old');
select is((select notes from public.calling_candidates where id = pg_temp.k('open name')), 'Ask after Christmas', 'with its notes');

select ok(pg_temp.has('calling_requests', 'suggest in'), 'a finished suggestion made a year ago stays');
select ok(not pg_temp.has('calling_requests', 'suggest out'), 'a finished suggestion made over a year ago is deleted');
select ok(pg_temp.has('calling_requests', 'suggest waiting'), 'a suggestion with a name still undecided stays');

-- Appointments
select is((select notes from public.interviews where id = pg_temp.k('appt notes in')), 'Talked about work', 'notes on an appointment 90 days ago stay');
select is((select (notes, report_note) is null from public.interviews where id = pg_temp.k('appt notes out')), true, 'notes and the report on an older one are cleared');
select ok(pg_temp.has('interviews', 'appt notes out'), 'the appointment itself stays');
select ok(pg_temp.has('interviews', 'appt year in'), 'an appointment a year ago stays');
select ok(not pg_temp.has('interviews', 'appt year out'), 'an appointment over a year ago is deleted');
select is((select notes from public.interviews where id = pg_temp.k('appt unscheduled')), 'Call him', 'one still waiting for a time stays, with its notes');
select ok(not pg_temp.has('interviews', 'appt cancelled untimed'), 'one cancelled before it got a time goes a year after it was made');

-- Everything else
select ok(pg_temp.has('requests', 'request in'), 'a request closed a year ago stays');
select ok(not pg_temp.has('requests', 'request out'), 'a request closed over a year ago is deleted');
select ok(pg_temp.has('requests', 'request open'), 'an open request stays however old');

select ok(pg_temp.has('prayer_roll', 'prayer in'), 'a name off the prayer roll 90 days stays');
select ok(not pg_temp.has('prayer_roll', 'prayer out'), 'a name off the prayer roll longer is deleted');
select ok(pg_temp.has('prayer_roll', 'prayer on'), 'a name still on the prayer roll stays');

select ok(pg_temp.has('agenda_items', 'item in'), 'an agenda item resolved 2 years ago stays');
select ok(not pg_temp.has('agenda_items', 'item out'), 'an agenda item resolved longer ago is deleted');
select ok(pg_temp.has('agenda_items', 'item open'), 'an unresolved agenda item stays');

select ok(pg_temp.has('meetings', 'meeting in'), 'a sacrament meeting 3 years ago stays');
select ok(not pg_temp.has('meetings', 'meeting out') and not pg_temp.has('program_items', 'talk out'), 'an older one is deleted with its program');

select ok(pg_temp.has('absences', 'away in') and not pg_temp.has('absences', 'away out'), 'away dates go once they ended over a year ago');

select is(
  (select array_agg(for_date order by for_date) from public.meeting_reminders where event_id = (select reminded_event from before_purge) and for_date in (current_date - 90, current_date - 91)),
  array[current_date - 90],
  'a meeting reminder goes once the meeting is over 90 days past'
);

select ok(pg_temp.has('agenda_assignments', 'assignment in') and not pg_temp.has('agenda_assignments', 'assignment out'), 'a meeting assignment goes once the meeting is over 90 days past');
select is(
  (select opening_prayer from public.agendas where template_id = (select id from public.agenda_templates where slug = 'ward-council') and meeting_date = current_date - 91),
  'Sister Young',
  'the agenda still shows who gave the prayer'
);

-- Accounts
select ok(exists (select 1 from auth.users where id = (select temple from before_purge)), 'an account removed 180 days ago stays');
select ok(not exists (select 1 from auth.users where id = (select activities from before_purge)), 'an account removed longer ago is deleted');
select is(
  (select from_id from public.requests where id = pg_temp.k('request from removed')),
  null,
  'their requests stay, from a former member'
);
select ok(exists (select 1 from auth.users where email = 'leader@ward.test'), 'someone holding a role is never deleted, whatever removed_at says');

select is((select (counts ->> 'accounts')::int from result), 1, 'the run says how many of each it deleted');
select is((select schedule from cron.job where jobname = 'purge'), '23 9 * * *', 'it runs every day');

-- ---------------------------------------------------------------------------
-- Delivery logs: the hourly health check deletes them after 30 days
-- ---------------------------------------------------------------------------

insert into public.notification_log (user_id, kind, for_date, sent_at) values
  (pg_temp.uid('bishop@ward.test'), 'day_summary', current_date - 29, now() - interval '30 days' + interval '1 hour'),
  (pg_temp.uid('bishop@ward.test'), 'day_summary', current_date - 30, now() - interval '30 days' - interval '1 hour');
insert into public.push_events (key, created_at) values
  ('request:log-in:seen', now() - interval '30 days' + interval '1 hour'),
  ('request:log-out:seen', now() - interval '30 days' - interval '1 hour'),
  (format('calling:%s:stage:finished', pg_temp.k('suggest in')), now() - interval '2 years'),
  (format('calling:%s:stage:finished', pg_temp.k('suggest out')), now() - interval '2 years');

insert into public.client_errors (message, route, created_at) values
  ('kept', '/retention-in', now() - interval '30 days' + interval '1 hour'),
  ('gone', '/retention-out', now() - interval '30 days' - interval '1 hour');

select lives_ok($$ select public.health_check() $$, 'the hourly check runs');
select is(
  (select array_agg(route order by route) from public.client_errors where route like '/retention-%'),
  array['/retention-in'],
  'an error report from 30 days ago stays, an older one is deleted'
);
select is(
  (select array_agg(for_date order by for_date) from public.notification_log where user_id = pg_temp.uid('bishop@ward.test') and for_date in (current_date - 29, current_date - 30)),
  array[current_date - 29],
  'a notification logged 30 days ago stays, an older one is deleted'
);
select ok(exists (select 1 from public.push_events where key = 'request:log-in:seen'), 'a push sent 30 days ago stays');
select ok(not exists (select 1 from public.push_events where key = 'request:log-out:seen'), 'an older one is deleted');
select ok(exists (select 1 from public.push_events where key = format('calling:%s:stage:finished', pg_temp.k('suggest in'))),
  'a calling request''s progress stays recorded while the request exists, so the leader isn''t told twice');
select ok(not exists (select 1 from public.push_events where key = format('calling:%s:stage:finished', pg_temp.k('suggest out'))),
  'and goes once the request is deleted');

select finish();
rollback;
