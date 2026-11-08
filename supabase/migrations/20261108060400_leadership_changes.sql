-- Leadership changes, run by the ward itself:
--
--   * run_handover(): a change of bishopric. The bishop (or an admin) names who holds each office
--     now. People may stay, move to another office, leave, or be new. Open work moves from each
--     person leaving an office to whoever takes it, and the outgoing bishop may mentor the new one
--     for a few weeks (delegations).
--   * change_leader(): a new leader for an organization (Relief Society, Primary...). Anyone in
--     the bishopric, or an admin. The old leader's open work moves to the new one.
--   * Someone new who hasn't signed in yet is added to the allowlist; their work waits with the
--     person they replace and moves the first time they sign in (handle_new_user).
--
-- What moves (move_leadership_work), from each person leaving to their successor:
--   open requests to and from them, booked or unbooked appointments (including a calling's
--   "Meets with"), calling requests not yet received (routed_to) and their own calling requests
--   still in progress, rotations, stewardships, secretary assignments, usual appointment hours
--   (only if the successor has none), sacrament meetings they're down to conduct, standing
--   meetings they remind people about, and agenda attendance.
-- What stays, and becomes "Former member" only if the account is deleted: anything closed or in
-- the past, and who suggested, created, sent, assigned, answered or received something.
--
-- While a change runs, ward.leadership_change is on: the request guard and guard_profile_update
-- stand aside (the database is moving things, not a person), and appointment and away-date
-- notices aren't queued one by one.
--
-- Additive: new tables and functions only, plus `when` clauses that are always true for the
-- live frontend.

-- ---------------------------------------------------------------------------
-- Records of each change
-- ---------------------------------------------------------------------------

create table public.handovers (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('bishopric', 'leader')),
  run_by uuid references public.profiles (id) on delete set null,
  run_at timestamptz not null default now()
);

comment on table public.handovers is 'A change of bishopric, or a new leader for an organization.';

create table public.handover_seats (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.handovers (id) on delete cascade,
  office public.bishopric_office,
  organization text,
  outgoing_id uuid references public.profiles (id) on delete set null,
  incoming_id uuid references public.profiles (id) on delete set null,
  incoming_email extensions.citext,
  moved_at timestamptz,
  check (office is not null or organization is not null)
);

comment on table public.handover_seats is 'Who left and who took each office or organization. moved_at is null while the newcomer hasn''t signed in and their work waits.';

create index handover_seats_waiting_idx on public.handover_seats (incoming_email) where moved_at is null;

alter table public.delegations
  add constraint delegations_handover_id_fkey foreign key (handover_id) references public.handovers (id) on delete set null;

alter table public.handovers enable row level security;
alter table public.handover_seats enable row level security;

create policy "bishopric read handovers" on public.handovers
  for select to authenticated using (public.has_role('bishopric') or public.has_role('admin'));

create policy "bishopric read handover seats" on public.handover_seats
  for select to authenticated using (public.has_role('bishopric') or public.has_role('admin'));

revoke insert, update, delete on public.handovers, public.handover_seats from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Guards stand aside while the database moves things
-- ---------------------------------------------------------------------------

drop trigger requests_guard on public.requests;
create trigger requests_guard before update on public.requests
  for each row
  when (current_setting('ward.deleting_account', true) is distinct from 'on'
    and current_setting('ward.leadership_change', true) is distinct from 'on')
  execute function public.guard_request_change();

drop trigger interviews_queue_notice on public.interviews;
create trigger interviews_queue_notice
  after insert or update of status, scheduled_at, interviewer_id on public.interviews
  for each row
  when (current_setting('ward.leadership_change', true) is distinct from 'on')
  execute function public.queue_appointment_notice();

drop trigger absences_queue_notice on public.absences;
create trigger absences_queue_notice
  after insert or update of starts_on, ends_on on public.absences
  for each row
  when (current_setting('ward.leadership_change', true) is distinct from 'on')
  execute function public.queue_away_notice();

-- ---------------------------------------------------------------------------
-- Moving open work
-- ---------------------------------------------------------------------------

