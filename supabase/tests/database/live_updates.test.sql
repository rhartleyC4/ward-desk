-- Live updates: who hears the 'ward' channel, and what a change sends. Run with `npm run test:db`.
-- Relies on supabase/seed.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

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

-- What Realtime does when someone joins a private channel: reads realtime.messages as them
-- with the channel's topic set.
create function pg_temp.can_join(topic text) returns boolean language plpgsql as $$
begin
  perform set_config('realtime.topic', topic, true);
  return exists (select 1 from realtime.messages where extension = 'broadcast');
end;
$$;

-- One message per topic to read back.
insert into realtime.messages (topic, extension, event, payload, private)
values ('ward', 'broadcast', 'probe', '{}', true), ('elsewhere', 'broadcast', 'probe', '{}', true);

-- ---------------------------------------------------------------------------
-- Who may listen
-- ---------------------------------------------------------------------------

select pg_temp.act_as('first@ward.test');
select ok(private.hears_ward_changes(), 'someone in the bishopric hears ward changes');
select ok(pg_temp.can_join('ward'), 'and can join the ward channel');
select ok(not pg_temp.can_join('elsewhere'), 'but no other channel');

select pg_temp.act_as('leader@ward.test');
select ok(pg_temp.can_join('ward'), 'a ward leader can join too');

-- Someone whose roles were all taken away.
reset role;
delete from public.roles where user_id = pg_temp.uid('temple@ward.test');
select pg_temp.act_as('temple@ward.test');
select ok(not private.hears_ward_changes(), 'someone with no role does not hear ward changes');
select ok(not pg_temp.can_join('ward'), 'and can''t join the ward channel');

-- Mentoring the new bishop is enough, while it lasts.
reset role;
insert into public.delegations (mentor_id, for_id, ends_at)
values (pg_temp.uid('temple@ward.test'), pg_temp.uid('first@ward.test'), now() + interval '2 weeks');
select pg_temp.act_as('temple@ward.test');
select ok(pg_temp.can_join('ward'), 'a mentor with an open delegation can join');

reset role;
update public.delegations set ended_at = now() where mentor_id = pg_temp.uid('temple@ward.test');
select pg_temp.act_as('temple@ward.test');
select ok(not pg_temp.can_join('ward'), 'but not once it has ended');

reset role;
set local role anon;
select ok(not pg_temp.can_join('ward'), 'nobody signed out can join');

-- ---------------------------------------------------------------------------
-- What a change sends
-- ---------------------------------------------------------------------------

reset role;
delete from realtime.messages;

select pg_temp.act_as('first@ward.test');
insert into public.prayer_roll (name) values ('Live Update Test Person');
reset role;

select is(
  (select count(*)::int from realtime.messages where topic = 'ward' and event = 'changed' and private),
  1,
  'a save sends one private change message on the ward channel'
);
select is(
  (select payload - 'id' from realtime.messages where topic = 'ward' and event = 'changed'),
  '{"table": "prayer_roll"}'::jsonb,
  'saying only which table changed'
);

delete from realtime.messages;
insert into public.client_errors (source, message) values ('load', 'test');
select is((select count(*)::int from realtime.messages), 0, 'logs that nobody looks at send nothing');

select * from finish();
rollback;
