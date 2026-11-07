-- Meeting assignments (prayers and the spiritual thought): who may give them out, who sees them,
-- who answers, and that the agenda's names follow along.
-- Run with `npm run test:db`. Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

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

create function pg_temp.template(template_slug text) returns uuid language sql security definer as $$
  select id from public.agenda_templates where slug = template_slug;
$$;

-- Reads past RLS, to check what a write really did.
create function pg_temp.assignment(which public.meeting_part) returns public.agenda_assignments language sql security definer as $$
  select * from public.agenda_assignments where meeting_date = '2031-03-09' and part = which and template_id = pg_temp.template('ward-council');
$$;

create function pg_temp.agenda() returns public.agendas language sql security definer as $$
  select * from public.agendas where meeting_date = '2031-03-09' and template_id = pg_temp.template('ward-council');
$$;

-- ---------------------------------------------------------------------------
-- Giving them out
-- ---------------------------------------------------------------------------

select pg_temp.act_as('bishop@ward.test');
select ok(
  (select count(*) from public.meeting_assignees() where id = pg_temp.uid('rspres@ward.test')) = 1
  and (select count(*) from public.meeting_assignees() where id = pg_temp.uid('bishop@ward.test')) = 1,
  'the picker lists ward leaders and the bishop himself'
);
select lives_ok(
  format($$ insert into public.agenda_assignments (template_id, meeting_date, part, assignee_id) values (%L, '2031-03-09', 'opening_prayer', %L) $$,
    pg_temp.template('ward-council'), pg_temp.uid('rspres@ward.test')),
  'the bishop gives the opening prayer to a ward leader'
);
select is((pg_temp.assignment('opening_prayer')).status, 'asked'::public.assignment_answer, 'it waits on her answer');
select is((pg_temp.assignment('opening_prayer')).assigned_by, pg_temp.uid('bishop@ward.test'), 'and records who asked');
select is((pg_temp.agenda()).opening_prayer, 'Sister Young', 'the agenda shows her name for reminders and older screens');

select lives_ok(
  format($$ insert into public.agenda_assignments (template_id, meeting_date, part, assignee_id) values (%L, '2031-03-09', 'closing_prayer', %L) $$,
    pg_temp.template('ward-council'), pg_temp.uid('bishop@ward.test')),
  'he takes the closing prayer himself'
);
select is((pg_temp.assignment('closing_prayer')).status, 'accepted'::public.assignment_answer, 'which needs no answer');

select throws_ok(
  format($$ insert into public.agenda_assignments (template_id, meeting_date, part, assignee_id, status) values (%L, '2031-03-09', 'opening_prayer', %L, 'accepted') $$,
    pg_temp.template('ward-council'), pg_temp.uid('eqpres@ward.test')),
  '23505', null,
  'each part goes to one person'
);
select throws_ok(
  format($$ insert into public.agenda_assignments (template_id, meeting_date, part, assignee_id, assigned_by) values (%L, '2031-03-09', 'spiritual_thought', %L, %L) $$,
    pg_temp.template('ward-council'), pg_temp.uid('eqpres@ward.test'), pg_temp.uid('first@ward.test')),
  '42501', null,
  'not in someone else''s name'
);

select pg_temp.act_as('eqpres@ward.test');
select lives_ok(
  format($$ insert into public.agenda_assignments (template_id, meeting_date, part, assignee_id) values (%L, '2031-03-09', 'spiritual_thought', %L) $$,
    pg_temp.template('ward-council'), pg_temp.uid('leader@ward.test')),
  'a ward council attendee gives the spiritual thought to a leader who doesn''t attend'
);
select ok((select count(*) from public.meeting_assignees()) > 0, 'and gets the picker');
select throws_ok(
  format($$ insert into public.agenda_assignments (template_id, meeting_date, part, assignee_id) values (%L, '2031-03-09', 'opening_prayer', %L) $$,
    pg_temp.template('bishopric'), pg_temp.uid('ywpres@ward.test')),
  '42501', null,
  'but not on the bishopric meeting'
);

