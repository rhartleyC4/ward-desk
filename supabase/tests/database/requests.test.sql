-- Requests between people, and calling requests from ward leaders: who sees them, who may send
-- and answer them, where calling requests go, and what a leader learns about their own.
-- Run with `npm run test:db`. Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(48);

create function pg_temp.act_as(user_email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = user_email), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.uid(user_email text) returns uuid language sql security definer as $$
  select id from auth.users where email = user_email;
$$;

-- Reads past RLS, to check what a write really did.
create function pg_temp.request(request_title text) returns public.requests language sql security definer as $$
  select * from public.requests where title = request_title;
$$;

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------

select pg_temp.act_as('bishop@ward.test');
select lives_ok(
  format($$ insert into public.requests (to_id, title, details) values (%L, 'Call the Lees', 'About Sunday') $$, pg_temp.uid('secretary@ward.test')),
  'bishop sends the secretary a request'
);
select lives_ok(
  format($$ insert into public.requests (to_id, title) values (%L, 'Plan the activity') $$, pg_temp.uid('leader@ward.test')),
  'and a ward leader one'
);
select is((pg_temp.request('Call the Lees')).from_id, pg_temp.uid('bishop@ward.test'), 'the sender is filled in');
select is((pg_temp.request('Call the Lees')).status, 'sent'::public.request_status, 'it starts unread');
select throws_ok(
  format($$ insert into public.requests (to_id, title) values (%L, 'Myself') $$, pg_temp.uid('bishop@ward.test')),
  '23514', null,
  'not to yourself'
);
select throws_ok(
  format($$ insert into public.requests (from_id, to_id, title) values (%L, %L, 'Forged') $$, pg_temp.uid('first@ward.test'), pg_temp.uid('clerk@ward.test')),
  '42501', null,
  'not in someone else''s name'
);
select throws_ok(
  format($$ insert into public.requests (to_id, title, status) values (%L, 'Already done', 'done') $$, pg_temp.uid('clerk@ward.test')),
  '42501', null,
  'not already answered'
);

select pg_temp.act_as('leader@ward.test');
select throws_ok(
  format($$ insert into public.requests (to_id, title) values (%L, 'From a leader') $$, pg_temp.uid('bishop@ward.test')),
  '42501', null,
  'a ward leader can''t send requests'
);

-- ---------------------------------------------------------------------------
-- Who sees them
-- ---------------------------------------------------------------------------

select is((select count(*)::int from public.requests), 1, 'the leader sees only the one sent to them');

select pg_temp.act_as('first@ward.test');
select is((select array_agg(title order by title) from public.requests), '{"Call the Lees"}', 'a counselor sees bishopric requests, not ones to a leader');

select pg_temp.act_as('rspres@ward.test');
select is((select count(*)::int from public.requests), 0, 'another leader sees none');

-- ---------------------------------------------------------------------------
-- Answering
-- ---------------------------------------------------------------------------

select pg_temp.act_as('secretary@ward.test');
select lives_ok($$ update public.requests set status = 'seen' where title = 'Call the Lees' $$, 'the secretary marks it seen');
select isnt((pg_temp.request('Call the Lees')).seen_at, null, 'which records when');
select throws_ok(
  $$ update public.requests set title = 'Something else' where title = 'Call the Lees' $$,
  '42501', null,
  'but can''t reword it'
);
select throws_ok(
  $$ update public.requests set status = 'sent' where title = 'Call the Lees' $$,
  '42501', null,
  'or make it unread again'
);
select lives_ok($$ update public.requests set status = 'done', reply = 'Called them' where title = 'Call the Lees' $$, 'and marks it done with a note');
select isnt((pg_temp.request('Call the Lees')).closed_at, null, 'closing it records when');
select lives_ok($$ update public.requests set status = 'seen' where title = 'Call the Lees' $$, 'reopening it is fine');
select is((pg_temp.request('Call the Lees')).closed_at, null, 'and clears the closed time');

select pg_temp.act_as('first@ward.test');
update public.requests set status = 'done' where title = 'Call the Lees';
select is((pg_temp.request('Call the Lees')).status, 'seen'::public.request_status, 'a counselor who can read it can''t answer it');

select pg_temp.act_as('bishop@ward.test');
select throws_ok(
  $$ update public.requests set status = 'done' where title = 'Call the Lees' $$,
  '42501', null,
  'the sender can''t answer for them'
);
select lives_ok($$ update public.requests set due_on = '2026-11-12' where title = 'Call the Lees' $$, 'the sender can change the date');
select lives_ok(
  format($$ update public.requests set to_id = %L where title = 'Call the Lees' $$, pg_temp.uid('assistant@ward.test')),
  'or hand it to someone else'
);
select is((pg_temp.request('Call the Lees')).status, 'sent'::public.request_status, 'which starts it over');
select is((pg_temp.request('Call the Lees')).reply, null, 'without the old note');
select lives_ok($$ delete from public.requests where title = 'Plan the activity' $$, 'the sender can take one back');