-- froms[i] hands over to tos[i]. Everything moves in one step per table, so a chain (the first
-- counselor becomes bishop, someone new becomes first counselor) doesn't cascade.
create function public.move_leadership_work(froms uuid[], tos uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('ward.leadership_change', 'on', true);

  create temp table if not exists leadership_moves (f uuid primary key, t uuid not null) on commit drop;
  truncate pg_temp.leadership_moves;
  insert into pg_temp.leadership_moves (f, t)
  select f, t from unnest(froms, tos) as m(f, t)
  where f is not null and t is not null and f <> t
  on conflict (f) do nothing;

  -- Open requests. One that would end up to the person who sent it is closed instead.
  update public.requests r set
    from_id = case when x.new_from = x.new_to then r.from_id else x.new_from end,
    to_id = case when x.new_from = x.new_to then r.to_id else x.new_to end,
    status = case when x.new_from = x.new_to then 'declined'
                  when x.new_to is distinct from r.to_id then 'sent' else r.status end,
    reply = case when x.new_from = x.new_to then 'Closed at the leadership change'
                 when x.new_to is distinct from r.to_id then null else r.reply end,
    seen_at = case when x.new_from = x.new_to then coalesce(r.seen_at, now())
                   when x.new_to is distinct from r.to_id then null else r.seen_at end,
    closed_at = case when x.new_from = x.new_to then now() else null end,
    updated_at = now()
  from (
    select q.id, coalesce(mf.t, q.from_id) as new_from, coalesce(mt.t, q.to_id) as new_to
    from public.requests q
    left join pg_temp.leadership_moves mf on mf.f = q.from_id
    left join pg_temp.leadership_moves mt on mt.f = q.to_id
    where q.status in ('sent', 'seen') and (mf.f is not null or mt.f is not null)
  ) x
  where r.id = x.id;

  -- Appointments still to come or to book. The secretary confirms booked ones again with the new
  -- leader's name.
  update public.interviews i set interviewer_id = m.t, confirmed_at = null, reminded_at = null
  from pg_temp.leadership_moves m
  where i.interviewer_id = m.f and i.status = 'scheduled';

  update public.calling_requests c set routed_to = (
    select coalesce(array_agg(distinct coalesce(m.t, x)), '{}')
    from unnest(c.routed_to) x left join pg_temp.leadership_moves m on m.f = x
  )
  where c.received_at is null and c.routed_to && (select array_agg(f) from pg_temp.leadership_moves);

  update public.calling_requests c set requested_by = m.t
  from pg_temp.leadership_moves m
  where c.requested_by = m.f and public.calling_request_stage(c.id) <> 'finished';

  update public.rotations r set assignee_id = m.t from pg_temp.leadership_moves m where r.assignee_id = m.f;

  update public.stewardships s set user_id = m.t from pg_temp.leadership_moves m where s.user_id = m.f;
  delete from public.stewardships s
  using public.stewardships older
  where s.user_id = older.user_id and lower(btrim(s.area)) = lower(btrim(older.area))
    and (older.created_at, older.id) < (s.created_at, s.id);

  update public.meetings g set conducting_id = m.t
  from pg_temp.leadership_moves m
  where g.conducting_id = m.f and g.meeting_date >= current_date;

  update public.recurring_events e set reminder_by = m.t from pg_temp.leadership_moves m where e.reminder_by = m.f;

  -- Pairs are rebuilt rather than updated, so no two rows collide on the way.
  create temp table if not exists leadership_pairs (a uuid, b uuid) on commit drop;
  truncate pg_temp.leadership_pairs;
  insert into pg_temp.leadership_pairs
  select coalesce(ml.t, s.leader_id), coalesce(ms.t, s.secretary_id)
  from public.secretary_assignments s
  left join pg_temp.leadership_moves ml on ml.f = s.leader_id
  left join pg_temp.leadership_moves ms on ms.f = s.secretary_id
  where ml.f is not null or ms.f is not null;
  delete from public.secretary_assignments s
  using pg_temp.leadership_moves m where s.leader_id = m.f or s.secretary_id = m.f;
  insert into public.secretary_assignments (leader_id, secretary_id)
  select distinct a, b from pg_temp.leadership_pairs where a <> b
  on conflict do nothing;

  truncate pg_temp.leadership_pairs;
  insert into pg_temp.leadership_pairs
  select a.template_id, m.t from public.agenda_attendees a join pg_temp.leadership_moves m on m.f = a.user_id;
  delete from public.agenda_attendees a using pg_temp.leadership_moves m where a.user_id = m.f;
  insert into public.agenda_attendees (template_id, user_id)
  select distinct a, b from pg_temp.leadership_pairs
  on conflict do nothing;

  -- Usual hours start the successor off when they have none; date changes were the old
  -- leader's own.
  create temp table if not exists leadership_hours on commit drop as
    select user_id, weekday, starts_at, ends_at from public.availability limit 0;
  truncate pg_temp.leadership_hours;
  insert into pg_temp.leadership_hours
  select m.t, a.weekday, a.starts_at, a.ends_at from public.availability a join pg_temp.leadership_moves m on m.f = a.user_id;
  delete from public.availability a using pg_temp.leadership_moves m where a.user_id = m.f;
  delete from public.availability_changes a using pg_temp.leadership_moves m where a.user_id = m.f;
  insert into public.availability (user_id, weekday, starts_at, ends_at)
  select h.user_id, h.weekday, h.starts_at, h.ends_at from pg_temp.leadership_hours h
  where not exists (select 1 from public.availability b where b.user_id = h.user_id);
end;
$$;

revoke execute on function public.move_leadership_work(uuid[], uuid[]) from public, anon, authenticated;

-- Gives someone a position through their allowlist entry (which is what roles follow).
create function public.set_position(
  person uuid,
  new_email extensions.citext,
  keep_roles public.app_role[],
  add_role public.app_role,
  new_office public.bishopric_office,
  new_organization text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_roles public.app_role[];
  next_roles public.app_role[];
begin
  if person is not null then
    select initial_roles into current_roles from public.allowlist where profile_id = person;
  else
    select initial_roles into current_roles from public.allowlist where email = new_email;
  end if;

  next_roles := array(
    select distinct r from unnest(coalesce(current_roles, '{}') || coalesce(array[add_role], '{}')) r
    where r = add_role or r = any (keep_roles)
    order by r
  );

  if person is not null then
    if current_roles is null then
      insert into public.allowlist (email, initial_roles, initial_office, initial_organization)
      select email, next_roles, new_office, new_organization from public.profiles where id = person;
    else
      update public.allowlist set initial_roles = next_roles, initial_office = new_office, initial_organization = new_organization
      where profile_id = person;
    end if;
  else
    insert into public.allowlist (email, initial_roles, initial_office, initial_organization)
    values (new_email, next_roles, new_office, new_organization)
    on conflict (email) do update set initial_roles = excluded.initial_roles,
      initial_office = excluded.initial_office, initial_organization = excluded.initial_organization;
  end if;
end;
$$;

revoke execute on function public.set_position(uuid, extensions.citext, public.app_role[], public.app_role, public.bishopric_office, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Change of bishopric
-- ---------------------------------------------------------------------------

-- seats: [{ "office": "bishop", "person": "<profile id>" } | { "office": ..., "email": "new@x" }
--         | { "office": ... } (left empty)], one per office being set. Offices not listed stay.
-- leaving: [{ "person": "<id>", "becomes": "released" | "leader", "organization": "Primary" }]
--          for those leaving the bishopric; anyone not listed is released.
-- mentor_ends_at: when the outgoing bishop stops helping the new one (the app sends the end of
-- the chosen day in the ward's time zone), or null for no mentoring.
create function public.run_handover(
  seats jsonb,
  leaving jsonb default '[]',
  mentor_ends_at timestamptz default null,
  mentor_sees_callings boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  change_id uuid;
  seat record;
  outgoing_bishop uuid;
  incoming_bishop uuid;
  froms uuid[] := '{}';
  tos uuid[] := '{}';
  fallback uuid;
begin
  -- The real people, never a mentor acting for someone.
  if me is null or not (
    exists (select 1 from public.profiles p where p.id = me and p.office = 'bishop' and public.holds_role(me, 'bishopric'))
    or public.holds_role(me, 'admin')
  ) then
    raise exception 'Only the bishop or an admin can change the bishopric' using errcode = '42501';
  end if;

  perform set_config('ward.leadership_change', 'on', true);

  create temp table if not exists handover_plan (
    office public.bishopric_office primary key,
    outgoing uuid,
    incoming uuid,
    incoming_email extensions.citext
  ) on commit drop;
  truncate pg_temp.handover_plan;

  insert into pg_temp.handover_plan (office, outgoing, incoming, incoming_email)
  select s.office,
    (select p.id from public.profiles p where p.office = s.office and public.holds_role(p.id, 'bishopric') order by p.id limit 1),
    coalesce(s.person, (select p.id from public.profiles p where p.email = s.email)),
    case when s.person is null and not exists (select 1 from public.profiles p where p.email = s.email) then s.email end
  from jsonb_to_recordset(seats) as s(office public.bishopric_office, person uuid, email extensions.citext);

  if exists (select 1 from pg_temp.handover_plan where office is null) then
    raise exception 'Each seat needs an office' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.handover_plan where incoming is not null group by incoming having count(*) > 1)
     or exists (select 1 from pg_temp.handover_plan where incoming_email is not null group by incoming_email having count(*) > 1) then
    raise exception 'Someone is down for two offices' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.handover_plan h where h.incoming is not null and not exists (select 1 from public.profiles p where p.id = h.incoming)) then
    raise exception 'That person doesn''t have an account' using errcode = 'P0002';
  end if;

  insert into public.handovers (kind, run_by) values ('bishopric', me) returning id into change_id;

  -- Offices first: each newcomer's entry, then those leaving.
  for seat in select * from pg_temp.handover_plan loop
    if seat.incoming is not null or seat.incoming_email is not null then
      perform public.set_position(seat.incoming, seat.incoming_email, array['admin']::public.app_role[], 'bishopric', seat.office, null);
    end if;
  end loop;

  for seat in
    select h.outgoing, coalesce(l.becomes, 'released') as becomes, l.organization
    from pg_temp.handover_plan h
    left join jsonb_to_recordset(leaving) as l(person uuid, becomes text, organization text) on l.person = h.outgoing
    where h.outgoing is not null
      and not exists (select 1 from pg_temp.handover_plan n where n.incoming = h.outgoing)
  loop
    if seat.becomes = 'leader' then
      perform public.set_position(seat.outgoing, null, array['admin']::public.app_role[], 'leader', null, nullif(btrim(coalesce(seat.organization, '')), ''));
    else
      perform public.set_position(seat.outgoing, null, array['admin']::public.app_role[], null, null, null);
    end if;
  end loop;

  -- Who each person leaving an office hands to. An office left empty sends its work to the
  -- bishop (counselors) or the executive secretary (the assistant).
  for seat in select * from pg_temp.handover_plan where outgoing is not null and outgoing is distinct from incoming loop
    fallback := case
      when seat.incoming is not null or seat.incoming_email is not null then seat.incoming
      when seat.office in ('first_counselor', 'second_counselor') then
        case when exists (select 1 from pg_temp.handover_plan where office = 'bishop')
          then (select incoming from pg_temp.handover_plan where office = 'bishop')
          else (select p.id from public.profiles p where p.office = 'bishop' and public.holds_role(p.id, 'bishopric') limit 1) end
      when seat.office = 'assistant_executive_secretary' then
        case when exists (select 1 from pg_temp.handover_plan where office = 'executive_secretary')
          then (select incoming from pg_temp.handover_plan where office = 'executive_secretary')
          else (select p.id from public.profiles p where p.office = 'executive_secretary' and public.holds_role(p.id, 'bishopric') limit 1) end
    end;
    insert into public.handover_seats (handover_id, office, outgoing_id, incoming_id, incoming_email, moved_at)
    values (change_id, seat.office, seat.outgoing, seat.incoming, seat.incoming_email, case when fallback is not null or seat.incoming_email is null then now() end);
    if fallback is not null then
      froms := froms || seat.outgoing;
      tos := tos || fallback;
    end if;
  end loop;

  perform public.move_leadership_work(froms, tos);

  -- Mentoring: the outgoing bishop helps whoever is bishop now.
  if mentor_ends_at is not null then
    select outgoing, incoming into outgoing_bishop, incoming_bishop from pg_temp.handover_plan where office = 'bishop';
    if outgoing_bishop is null or incoming_bishop is null or outgoing_bishop = incoming_bishop then
      raise exception 'Mentoring needs an outgoing bishop and a new bishop who has signed in' using errcode = '22023';
    end if;
    if mentor_ends_at <= now() or mentor_ends_at > now() + interval '12 weeks' then
      raise exception 'Mentoring can last up to 12 weeks' using errcode = '22023';
    end if;
    update public.delegations set ended_at = now() where mentor_id = outgoing_bishop and ended_at is null;
    insert into public.delegations (mentor_id, for_id, handover_id, sees_callings, ends_at)
    values (outgoing_bishop, incoming_bishop, change_id, mentor_sees_callings,
            mentor_ends_at);
  end if;

  return change_id;
end;
$$;

revoke execute on function public.run_handover(jsonb, jsonb, timestamptz, boolean) from public, anon;
grant execute on function public.run_handover(jsonb, jsonb, timestamptz, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- A new leader for an organization
-- ---------------------------------------------------------------------------

-- outgoing_becomes: 'released' (no longer a leader) or 'leader' (keeps another leader calling).
create function public.change_leader(
  org text,
  person uuid default null,
  email extensions.citext default null,
  outgoing_becomes text default 'released'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select public.acting_as());
  clean_org text := nullif(btrim(coalesce(org, '')), '');
  outgoing uuid;
  incoming uuid := person;
  waiting extensions.citext;
  change_id uuid;
begin
  if me is null or not (public.has_role('bishopric') or public.has_role('admin')) then
    raise exception 'Only the bishopric can change a leader' using errcode = '42501';
  end if;
  if clean_org is null then
    raise exception 'Say which organization' using errcode = '22023';
  end if;
  if incoming is null and email is not null then
    select id into incoming from public.profiles where profiles.email = change_leader.email;
    if incoming is null then
      waiting := email;
    end if;
  end if;
  if incoming is null and waiting is null then
    raise exception 'Say who the new leader is' using errcode = '22023';
  end if;
  if incoming is not null and public.holds_role(incoming, 'bishopric') then
    raise exception 'Someone in the bishopric can''t also lead an organization here' using errcode = '22023';
  end if;

  select id into outgoing from public.profiles
  where lower(organization) = lower(clean_org) and public.holds_role(id, 'leader') and id is distinct from incoming
  order by id limit 1;

  perform set_config('ward.leadership_change', 'on', true);
  insert into public.handovers (kind, run_by) values ('leader', me) returning id into change_id;

  perform public.set_position(incoming, waiting, array['admin']::public.app_role[], 'leader', null, clean_org);
  if outgoing is not null then
    if outgoing_becomes = 'leader' then
      perform public.set_position(outgoing, null, array['admin']::public.app_role[], 'leader', null, null);
    else
      perform public.set_position(outgoing, null, array['admin']::public.app_role[], null, null, null);
    end if;
  end if;

  insert into public.handover_seats (handover_id, organization, outgoing_id, incoming_id, incoming_email, moved_at)
  values (change_id, clean_org, outgoing, incoming, waiting, case when waiting is null then now() end);

  if outgoing is not null and incoming is not null then
    perform public.move_leadership_work(array[outgoing], array[incoming]);
  end if;
  return change_id;
end;
$$;

revoke execute on function public.change_leader(text, uuid, extensions.citext, text) from public, anon;
grant execute on function public.change_leader(text, uuid, extensions.citext, text) to authenticated;

-- "You can't remove your own admin access" fired for anyone changing their own entry without
-- admin, even if they never had it. A bishop who isn't an admin releases himself in a handover.
create or replace function public.sync_allowlist_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member uuid := case when tg_op = 'INSERT' then new.profile_id else old.profile_id end;
begin
  if member is null then
    return null; -- hasn't signed in yet
  end if;

  if tg_op <> 'INSERT'
     and member = (select auth.uid())
     and 'admin' = any (old.initial_roles)
     and (tg_op = 'DELETE' or not ('admin' = any (new.initial_roles))) then
    raise exception 'You can''t remove your own admin access'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    delete from public.roles where user_id = member;
    update public.profiles set office = null, organization = null, removed_at = coalesce(removed_at, now())
    where id = member;
  else
    delete from public.roles where user_id = member and role <> all (new.initial_roles);
    insert into public.roles (user_id, role)
    select member, unnest(new.initial_roles)
    on conflict do nothing;
    update public.profiles set office = new.initial_office, organization = new.initial_organization
    where id = member and (office, organization) is distinct from (new.initial_office, new.initial_organization);
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Work waiting for someone new moves when they first sign in
-- ---------------------------------------------------------------------------

create function public.apply_waiting_seats(person uuid, person_email extensions.citext)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  froms uuid[];
begin
  select array_agg(outgoing_id) into froms
  from public.handover_seats
  where incoming_email = person_email and moved_at is null and outgoing_id is not null;

  update public.handover_seats set incoming_id = person, moved_at = now()
  where incoming_email = person_email and moved_at is null;

  if froms is not null then
    perform public.move_leadership_work(froms, array_fill(person, array[cardinality(froms)]));
  end if;
end;
$$;

revoke execute on function public.apply_waiting_seats(uuid, extensions.citext) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.allowlist;
begin
  select * into invite from public.allowlist where lower(email::text) = lower(new.email);
  if not found then
    raise exception 'Email % is not on the allowlist', new.email
      using errcode = 'P0001';
  end if;

  insert into public.profiles (id, email, display_name, office, organization)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), invite.initial_office, invite.initial_organization);

  update public.allowlist set profile_id = new.id where email = invite.email;

  insert into public.roles (user_id, role)
  select new.id, unnest(invite.initial_roles)
  on conflict do nothing;

  perform public.apply_waiting_seats(new.id, invite.email);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- What the app needs to know
-- ---------------------------------------------------------------------------

-- What would move from this person to a successor, for the check-and-confirm step.
create function public.leadership_work(person uuid)
returns table (
  requests int,
  appointments int,
  calling_requests int,
  rotations int,
  stewardships int,
  secretary_links int,
  conducting int,
  reminders int,
  agendas int,
  has_hours boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::int from public.requests where (from_id = person or to_id = person) and status in ('sent', 'seen')),
    (select count(*)::int from public.interviews where interviewer_id = person and status = 'scheduled'),
    (select count(*)::int from public.calling_requests c
      where (c.received_at is null and person = any (c.routed_to))
         or (c.requested_by = person and public.calling_request_stage(c.id) <> 'finished')),
    (select count(*)::int from public.rotations where assignee_id = person),
    (select count(*)::int from public.stewardships where user_id = person),
    (select count(*)::int from public.secretary_assignments where leader_id = person or secretary_id = person),
    (select count(*)::int from public.meetings where conducting_id = person and meeting_date >= current_date),
    (select count(*)::int from public.recurring_events where reminder_by = person),
    (select count(*)::int from public.agenda_attendees where user_id = person),
    exists (select 1 from public.availability where user_id = person)
  where public.has_role('bishopric') or public.has_role('admin');
$$;

revoke execute on function public.leadership_work(uuid) from public, anon;
grant execute on function public.leadership_work(uuid) to authenticated;

-- Who is signed in, who they act as, and any mentoring they give or get.
create function public.whoami()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', (select auth.uid()),
    'acting_as', (select public.acting_as()),
    'mentoring', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'for_id', d.for_id, 'name', p.display_name, 'ends_at', d.ends_at, 'sees_callings', d.sees_callings) order by d.ends_at)
      from public.delegations d join public.profiles p on p.id = d.for_id
      where d.mentor_id = (select auth.uid()) and d.ended_at is null and now() between d.starts_at and d.ends_at
        and public.holds_role(d.for_id, 'bishopric')
    ), '[]'),
    'mentored_by', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'mentor_id', d.mentor_id, 'name', p.display_name, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'sees_callings', d.sees_callings) order by d.ends_at)
      from public.delegations d join public.profiles p on p.id = d.mentor_id
      where d.for_id = (select auth.uid()) and d.ended_at is null and now() between d.starts_at and d.ends_at
    ), '[]')
  )
  where (select auth.uid()) is not null;
$$;

revoke execute on function public.whoami() from public, anon;
grant execute on function public.whoami() to authenticated;
