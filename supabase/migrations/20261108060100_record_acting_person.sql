-- Everything a mentor does is recorded as the person he mentors. Every place that took "who is
-- doing this" from auth.uid() now takes it from acting_as(), which is the signed-in person unless
-- they're mentoring (see 20261108060000_mentoring_delegations).
--
-- Stays with the real, signed-in person on purpose: changing your own profile name, your devices
-- (push_subscriptions, save_push_subscription), your notification choices and history, the
-- allowlist's "you can't remove your own admin access" and delete_account's "not yourself", who
-- invited someone (admins only, never inherited), and error reports.
--
-- The notification outbox keeps both: actor_id is who it counts as (so they aren't told about
-- their own change) and acted_by is who really did it, so the notify function can tell the new
-- bishop what his mentor changed.
--
-- Additive: without the x-acting-as header acting_as() is auth.uid(), so every rule below reads
-- exactly as before for the live frontend.

-- ---------------------------------------------------------------------------
-- Who a new row belongs to, or who made it
-- ---------------------------------------------------------------------------

alter table public.requests alter column from_id set default public.acting_as();
alter table public.calling_requests alter column requested_by set default public.acting_as();
alter table public.calling_candidates alter column suggested_by set default public.acting_as();
alter table public.agenda_items alter column created_by set default public.acting_as();
alter table public.agenda_assignments alter column assigned_by set default public.acting_as();
alter table public.message_templates alter column created_by set default public.acting_as();
alter table public.meeting_reminders alter column sent_by set default public.acting_as();
alter table public.absences alter column user_id set default public.acting_as();
alter table public.availability alter column user_id set default public.acting_as();
alter table public.availability_changes alter column user_id set default public.acting_as();

alter table public.notification_outbox
  add column acted_by uuid default auth.uid() references public.profiles (id) on delete set null;

comment on column public.notification_outbox.acted_by is 'Who really made the change. Differs from actor_id when a mentor acted for the person he mentors.';

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

alter policy "members read profiles" on public.profiles
  using (public.has_any_role() or id = (select public.acting_as()));

alter policy "users read own roles" on public.roles
  using (user_id = (select public.acting_as()) or public.has_role('admin'));

alter policy "users manage own absences" on public.absences
  using (user_id = (select public.acting_as()) and public.has_any_role())
  with check (user_id = (select public.acting_as()) and public.has_any_role());

alter policy "bishopric and attendees read attendance" on public.agenda_attendees
  using (user_id = (select public.acting_as()) or public.has_role('bishopric') or public.has_role('admin'));

alter policy "people read their requests" on public.requests
  using (
    from_id = (select public.acting_as())
    or to_id = (select public.acting_as())
    or (public.has_role('bishopric') and public.holds_role(from_id, 'bishopric') and public.holds_role(to_id, 'bishopric'))
  );

alter policy "bishopric send requests" on public.requests
  with check (
    public.has_role('bishopric')
    and from_id = (select public.acting_as())
    and public.has_a_role(to_id)
    and status = 'sent' and reply is null and seen_at is null and closed_at is null
  );

alter policy "sender and recipient update requests" on public.requests
  using (from_id = (select public.acting_as()) or to_id = (select public.acting_as()))
  with check (from_id = (select public.acting_as()) or to_id = (select public.acting_as()));

alter policy "sender deletes requests" on public.requests
  using (from_id = (select public.acting_as()));

alter policy "attendees and the person asked read assignments" on public.agenda_assignments
  using (public.attends(template_id) or assignee_id = (select public.acting_as()));

alter policy "attendees make assignments" on public.agenda_assignments
  with check (public.attends(template_id) and assigned_by = (select public.acting_as()) and public.has_a_role(assignee_id));

alter policy "attendees and the person asked update assignments" on public.agenda_assignments
  using (public.attends(template_id) or assignee_id = (select public.acting_as()))
  with check (public.attends(template_id) or assignee_id = (select public.acting_as()));

