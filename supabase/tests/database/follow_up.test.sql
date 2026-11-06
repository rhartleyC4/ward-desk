-- After an appointment is booked: confirming and reminding it, reporting how it went, meeting
-- reminders, and the cron job that asks for them. Run with `npm run test:db`. Relies on seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

create function pg_temp.act_as(user_email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = user_email), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
end;
$$;

insert into public.interviews (id, interviewer_id, scheduled_at, person_name, purpose, confirmed_at, reminded_at)
values ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-00000000000b', '2026-11-08 09:00 America/Denver', 'Follow Test', 'other', now(), now());

-- ---------------------------------------------------------------------------
-- Moving a booked time
-- ---------------------------------------------------------------------------

select pg_temp.act_as('secretary@ward.test');

update public.interviews set duration_minutes = 15 where id = '00000000-0000-0000-0000-0000000f0001';
select isnt((select confirmed_at from public.interviews where id = '00000000-0000-0000-0000-0000000f0001'), null, 'changing the length keeps the confirmation');

update public.interviews set scheduled_at = '2026-11-08 09:30 America/Denver' where id = '00000000-0000-0000-0000-0000000f0001';
select is((select confirmed_at from public.interviews where id = '00000000-0000-0000-0000-0000000f0001'), null, 'moving the time clears the confirmation');
select is((select reminded_at from public.interviews where id = '00000000-0000-0000-0000-0000000f0001'), null, 'and the reminder');

update public.interviews set confirmed_at = now() where id = '00000000-0000-0000-0000-0000000f0001';
select isnt((select confirmed_at from public.interviews where id = '00000000-0000-0000-0000-0000000f0001'), null, 'the secretary confirms the new time');

-- ---------------------------------------------------------------------------
-- The leader reports a missed appointment and sends it back
-- ---------------------------------------------------------------------------

select pg_temp.act_as('bishop@ward.test');
update public.interviews
set missed_at = scheduled_at, report_note = 'Evenings', scheduled_at = null, reported_at = now(), reported_by = auth.uid()
where id = '00000000-0000-0000-0000-0000000f0001';
select is((select scheduled_at from public.interviews where id = '00000000-0000-0000-0000-0000000f0001'), null, 'a missed appointment goes back to waiting for a time');
select is((select confirmed_at from public.interviews where id = '00000000-0000-0000-0000-0000000f0001'), null, 'with nothing confirmed');

select pg_temp.act_as('leader@ward.test');
select is((select count(*)::int from public.interviews where id = '00000000-0000-0000-0000-0000000f0001'), 0, 'a called leader cannot see appointments or their notes');

-- ---------------------------------------------------------------------------
-- Meeting reminders
-- ---------------------------------------------------------------------------

select pg_temp.act_as('bishop@ward.test');
update public.recurring_events set reminder_by = (select id from public.profiles where email = 'secretary@ward.test') where title = 'Ward Council';
select is((select count(*)::int from public.recurring_events where reminder_by is not null and title = 'Ward Council'), 2, 'the bishopric picks who reminds people about a meeting');

select pg_temp.act_as('secretary@ward.test');
select lives_ok(
  $$ insert into public.meeting_reminders (event_id, for_date) select id, '2026-11-08' from public.recurring_events where title = 'Ward Council' and week_of_month = 2 $$,
  'the secretary records a reminder sent');
select is((select sent_by from public.meeting_reminders where for_date = '2026-11-08'), (select id from public.profiles where email = 'secretary@ward.test'), 'as sent by them');
select lives_ok($$ delete from public.meeting_reminders where for_date = '2026-11-08' $$, 'and can take it back');
insert into public.meeting_reminders (event_id, for_date) select id, '2026-11-08' from public.recurring_events where title = 'Ward Council' and week_of_month = 2;

select pg_temp.act_as('leader@ward.test');
select is((select count(*)::int from public.meeting_reminders), 0, 'a called leader cannot see meeting reminders');
select throws_ok(
  $$ insert into public.meeting_reminders (event_id, for_date) select id, '2026-11-15' from public.recurring_events limit 1 $$,
  '42501', null, 'or record one');

-- ---------------------------------------------------------------------------
-- The scheduled job
-- ---------------------------------------------------------------------------

select throws_ok($$ select public.call_notify() $$, '42501', null, 'signed-in people cannot start the notify job');

select pg_temp.as_owner();
select lives_ok($$ select public.call_notify() $$, 'without its Vault secrets the job does nothing, quietly');
select is((select schedule from cron.job where jobname = 'notify'), '*/10 * * * *', 'it runs every 10 minutes');

select * from finish();
rollback;
