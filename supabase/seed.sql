-- Seed for local development and the training site. Invented people; never real member data.
-- Sign in with one of the ward.test emails and open the magic link in Mailpit (http://127.0.0.1:54324),
-- or use the practice password "gp7" (integration tests do this). The training site loads this
-- seed too, so trainees sign in with it. Never reuse it anywhere real.

insert into public.allowlist (email, initial_roles, initial_office) values
  ('bishop@ward.test', '{admin,bishopric}', 'bishop'),
  ('first@ward.test', '{bishopric}', 'first_counselor'),
  ('second@ward.test', '{bishopric}', 'second_counselor'),
  ('secretary@ward.test', '{bishopric}', 'executive_secretary'),
  ('assistant@ward.test', '{bishopric}', null),
  ('clerk@ward.test', '{bishopric}', 'ward_clerk'),
  ('leader@ward.test', '{leader}', null),
  ('rspres@ward.test', '{leader}', null);

-- Create the auth users up front so seed rows can reference them.
-- The on_auth_user_created trigger fills in profiles, roles and positions from the allowlist.
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, encrypted_password, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.full_name), now(), now(), extensions.crypt('gp7', extensions.gen_salt('bf')), '', '', '', ''
from (values
  ('00000000-0000-0000-0000-00000000000b'::uuid, 'bishop@ward.test', 'Bishop Avery'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'first@ward.test', 'Brother Lane'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'second@ward.test', 'Brother Ortiz'),
  ('00000000-0000-0000-0000-00000000000c'::uuid, 'secretary@ward.test', 'Brother Quinn'),
  ('00000000-0000-0000-0000-000000000010'::uuid, 'assistant@ward.test', 'Brother Tate'),
  ('00000000-0000-0000-0000-00000000000e'::uuid, 'clerk@ward.test', 'Brother Pike'),
  ('00000000-0000-0000-0000-00000000000d'::uuid, 'leader@ward.test', 'Sister Reyes'),
  ('00000000-0000-0000-0000-00000000000f'::uuid, 'rspres@ward.test', 'Sister Young')
) as u (id, email, full_name);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email', jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
from auth.users where email like '%@ward.test';

update public.profiles set short_name = 'Bishop' where email = 'bishop@ward.test';
update public.profiles set short_name = 'Lane' where email = 'first@ward.test';
update public.profiles set short_name = 'Ortiz' where email = 'second@ward.test';
update public.profiles set short_name = 'Quinn' where email = 'secretary@ward.test';
update public.profiles set short_name = 'Pike' where email = 'clerk@ward.test';
update public.profiles set short_name = 'Tate' where email = 'assistant@ward.test';

-- The executive secretary schedules the bishop's appointments; the assistant takes the counselors'.
insert into public.secretary_assignments (leader_id, secretary_id) values
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010');

-- Sacrament tab ---------------------------------------------------------------

insert into public.meetings (meeting_date, meeting_type, title, presiding, conducting_id, opening_hymn, sacrament_hymn, closing_hymn, invocation, benediction) values
  ('2026-11-01', 'fast_sunday', null, 'Bishop Avery', '00000000-0000-0000-0000-000000000002', 19, 169, 2, 'Sister Ames', 'Brother Bell'),
  ('2026-11-08', 'regular', null, 'Bishop Avery', '00000000-0000-0000-0000-000000000002', 85, 173, 301, null, null),
  ('2026-11-15', 'regular', null, 'Bishop Avery', '00000000-0000-0000-0000-00000000000b', 92, 184, 152, null, null),
  ('2026-11-22', 'regular', null, null, '00000000-0000-0000-0000-000000000001', null, null, null, null, null),
  ('2026-11-29', 'regular', null, null, '00000000-0000-0000-0000-000000000001', null, null, null, null, null),
  ('2026-12-06', 'fast_sunday', null, null, '00000000-0000-0000-0000-00000000000b', null, null, null, null, null),
  ('2026-12-13', 'regular', null, null, '00000000-0000-0000-0000-000000000002', null, null, null, null, null),
  ('2026-12-20', 'special_program', 'Christmas Program', null, '00000000-0000-0000-0000-00000000000b', null, null, null, null, null),
  ('2027-03-07', 'stake_conference', null, null, null, null, null, null, null, null);