alter policy "leaders submit candidates" on public.calling_candidates
  with check (
    public.has_role('leader')
    and suggested_by = (select public.acting_as())
    and status = 'suggested'
    and need_id is null
  );

-- ---------------------------------------------------------------------------
-- Functions and triggers: the same bodies, with acting_as() for the person doing it
-- ---------------------------------------------------------------------------

create or replace function public.attends(template uuid)
returns boolean
language sql
stable security definer
set search_path = ''
as $function$
  select public.has_role('bishopric') or exists (
    select 1 from public.agenda_attendees
    where template_id = template and user_id = (select public.acting_as())
  );
$function$
;

create or replace function public.can_use_prayer_roll()
returns boolean
language sql
stable security definer
set search_path = ''
as $function$
  select public.has_role('bishopric') or exists (
    select 1 from public.agenda_attendees a
    join public.agenda_sections s on s.template_id = a.template_id
    where a.user_id = (select public.acting_as()) and s.kind = 'prayer_roll'
  );
$function$
;

create or replace function public.request_recipients()
returns TABLE(id uuid, display_name text, office bishopric_office, in_bishopric boolean)
language sql
stable security definer
set search_path = ''
as $function$
  select p.id, p.display_name, p.office, public.holds_role(p.id, 'bishopric')
  from public.profiles p
  where public.has_role('bishopric') and p.id <> (select public.acting_as()) and public.has_a_role(p.id)
  order by public.holds_role(p.id, 'bishopric') desc, p.office nulls last, p.display_name;
$function$
;

create or replace function public.guard_request_change()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  me uuid := (select public.acting_as());
begin
  if new.from_id is distinct from old.from_id or new.created_at is distinct from old.created_at then
    raise exception 'A request''s sender can''t change' using errcode = '42501';
  end if;

  if me is not null and me = old.to_id then
    if (new.to_id, new.title, new.details, new.due_on, new.agenda_item_id)
       is distinct from (old.to_id, old.title, old.details, old.due_on, old.agenda_item_id) then
      raise exception 'Only the sender can change what a request asks' using errcode = '42501';
    end if;
    if new.status = 'sent' and old.status <> 'sent' then
      raise exception 'A request you''ve seen can''t go back to unread' using errcode = '42501';
    end if;
  elsif me is not null and me = old.from_id then
    if new.to_id is distinct from old.to_id then
      if not public.has_a_role(new.to_id) or new.to_id = old.from_id then
        raise exception 'That person can''t get requests' using errcode = '42501';
      end if;
      -- Someone new has it, so it starts over for them.
      new.status := 'sent';
      new.reply := null;
      new.seen_at := null;
      new.closed_at := null;
    elsif (new.status, new.reply, new.seen_at, new.closed_at) is distinct from (old.status, old.reply, old.seen_at, old.closed_at) then
      raise exception 'Only the person asked can answer a request' using errcode = '42501';
    end if;
  end if;

  if new.status <> 'sent' then
    new.seen_at := coalesce(new.seen_at, old.seen_at, now());
  end if;
  if new.status in ('done', 'declined') then
    new.closed_at := coalesce(case when old.status in ('done', 'declined') then old.closed_at end, now());
  else
    new.closed_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$function$
;

