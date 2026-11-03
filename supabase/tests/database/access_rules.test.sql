-- RLS tests: run with `npm run test:db` (supabase test db). Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(57);

-- Act as a seeded user for the rest of the transaction, or until the next call.
create function pg_temp.act_as(user_email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = user_email), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Allowlist sign-up trigger
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'stranger@example.com', 'authenticated', 'authenticated') $$,
  'P0001', null,
  'sign-up is rejected for an email not on the allowlist'
);

insert into public.allowlist (email, initial_roles) values ('New.Member@Ward.test', '{leader}');
insert into auth.users (id, email, aud, role)
  values ('20000000-0000-0000-0000-000000000001', 'new.member@ward.test', 'authenticated', 'authenticated');

select is(
  (select count(*)::int from public.profiles where id = '20000000-0000-0000-0000-000000000001'),
  1, 'allowlisted sign-up creates a profile (email match ignores case)'
);
select is(
  (select array_agg(role)::text from public.roles where user_id = '20000000-0000-0000-0000-000000000001'),
  '{leader}', 'allowlisted sign-up receives initial_roles'
);

insert into public.allowlist (email) values ('noroles@ward.test');
insert into auth.users (id, email, aud, role)
  values ('20000000-0000-0000-0000-000000000002', 'noroles@ward.test', 'authenticated', 'authenticated');

-- ---------------------------------------------------------------------------
-- The retired scheduler role can't be granted
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.roles (user_id, role) values ('20000000-0000-0000-0000-000000000002', 'scheduler') $$,
  '23514', null,
  'scheduler can no longer be granted'
);
select throws_ok(
  $$ insert into public.allowlist (email, initial_roles) values ('old.scheduler@ward.test', '{scheduler}') $$,
  '23514', null,
  'scheduler can no longer be put on the allowlist'
);

-- ---------------------------------------------------------------------------
-- Executive secretary and ward clerk: full bishopric access, but not admin
-- ---------------------------------------------------------------------------

select pg_temp.act_as('secretary@ward.test');

select is((select count(*)::int from public.calling_needs), 5, 'executive secretary sees all calling needs');
select lives_ok(
  $$ insert into public.meetings (meeting_date) values ('2027-01-10') $$,
  'executive secretary creates a meeting'
);
select lives_ok(
  $$ insert into public.absences (starts_on, ends_on, location) values ('2027-01-01', '2027-01-03', 'Trip') $$,
  'executive secretary records their own away dates'
);
select throws_ok(
  $$ insert into public.absences (user_id, starts_on, ends_on) values ('00000000-0000-0000-0000-000000000001', '2027-01-01', '2027-01-02') $$,
  '42501', null,
  'executive secretary cannot record away dates for someone else'
);

select pg_temp.act_as('clerk@ward.test');

select ok((select count(*) from public.interviews) > 0, 'ward clerk sees interviews');
select is((select count(*)::int from public.allowlist), 0, 'ward clerk cannot see the allowlist');

-- ---------------------------------------------------------------------------
-- Other called leaders: may only submit names
-- ---------------------------------------------------------------------------

select pg_temp.act_as('leader@ward.test');

select lives_ok(
  $$ insert into public.calling_candidates (calling_title, person_name) values ('Primary Teacher', 'Sister Vale') $$,
  'leader submits a name'
);
select is((select count(*)::int from public.calling_candidates), 0, 'leader cannot read candidates, even their own');
select is((select count(*)::int from public.calling_needs), 0, 'leader cannot see calling needs');
select is((select count(*)::int from public.interviews), 0, 'leader cannot see interviews');
select is((select count(*)::int from public.agendas), 0, 'leader cannot see agendas');
select is((select count(*)::int from public.agenda_items), 0, 'leader cannot see agenda items');
select is((select count(*)::int from public.prayer_roll), 0, 'leader cannot see the prayer roll');
select is((select count(*)::int from public.agenda_templates), 0, 'leader who attends no meeting sees no agenda templates');
select is((select count(*)::int from public.allowlist), 0, 'leader cannot see the allowlist');
select is(
  (select array_agg(distinct role)::text from public.roles where user_id <> (select auth.uid())),
  '{bishopric}', 'leader sees who is in the bishopric, but no one''s other roles'
);
select throws_ok(
  $$ insert into public.calling_candidates (calling_title, person_name, status) values ('Primary Teacher', 'Sister Vale', 'approved') $$,
  '42501', null,
  'leader cannot submit a name as already approved'
);
select throws_ok(
  $$ insert into public.calling_candidates (need_id, person_name) values ('10000000-0000-0000-0000-000000000001', 'Sister Vale') $$,
  '42501', null,
  'leader cannot attach a name to a specific need'
);
select throws_ok(
  $$ insert into public.meetings (meeting_date) values ('2027-01-17') $$,
  '42501', null,
  'leader cannot create meetings'
);
select throws_ok(
  $$ insert into public.rotations (title, months) values ('x', '{1}') $$,
  '42501', null,
  'leader cannot change the standing schedule'
);

-- ---------------------------------------------------------------------------
-- Signed in, allowlisted, but no roles yet
-- ---------------------------------------------------------------------------

select pg_temp.act_as('noroles@ward.test');

select is((select count(*)::int from public.meetings), 0, 'a user without roles sees no meetings');
select throws_ok(
  $$ insert into public.absences (starts_on, ends_on) values ('2027-01-01', '2027-01-02') $$,
  '42501', null,
  'a user without roles cannot record away dates'
);

-- ---------------------------------------------------------------------------
-- Bishopric and admin
-- ---------------------------------------------------------------------------

select pg_temp.act_as('first@ward.test');

