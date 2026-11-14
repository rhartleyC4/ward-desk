-- Leadership changes: a new bishopric, a new organization leader, and work waiting for someone
-- who hasn't signed in. Run with `npm run test:db`. Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

create function pg_temp.act_as(user_email text, for_email text default null) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = user_email), 'role', 'authenticated')::text, true);
  perform set_config('request.headers',
    case when for_email is null then '{}' else json_build_object('x-acting-as', (select id from auth.users where email = for_email))::text end, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.owner() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', '', true);
end;
$$;

create function pg_temp.uid(user_email text) returns uuid language sql security definer as $$
  select id from auth.users where email = user_email;
$$;

create function pg_temp.has(user_email text, r public.app_role) returns boolean language sql security definer as $$
  select exists (select 1 from public.roles where user_id = pg_temp.uid(user_email) and role = r);
$$;

create temp table ids as select
  pg_temp.uid('bishop@ward.test') as avery, pg_temp.uid('first@ward.test') as lane,
  pg_temp.uid('second@ward.test') as ortiz, pg_temp.uid('secretary@ward.test') as quinn,
  pg_temp.uid('assistant@ward.test') as tate, pg_temp.uid('clerk@ward.test') as pike,
  pg_temp.uid('leader@ward.test') as reyes, pg_temp.uid('rspres@ward.test') as young,
  pg_temp.uid('activities@ward.test') as okafor;
grant select on ids to authenticated;

-- Open work before the change.
insert into public.requests (from_id, to_id, title) select avery, quinn, 'R from Avery' from ids;
insert into public.requests (from_id, to_id, title, status) select ortiz, avery, 'R to Avery', 'seen' from ids;
insert into public.requests (from_id, to_id, title) select lane, reyes, 'R Lane to Reyes' from ids;
insert into public.requests (from_id, to_id, title, status) select avery, quinn, 'R closed', 'done' from ids;
insert into public.requests (from_id, to_id, title) select ortiz, young, 'R to Young' from ids;
insert into public.interviews (interviewer_id, scheduled_at, person_name, confirmed_at)
  select avery, now() + interval '5 days', 'Avery Visit', now() from ids;
insert into public.interviews (interviewer_id, scheduled_at, person_name, status)
  select avery, now() - interval '5 days', 'Avery Past', 'completed' from ids;
insert into public.interviews (interviewer_id, scheduled_at, person_name) select tate, null, 'Tate Booking' from ids;
insert into public.stewardships (user_id, area) select avery, 'Test Area Avery' from ids;
insert into public.rotations (title, assignee_id, months) select 'Test Rotation', avery, '{1,2,3}' from ids;

-- ---------------------------------------------------------------------------
-- Who can run it
-- ---------------------------------------------------------------------------

select pg_temp.act_as('second@ward.test');
select throws_ok(
  $$ select public.run_handover('[{"office": "bishop", "person": "00000000-0000-0000-0000-000000000002"}]') $$,
  '42501', null, 'a counselor can''t change the bishopric');

-- A mentor acting for a bishop isn't the bishop.
select pg_temp.owner();
insert into public.delegations (mentor_id, for_id, ends_at) select reyes, avery, now() + interval '1 week' from ids;
select pg_temp.act_as('leader@ward.test', 'bishop@ward.test');
select throws_ok(
  $$ select public.run_handover('[{"office": "bishop", "person": "00000000-0000-0000-0000-000000000002"}]') $$,
  '42501', null, 'nor can someone acting for the bishop');
select pg_temp.owner();
update public.delegations set ended_at = now() where mentor_id = (select reyes from ids);

select pg_temp.act_as('bishop@ward.test');
select throws_ok(
  format($$ select public.run_handover('[{"office": "bishop", "person": "%s"}, {"office": "first_counselor", "person": "%s"}]') $$,
    (select lane from ids), (select lane from ids)),
  '22023', null, 'one person can''t take two offices');

-- ---------------------------------------------------------------------------
-- The change: Lane becomes bishop, Sister Reyes first counselor, Ortiz and Quinn stay, someone
-- new is assistant, nobody is clerk. Avery is released and mentors Lane; Pike becomes a leader.
-- ---------------------------------------------------------------------------

select lives_ok(
  format($$ select public.run_handover(
    '[{"office": "bishop", "person": "%s"}, {"office": "first_counselor", "person": "%s"},
      {"office": "second_counselor", "person": "%s"}, {"office": "executive_secretary", "person": "%s"},
      {"office": "assistant_executive_secretary", "email": "newassistant@ward.test"}, {"office": "ward_clerk"}]',
    '[{"person": "%s", "becomes": "leader", "organization": "Music"}]',
    now() + interval '4 weeks', false) $$,
    (select lane from ids), (select reyes from ids), (select ortiz from ids), (select quinn from ids), (select pike from ids)),
  'the bishop runs the change');

select pg_temp.owner();