select pg_temp.act_as('leader@ward.test');
select is((select count(*)::int from public.meeting_assignees()), 0, 'someone who attends no meeting gets an empty picker');
select is((select count(*)::int from public.agenda_assignments), 1, 'and sees only her own assignment');

-- ---------------------------------------------------------------------------
-- Answering
-- ---------------------------------------------------------------------------

select pg_temp.act_as('rspres@ward.test');
select is(
  (select meeting_name || ' ' || part from public.my_meeting_assignments() where meeting_date = '2031-03-09'),
  'Ward Council opening_prayer',
  'she sees what she was asked, with the meeting''s name'
);
select lives_ok(
  $$ update public.agenda_assignments set status = 'declined', reply = 'Out of town' where meeting_date = '2031-03-09' and part = 'opening_prayer' $$,
  'she declines with a note'
);
select isnt((pg_temp.assignment('opening_prayer')).answered_at, null, 'which records when');
select is((pg_temp.assignment('opening_prayer')).answered_by, pg_temp.uid('rspres@ward.test'), 'and that she answered herself');
select is((pg_temp.agenda()).opening_prayer, null, 'and takes her name off the agenda');
select throws_ok(
  $$ update public.agenda_assignments set meeting_date = '2031-03-16' where meeting_date = '2031-03-09' and part = 'opening_prayer' $$,
  '42501', null,
  'she can''t move it to another week'
);
select lives_ok(
  $$ update public.agenda_assignments set status = 'accepted', reply = null where meeting_date = '2031-03-09' and part = 'opening_prayer' $$,
  'she changes her mind and accepts'
);
select is((pg_temp.agenda()).opening_prayer, 'Sister Young', 'and her name is back');

select pg_temp.act_as('leader@ward.test');
select throws_ok(
  format($$ update public.agenda_assignments set assignee_id = %L where meeting_date = '2031-03-09' and part = 'spiritual_thought' $$, pg_temp.uid('primarypres@ward.test')),
  '42501', null,
  'someone asked who doesn''t attend can''t hand it on'
);
update public.agenda_assignments set status = 'accepted' where meeting_date = '2031-03-09' and part = 'opening_prayer';
select is((pg_temp.assignment('opening_prayer')).status, 'accepted'::public.assignment_answer, 'or touch someone else''s');

select pg_temp.act_as('bishop@ward.test');
select lives_ok(
  $$ update public.agenda_assignments set status = 'accepted' where meeting_date = '2031-03-09' and part = 'spiritual_thought' $$,
  'an attendee records her answer for her, after asking by text'
);
select is((pg_temp.assignment('spiritual_thought')).answered_by, pg_temp.uid('bishop@ward.test'), 'which says who recorded it');
select lives_ok(
  format($$ update public.agenda_assignments set assignee_id = %L where meeting_date = '2031-03-09' and part = 'opening_prayer' $$, pg_temp.uid('eqpres@ward.test')),
  'but can give a part to someone else'
);
select is((pg_temp.assignment('opening_prayer')).status, 'asked'::public.assignment_answer, 'which asks them fresh');
select is((pg_temp.assignment('opening_prayer')).reply, null, 'without the old note');
select is((pg_temp.assignment('opening_prayer')).answered_by, null, 'or who answered it');
select is((pg_temp.agenda()).opening_prayer, 'Brother Hollis', 'with their name on the agenda');

select pg_temp.act_as('rspres@ward.test');
select is((select count(*)::int from public.my_meeting_assignments() where meeting_date = '2031-03-09'), 0, 'the first person no longer has it');

select pg_temp.act_as('bishop@ward.test');
delete from public.agenda_assignments where meeting_date = '2031-03-09' and part = 'opening_prayer';
select is((pg_temp.agenda()).opening_prayer, null, 'removing it clears the agenda');

select * from finish();
rollback;