select is((select count(*)::int from public.calling_needs), 5, 'bishopric sees all calling needs');
select ok((select count(*) from public.calling_candidates) >= 4, 'bishopric sees all candidates, including suggestions');
select ok((select count(*) from public.interviews) > 0, 'bishopric sees interviews');
select lives_ok(
  $$ insert into public.agenda_items (body) values ('New discussion item') $$,
  'bishopric adds agenda items'
);
select is((select count(*)::int from public.allowlist), 0, 'bishopric who is not admin cannot see the allowlist');
select lives_ok(
  $$ update public.profiles set short_name = 'L.' where id = (select auth.uid()) $$,
  'bishopric member edits their own short name'
);
select throws_ok(
  $$ update public.profiles set office = 'bishop' where id = (select auth.uid()) $$,
  '42501', null,
  'bishopric member cannot change their own office'
);

select is((select count(*)::int from public.agenda_templates), 2, 'bishopric sees every agenda template');
select lives_ok(
  $$ insert into public.agendas (template_id, meeting_date) select id, '2026-11-08' from public.agenda_templates where slug = 'bishopric' $$,
  'bishopric meeting and ward council agendas can share a date'
);
select is(
  (select s.title from public.agenda_items i join public.agenda_sections s on s.id = i.section_id where i.body = 'New discussion item'),
  'Action / discussion items',
  'an item sent without a section lands in the bishopric discussion items'
);

-- ---------------------------------------------------------------------------
-- Ward council attendee: that agenda and the prayer roll, nothing else
-- ---------------------------------------------------------------------------

select pg_temp.act_as('bishop@ward.test');
create temp table bishopric_section as select public.legacy_agenda_section('discussion') as id;
grant select on bishopric_section to authenticated;

select pg_temp.act_as('rspres@ward.test');

select is((select array_agg(slug)::text from public.agenda_templates), '{ward-council}', 'attendee sees only the ward council template');
select is((select count(*)::int from public.agendas), 1, 'attendee sees only ward council agendas');
select is((select count(*)::int from public.agenda_items), 8, 'attendee sees only ward council items');
select lives_ok(
  $$ insert into public.agenda_items (section_id, body) select id, 'Youth camp dates' from public.agenda_sections where title = 'Young Women' $$,
  'attendee adds an item to their meeting'
);
select throws_ok(
  $$ insert into public.agenda_items (section_id, body) select id, 'Not allowed' from bishopric_section $$,
  '42501', null,
  'attendee cannot add to the bishopric agenda'
);
select is((select count(*)::int from public.prayer_roll), 2, 'attendee uses the shared prayer roll');
select is((select count(*)::int from public.interviews), 0, 'attendee cannot see interviews');
select throws_ok(
  $$ insert into public.agenda_attendees (template_id, user_id) select id, (select auth.uid()) from public.agenda_templates $$,
  '42501', null,
  'attendee cannot change who attends'
);
select throws_ok(
  $$ insert into public.agenda_sections (template_id, position, kind, title) select id, 99, 'callings', 'Callings' from public.agenda_templates $$,
  '42501', null,
  'attendee cannot change the template'
);

select pg_temp.act_as('bishop@ward.test');

select ok((select count(*) from public.allowlist) >= 5, 'admin manages the allowlist');
select lives_ok(
  $$ update public.profiles set office = 'ward_clerk' where email = 'secretary@ward.test' $$,
  'admin assigns offices'
);

-- ---------------------------------------------------------------------------
-- Managing meetings: the bishopric, and nothing open is lost
-- ---------------------------------------------------------------------------

select pg_temp.act_as('clerk@ward.test');

select lives_ok(
  $$ select public.reorder_agenda_sections(id, array(select id from public.agenda_sections where template_id = t.id order by position desc))
     from public.agenda_templates t where slug = 'ward-council' $$,
  'ward clerk reorders sections in one call'
);
select is(
  (select title from public.agenda_sections s join public.agenda_templates t on t.id = s.template_id where slug = 'ward-council' and s.position = 1),
  'Closing prayer', 'reordering puts the sections in the given order'
);
select throws_ok(
  $$ select public.delete_agenda_section(id) from public.agenda_sections where title = 'Relief Society' $$,
  'P0001', 'This section still has open items. Mark them done first.',
  'a section with open items cannot be deleted'
);
update public.agenda_items set resolved_on = '2026-11-08'
  where section_id = (select id from public.agenda_sections where title = 'Relief Society');
select lives_ok(
  $$ select public.delete_agenda_section(id) from public.agenda_sections where title = 'Relief Society' $$,
  'a section whose items are all done can be deleted'
);
select throws_ok(
  $$ select public.delete_agenda_template(id) from public.agenda_templates where slug = 'ward-council' $$,
  'P0001', null,
  'a meeting with agendas cannot be deleted'
);
select throws_ok(
  $$ select public.delete_agenda_template(public.bishopric_template()) $$,
  'P0001', null,
  'the bishopric meeting cannot be deleted'
);

select pg_temp.act_as('secretary@ward.test');
select lives_ok(
  $$ insert into public.agenda_templates (slug, name) values ('unused', 'Unused') $$,
  'executive secretary creates a meeting'
);
select lives_ok(
  $$ select public.delete_agenda_template(id) from public.agenda_templates where slug = 'unused' $$,
  'an unused meeting can be deleted'
);

select pg_temp.act_as('rspres@ward.test');
select throws_ok(
  $$ select public.delete_agenda_section(id) from public.agenda_sections where title = 'Primary' $$,
  '42501', null,
  'a leader cannot delete sections, even in a meeting they attend'
);

select * from finish();
rollback;