create or replace function public.guard_agenda_assignment()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  me uuid := (select public.acting_as());
begin
  if tg_op = 'INSERT' then
    new.status := case when new.assignee_id = me then 'accepted' else 'asked' end;
    new.reply := null;
    new.answered_at := case when new.status = 'accepted' then now() end;
    new.answered_by := case when new.status = 'accepted' then me end;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if (new.template_id, new.meeting_date, new.part, new.created_at) is distinct from (old.template_id, old.meeting_date, old.part, old.created_at) then
    raise exception 'Remove the assignment and make a new one instead' using errcode = '42501';
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    if me is not null and not public.attends(old.template_id) then
      raise exception 'Only the meeting''s attendees choose who has it' using errcode = '42501';
    end if;
    if not public.has_a_role(new.assignee_id) then
      raise exception 'That person can''t be given an assignment' using errcode = '42501';
    end if;
    -- Someone new has it, so it starts over for them.
    new.assigned_by := coalesce(me, new.assigned_by);
    new.status := case when new.assignee_id = me then 'accepted' else 'asked' end;
    new.reply := null;
    new.answered_at := case when new.status = 'accepted' then now() end;
    new.answered_by := case when new.status = 'accepted' then me end;
  else
    if me is not null and me <> old.assignee_id and not public.attends(old.template_id) then
      raise exception 'Only the person asked or the meeting''s attendees can answer' using errcode = '42501';
    end if;
    if me is not null and me = old.assignee_id and not public.attends(old.template_id) and new.assigned_by is distinct from old.assigned_by then
      raise exception 'Only the meeting''s attendees choose who has it' using errcode = '42501';
    end if;
    if (new.status, new.reply) is distinct from (old.status, old.reply) then
      new.answered_by := case when new.status = 'asked' then null else coalesce(me, new.answered_by) end;
    else
      new.answered_by := old.answered_by;
    end if;
    if new.status is distinct from old.status then
      new.answered_at := case when new.status = 'asked' then null else now() end;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$function$
;

create or replace function public.meeting_assignees()
returns TABLE(id uuid, display_name text, office bishopric_office, in_bishopric boolean)
language sql
stable security definer
set search_path = ''
as $function$
  select p.id, p.display_name, p.office, public.holds_role(p.id, 'bishopric')
  from public.profiles p
  where (public.has_role('bishopric') or exists (select 1 from public.agenda_attendees where user_id = (select public.acting_as())))
    and public.has_a_role(p.id)
  order by public.holds_role(p.id, 'bishopric') desc, p.office nulls last, p.display_name;
$function$
;

create or replace function public.my_meeting_assignments()
returns TABLE(id uuid, meeting_name text, meeting_date date, start_time time without time zone, part meeting_part, status assignment_answer, reply text, assigned_by uuid, created_at timestamp with time zone)
language sql
stable security definer
set search_path = ''
as $function$
  select a.id, t.name, a.meeting_date, t.start_time, a.part, a.status, a.reply, a.assigned_by, a.created_at
  from public.agenda_assignments a
  join public.agenda_templates t on t.id = a.template_id
  where a.assignee_id = (select public.acting_as())
  order by a.meeting_date, t.position, a.part;
$function$
;