select is((select office::text from public.profiles where id = (select lane from ids)), 'bishop', 'the first counselor is now the bishop');
select ok(pg_temp.has('leader@ward.test', 'bishopric') and not pg_temp.has('leader@ward.test', 'leader'), 'a ward leader called as counselor joins the bishopric and stops being a leader');
select is((select row(office, organization)::text from public.profiles where id = (select reyes from ids)), '(first_counselor,)', 'with the office and no organization');
select ok(not pg_temp.has('bishop@ward.test', 'bishopric') and pg_temp.has('bishop@ward.test', 'admin'), 'the released bishop leaves the bishopric but stays an admin');
select is((select office from public.profiles where id = (select avery from ids)), null, 'and has no office');
select ok(pg_temp.has('clerk@ward.test', 'leader') and not pg_temp.has('clerk@ward.test', 'bishopric'), 'the clerk becomes a ward leader');
select is((select organization from public.profiles where id = (select pike from ids)), 'Music', 'over the organization picked');
select is((select removed_at from public.profiles where id = (select pike from ids)), null, 'someone who stays a leader isn''t removed');
select ok(pg_temp.has('assistant@ward.test', 'bishopric') is false, 'the assistant leaving is released');
select isnt((select removed_at from public.profiles where id = (select tate from ids)), null, 'and their removal clock starts');
select is((select initial_office::text from public.allowlist where email = 'newassistant@ward.test'), 'assistant_executive_secretary', 'someone new is put on the allowlist with their office');

-- Work moved.
select is((select from_id from public.requests where title = 'R from Avery'), (select lane from ids), 'an open request the old bishop sent is now from the new one');
select is((select row(to_id, status)::text from public.requests where title = 'R to Avery'), (select row(lane, 'sent')::text from ids), 'one sent to him goes to the new bishop, unread');
select is((select status::text from public.requests where title = 'R Lane to Reyes'), 'declined', 'one that would end up to its own sender is closed');
select is((select from_id from public.requests where title = 'R closed'), (select avery from ids), 'a finished request stays with whoever handled it');
select is((select row(interviewer_id, confirmed_at)::text from public.interviews where person_name = 'Avery Visit'), (select row(lane, null::timestamptz)::text from ids), 'a booked appointment moves and needs confirming again');
select is((select interviewer_id from public.interviews where person_name = 'Avery Past'), (select avery from ids), 'a past one stays');
select is((select user_id from public.stewardships where area = 'Test Area Avery'), (select lane from ids), 'assignments move');
select is((select assignee_id from public.rotations where title = 'Test Rotation'), (select lane from ids), 'rotations move');
select ok(not exists (select 1 from public.secretary_assignments where leader_id = (select avery from ids) or secretary_id = (select avery from ids)), 'who books for the old bishop moves');
select is((select count(*)::int from public.notification_outbox where interview_id = (select id from public.interviews where person_name = 'Avery Visit')), 0, 'moving appointments doesn''t send a notice for each');
select is((select interviewer_id from public.interviews where person_name = 'Tate Booking'), (select tate from ids), 'work for someone who hasn''t signed in waits');
select is((select moved_at from public.handover_seats where incoming_email = 'newassistant@ward.test'), null, 'and the seat says so');

-- Mentoring.
select is((select for_id from public.delegations where mentor_id = (select avery from ids) and ended_at is null), (select lane from ids), 'the old bishop mentors the new one');
select pg_temp.act_as('bishop@ward.test', 'first@ward.test');
select is(private.acting_as(), (select lane from ids), 'and can act for him');
select is(jsonb_array_length(public.whoami() -> 'mentoring'), 1, 'whoami tells the app');

-- The newcomer signs in: their work arrives.
select pg_temp.owner();
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'newassistant@ward.test', now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Brother New"}', now(), now(), '', '', '', '');
select is((select interviewer_id from public.interviews where person_name = 'Tate Booking'), pg_temp.uid('newassistant@ward.test'), 'the first sign-in moves the waiting work');
select isnt((select moved_at from public.handover_seats where incoming_email = 'newassistant@ward.test'), null, 'and closes the seat');

-- ---------------------------------------------------------------------------
-- A new organization leader
-- ---------------------------------------------------------------------------

select pg_temp.act_as('rspres@ward.test');
select throws_ok(
  $$ select public.change_leader('Relief Society', (select okafor from ids)) $$,
  '42501', null, 'a leader can''t change leaders');

select pg_temp.act_as('second@ward.test');
select lives_ok($$ select public.change_leader('Relief Society', (select okafor from ids)) $$, 'a counselor changes the Relief Society president');
select pg_temp.owner();
select is((select organization from public.profiles where id = (select okafor from ids)), 'Relief Society', 'the new leader has the organization');
select ok(not pg_temp.has('rspres@ward.test', 'leader'), 'the old one is released');
select is((select to_id from public.requests where title = 'R to Young'), (select okafor from ids), 'and her open requests go to the new leader');

select * from finish();
rollback;