select pg_temp.act_as('assistant@ward.test');
select is((select count(*)::int from public.requests where title = 'Call the Lees'), 1, 'the new person has it');
delete from public.requests where title = 'Call the Lees';
select is((pg_temp.request('Call the Lees')).id is not null, true, 'but can''t delete it');

-- ---------------------------------------------------------------------------
-- Who can be sent one
-- ---------------------------------------------------------------------------

select pg_temp.act_as('bishop@ward.test');
select is((select count(*)::int from public.request_recipients() where id = auth.uid()), 0, 'the picker leaves out the sender');
select is((select display_name from public.request_recipients() where not in_bishopric order by display_name limit 1), 'Sister Reyes', 'and lists ward leaders after the bishopric');
select pg_temp.act_as('leader@ward.test');
select is((select count(*)::int from public.request_recipients()), 0, 'a leader gets no picker');

-- ---------------------------------------------------------------------------
-- Calling requests
-- ---------------------------------------------------------------------------

select pg_temp.act_as('leader@ward.test');
select throws_ok(
  $$ insert into public.calling_requests (kind, calling_title) values ('fill', 'Primary Teacher') $$,
  '42501', null,
  'leaders can''t insert calling requests directly'
);
select lives_ok(
  $$ select public.submit_calling_request('fill', '  Primary   Teacher ', null, null, '2026-12-01', 'Sunbeams need one', '{"Sister Vale", "", "Brother Hale"}') $$,
  'a leader asks for a Primary teacher with two names'
);
select throws_ok(
  $$ select public.submit_calling_request('replace', 'Primary Pianist') $$,
  '22023', null,
  'a release needs a name'
);
select throws_ok(
  $$ select public.submit_calling_request('suggest', 'Primary Pianist') $$,
  '22023', null,
  'a suggestion needs a name'
);
select lives_ok(
  $$ select public.submit_calling_request('suggest', 'Elders Quorum Secretary', null, null, null, null, '{"Brother Moss"}') $$,
  'and suggests a name only'
);

select is((select count(*)::int from public.calling_needs), 0, 'the leader still can''t read callings to fill');
select is((select count(*)::int from public.calling_candidates), 0, 'or names');
select is((select count(*)::int from public.calling_requests), 0, 'or the requests table');
select is(
  (select array_agg(stage order by calling_title) from public.my_calling_requests()),
  '{sent,sent}',
  'but follows both of their own requests'
);
select is(
  (select names from public.my_calling_requests() where calling_title = 'Primary Teacher'),
  '{"Sister Vale","Brother Hale"}',
  'with the names they suggested, tidied'
);

select pg_temp.act_as('rspres@ward.test');
select is((select count(*)::int from public.my_calling_requests()), 0, 'another leader doesn''t see them');

select pg_temp.act_as('second@ward.test');
select is(
  (select routed_to from public.calling_requests where calling_title = 'Primary Teacher'),
  array[pg_temp.uid('second@ward.test')],
  'Primary goes to the counselor assigned to Primary'
);
select is(
  (select routed_to from public.calling_requests where calling_title = 'Elders Quorum Secretary'),
  array[pg_temp.uid('bishop@ward.test')],
  'an organization no one is assigned goes to the bishop'
);
select is(
  (select n.status::text from public.calling_needs n join public.calling_requests r on r.need_id = n.id where r.calling_title = 'Primary Teacher'),
  'open',
  'the request adds the calling to the bishopric''s list'
);

update public.calling_requests set received_by = auth.uid(), received_at = now() where calling_title = 'Primary Teacher';
select pg_temp.act_as('leader@ward.test');
select is(
  (select stage || ' by ' || received_by_name from public.my_calling_requests() where calling_title = 'Primary Teacher'),
  'received by Brother Ortiz',
  'the leader sees it was received, and by whom'
);

select pg_temp.act_as('second@ward.test');
update public.calling_candidates set status = 'discussing' where person_name = 'Sister Vale';
select pg_temp.act_as('leader@ward.test');
select is((select stage from public.my_calling_requests() where calling_title = 'Primary Teacher'), 'in_progress', 'then that it''s being worked on');

select pg_temp.act_as('second@ward.test');
update public.calling_needs set status = 'filled' where calling_title = 'Primary Teacher';
select pg_temp.act_as('leader@ward.test');
select is((select stage from public.my_calling_requests() where calling_title = 'Primary Teacher'), 'finished', 'and finally that it''s finished');

select * from finish();
rollback;