create or replace function public.submit_calling_request(request_kind calling_request_kind, title text, org text DEFAULT NULL::text, releasing text DEFAULT NULL::text, needed date DEFAULT NULL::date, request_notes text DEFAULT NULL::text, names text[] DEFAULT '{}'::text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  me uuid := (select public.acting_as());
  clean_title text := regexp_replace(btrim(coalesce(title, '')), '\s+', ' ', 'g');
  clean_release text := nullif(btrim(coalesce(releasing, '')), '');
  clean_org text := nullif(btrim(coalesce(org, '')), '');
  clean_notes text := nullif(btrim(coalesce(request_notes, '')), '');
  new_need uuid;
  new_request uuid;
  person text;
begin
  if me is null or not (public.has_role('leader') or public.has_role('bishopric')) then
    raise exception 'Only ward leaders and the bishopric can send calling requests' using errcode = '42501';
  end if;
  if clean_title = '' then
    raise exception 'Say which calling' using errcode = '22023';
  end if;
  if request_kind in ('release', 'replace') and clean_release is null then
    raise exception 'Say who should be released' using errcode = '22023';
  end if;
  if request_kind in ('fill', 'suggest') then
    clean_release := null;
  end if;
  if request_kind = 'suggest' and not exists (select 1 from unnest(names) n where btrim(n) <> '') then
    raise exception 'Add at least one name to suggest' using errcode = '22023';
  end if;

  -- The calling list knows most callings' organization; the leader's pick is the fallback.
  clean_org := coalesce((select c.organization from public.callings c where lower(c.title) = lower(clean_title)), clean_org);

  -- Anything but a plain suggestion becomes a calling on the bishopric's list right away.
  if request_kind <> 'suggest' then
    insert into public.calling_needs (calling_title, release_name)
    values (clean_title, clean_release)
    returning id into new_need;
  end if;

  insert into public.calling_requests (requested_by, kind, calling_title, organization, release_name, needed_by, notes, need_id, routed_to)
  values (me, request_kind, clean_title, clean_org, clean_release, needed, clean_notes, new_need, public.calling_request_recipients(clean_org))
  returning id into new_request;

  foreach person in array coalesce(names, '{}') loop
    if btrim(person) <> '' then
      insert into public.calling_candidates (need_id, calling_title, person_name, status, suggested_by, request_id)
      values (new_need, clean_title, btrim(person), 'suggested', me, new_request);
    end if;
  end loop;

  return new_request;
end;
$function$
;

create or replace function public.my_calling_requests()
returns TABLE(id uuid, kind calling_request_kind, calling_title text, organization text, release_name text, needed_by date, notes text, names text[], created_at timestamp with time zone, received_at timestamp with time zone, received_by_name text, stage text)
language sql
stable security definer
set search_path = ''
as $function$
  select r.id, r.kind, r.calling_title, r.organization, r.release_name, r.needed_by, r.notes,
    -- Only the names this leader suggested, as they typed them.
    coalesce((select array_agg(c.person_name order by c.created_at) from public.calling_candidates c where c.request_id = r.id), '{}'),
    r.created_at, r.received_at, p.display_name, public.calling_request_stage(r.id)
  from public.calling_requests r
  left join public.profiles p on p.id = r.received_by
  where r.requested_by = (select public.acting_as())
  order by r.created_at desc;
$function$
;

create or replace function public.queue_appointment_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select public.acting_as());
  happened text;
begin
  if actor is null then
    return null;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'scheduled' and new.interviewer_id is not null then
      insert into public.notification_outbox (event, actor_id, interview_id, leader_id, scheduled_at)
      values (case when new.scheduled_at is null then 'added' else 'booked' end, actor, new.id, new.interviewer_id, new.scheduled_at);
    end if;
    return null;
  end if;

  if old.status <> 'scheduled' then
    return null;
  end if;

  if new.status = 'cancelled' then
    -- A leader closing a missed appointment themselves (missed_at set) tells no one.
    if old.scheduled_at is not null and new.missed_at is not distinct from old.missed_at then
      insert into public.notification_outbox (event, actor_id, interview_id, leader_id, old_scheduled_at)
      values ('cancelled', actor, new.id, old.interviewer_id, old.scheduled_at);
    end if;
    return null;
  end if;

  if new.status <> 'scheduled' then
    return null;
  end if;

  if new.interviewer_id is distinct from old.interviewer_id then
    if new.interviewer_id is not null then
      insert into public.notification_outbox (event, actor_id, interview_id, leader_id, old_leader_id, scheduled_at, old_scheduled_at)
      values ('handed_over', actor, new.id, new.interviewer_id, old.interviewer_id, new.scheduled_at, old.scheduled_at);
    end if;
    return null;
  end if;

  if new.scheduled_at is not distinct from old.scheduled_at then
    return null;
  end if;

  happened := case
    when new.scheduled_at is null and new.missed_at is distinct from old.missed_at then 'sent_back'
    when new.scheduled_at is null then 'unbooked'
    when old.scheduled_at is null then 'booked'
    else 'moved'
  end;
  insert into public.notification_outbox (event, actor_id, interview_id, leader_id, scheduled_at, old_scheduled_at)
  values (happened, actor, new.id, new.interviewer_id, new.scheduled_at, old.scheduled_at);
  return null;
end;
$function$
;

create or replace function public.queue_away_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select public.acting_as());
begin
  if actor is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.starts_on = old.starts_on and new.ends_on = old.ends_on then
    return null;
  end if;
  insert into public.notification_outbox (event, actor_id, absence_id, leader_id)
  values ('away', actor, new.id, new.user_id);
  return null;
end;
$function$
;