insert into public.program_items (meeting_id, position, kind, person_name, topic, hymn_number, note, status)
select m.id, p.position, p.kind::public.program_item_kind, p.person_name, p.topic, p.hymn_number, p.note, p.status::public.assignment_status
from public.meetings m
join (values
  ('2026-11-08'::date, 1, 'talk', 'Brother Cole', null, null::smallint, 'Stake', 'confirmed'),
  ('2026-11-08'::date, 2, 'talk', 'Sister Diaz', 'Gratitude', null, null, 'confirmed'),
  ('2026-11-15'::date, 1, 'talk', 'Brother Ellis', null, null, null, 'confirmed'),
  ('2026-11-15'::date, 2, 'intermediate_hymn', null, null, 98, null, 'planned'),
  ('2026-11-15'::date, 3, 'talk', 'Sister Fry', null, null, null, 'invited'),
  ('2026-11-22'::date, 1, 'talk', 'Brother and Sister Gale', null, null, 'Idea - not yet asked', 'planned'),
  ('2026-11-22'::date, 2, 'talk', 'Sister Hale', null, null, 'Idea - not yet asked', 'planned'),
  ('2026-12-13'::date, 1, 'talk', 'Stake speakers', null, null, 'Stake', 'confirmed')
) as p (meeting_date, position, kind, person_name, topic, hymn_number, note, status)
  on p.meeting_date = m.meeting_date;

-- Bishopric Schedule tab ------------------------------------------------------

insert into public.recurring_events (title, weekday, week_of_month, start_time, notes) values
  ('Bishopric meeting', 0, null, '08:30', null),
  ('Welfare meeting (RS, EQ)', 0, 1, '09:15', null),
  ('Ward Council', 0, 2, '09:15', null),
  ('YW Presidency', 0, 3, '09:30', null),
  ('Ward Council', 0, 4, '09:15', null),
  ('Missed PPIs', 0, 5, '09:15', null),
  ('Youth activities', 2, null, null, null),
  ('Ministering nights or interviews', 3, null, null, null),
  ('Interviews', 4, null, null, null);

insert into public.rotations (title, assignee_id, assignee_label, months) values
  ('PPI: Elders Quorum President', null, 'EQ President', '{2,6,10}'),
  ('PPI: Relief Society President', null, 'RS President', '{1,4,8}'),
  ('PPI: Young Women President', null, 'YW President', '{3,7,11}'),
  ('Primary message (3rd Sunday)', '00000000-0000-0000-0000-00000000000b', null, '{1,4,7,10}'),
  ('Primary message (3rd Sunday)', '00000000-0000-0000-0000-000000000001', null, '{3,6,9,12}'),
  ('Primary message (3rd Sunday)', '00000000-0000-0000-0000-000000000002', null, '{2,5,8,11}');

insert into public.stewardships (user_id, area) values
  ('00000000-0000-0000-0000-00000000000b', 'Relief Society'),
  ('00000000-0000-0000-0000-00000000000b', 'Young Women'),
  ('00000000-0000-0000-0000-00000000000b', 'Young Single Adults'),
  ('00000000-0000-0000-0000-000000000001', 'Young Men (Teachers)'),
  ('00000000-0000-0000-0000-000000000001', 'Sunday School'),
  ('00000000-0000-0000-0000-000000000001', 'Activities'),
  ('00000000-0000-0000-0000-000000000002', 'Young Men (Deacons)'),
  ('00000000-0000-0000-0000-000000000002', 'Primary'),
  ('00000000-0000-0000-0000-000000000002', 'Music');

-- Travel tab -----------------------------------------------------------------

insert into public.absences (user_id, starts_on, ends_on, location) values
  ('00000000-0000-0000-0000-000000000002', '2026-11-20', '2026-11-23', 'Denver'),
  ('00000000-0000-0000-0000-000000000001', '2026-12-24', '2026-12-28', 'Family');

-- Callings -------------------------------------------------------------------

insert into public.callings (title, organization) values
  ('Primary Teacher', 'Primary'),
  ('Ward Missionary', 'Ward Mission'),
  ('Relief Society Teacher', 'Relief Society'),
  ('Sunday School Teacher', 'Sunday School');

insert into public.calling_needs (id, calling_title, release_name, release_on, status) values
  ('10000000-0000-0000-0000-000000000001', 'Primary Teacher', 'Brother Ivey', null, 'open'),
  ('10000000-0000-0000-0000-000000000002', 'Ward Missionaries', 'Brother and Sister Jones', null, 'open'),
  ('10000000-0000-0000-0000-000000000003', 'Relief Society Teacher', null, null, 'open'),
  ('10000000-0000-0000-0000-000000000004', 'YW Secretary', null, null, 'open'),
  ('10000000-0000-0000-0000-000000000005', 'Special Needs Sunday School', 'Sister Kemp', '2026-11-08', 'open');

insert into public.calling_candidates (need_id, person_name, status, sustain_on, suggested_by) values
  ('10000000-0000-0000-0000-000000000002', 'Brother and Sister Lowe', 'discussing', null, '00000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-000000000003', 'Sister Moss', 'accepted', '2026-11-01', '00000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-000000000005', 'Sister Nash', 'approved', null, '00000000-0000-0000-0000-000000000001');

-- Weekly agenda ---------------------------------------------------------------

insert into public.agendas (meeting_date, opening_prayer, spiritual_thought, closing_prayer) values
  ('2026-11-01', 'Brother Ortiz', 'Bishop Avery: handbook updates', 'Brother Lane');

insert into public.interviews (interviewer_id, scheduled_at, person_name, purpose) values
  ('00000000-0000-0000-0000-000000000001', '2026-11-01 10:00 America/Denver', 'Brother Park', 'calling'),
  ('00000000-0000-0000-0000-000000000001', '2026-11-01 12:30 America/Denver', 'Sister Park', 'temple_recommend'),
  ('00000000-0000-0000-0000-000000000002', '2026-11-01 12:30 America/Denver', 'Brother Reed', 'temple_recommend'),
  ('00000000-0000-0000-0000-00000000000b', '2026-11-01 10:15 America/Denver', 'Sister Stone', 'other');

-- Sister Nash is approved and Brother Lane will extend the call; it still needs a time.
insert into public.interviews (interviewer_id, scheduled_at, person_name, purpose, candidate_id)
select '00000000-0000-0000-0000-000000000001', null, person_name, 'calling', id
from public.calling_candidates where person_name = 'Sister Nash';

insert into public.agenda_items (section_id, kind, body, event_date)
select s.id, i.kind::public.agenda_item_kind, i.body, i.event_date
from (values
  ('bishopric', 'Action / discussion items', 'discussion', 'Fifth Sunday topic and assignments', null::date),
  ('bishopric', 'Action / discussion items', 'discussion', 'Relief Society room seating capacity: next steps', null),
  ('bishopric', 'Action / discussion items', 'discussion', 'Ward website / bulletin', null),
  ('bishopric', 'Calendar', 'calendar', 'Tithing declaration (Sundays and Tuesdays)', '2026-11-22'),
  ('bishopric', 'Calendar', 'calendar', 'Ward Christmas party', '2026-12-04'),
  ('bishopric', 'Ward ordinations & advancements', 'discussion', 'Advancement interviews in December', null),
  ('ward-council', 'General business', 'discussion', 'Updates to the prayer roll?', null),
  ('ward-council', 'General business', 'discussion', 'Sunday chair set-up in the Relief Society room', null),
  ('ward-council', 'Elders Quorum', 'discussion', 'Quorum temple day: 2nd Tuesday', null),
  ('ward-council', 'Relief Society', 'discussion', 'Room for the combined Sunday lesson', null),
  ('ward-council', 'Young Women', 'discussion', 'Summer camp planning', null),
  ('ward-council', 'Primary', 'discussion', 'Primary sacrament program rehearsal', null),
  ('ward-council', 'Ward Mission', 'discussion', 'Does each organization have a household of focus?', null),
  ('ward-council', 'Activities Committee', 'discussion', 'Ward Christmas party on December 4th', null)
) as i (slug, section, kind, body, event_date)
join public.agenda_templates t on t.slug = i.slug
join public.agenda_sections s on s.template_id = t.id and s.title = i.section;

-- Sister Young attends ward council, so she sees that agenda and the prayer roll but nothing else.
insert into public.agenda_attendees (template_id, user_id)
select id, '00000000-0000-0000-0000-00000000000f' from public.agenda_templates where slug = 'ward-council';

insert into public.agendas (template_id, meeting_date, opening_prayer, spiritual_thought)
select id, '2026-11-08', 'Sister Young', 'Brother Lane: handbook chapter 29' from public.agenda_templates where slug = 'ward-council';

insert into public.prayer_roll (name) values ('Example family'), ('Brother Example');
