-- Requests: the bishopric asks someone to do something ("Please call the Lees about Sunday") and
-- the person says they've seen it, then that it's done. The sender sees each step.
--
-- Who can read one: the sender and the person it's for. A request between two bishopric members is
-- bishopric business, so the whole bishopric reads those (the agenda's Follow-ups section lists
-- them). A request to anyone else stays between the two of them.
--
-- Additive: the live frontend doesn't know these tables or the new section kind, and skips a
-- section kind it doesn't know.

create type public.request_status as enum ('sent', 'seen', 'done', 'declined');

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  details text,
  due_on date,
  status public.request_status not null default 'sent',
  reply text, -- what the person said when they marked it seen, done or not possible
  agenda_item_id uuid references public.agenda_items (id) on delete set null, -- the item it was assigned from
  seen_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint requests_not_to_self check (from_id <> to_id)
);

comment on table public.requests is 'Something one person asks another to do, acknowledged and then closed by the person asked.';
comment on column public.requests.status is 'sent: not opened yet. seen: acknowledged. done, declined: closed by the person asked.';

create index requests_to_open_idx on public.requests (to_id) where status in ('sent', 'seen');
create index requests_from_idx on public.requests (from_id);
create index requests_agenda_item_idx on public.requests (agenda_item_id) where agenda_item_id is not null;

-- Whether someone else holds a role. has_role() only answers for the signed-in user.
create function public.holds_role(person uuid, check_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.roles where user_id = person and role = check_role);
$$;

create function public.has_a_role(person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.roles where user_id = person);
$$;

revoke execute on function public.holds_role(uuid, public.app_role) from public, anon;
revoke execute on function public.has_a_role(uuid) from public, anon;
grant execute on function public.holds_role(uuid, public.app_role) to authenticated;
grant execute on function public.has_a_role(uuid) to authenticated;

-- Who the bishopric can send a request to: everyone who can still sign in, bishopric first. RLS on
-- roles hides who holds the leader role, so the picker asks here. Empty for anyone else.
create function public.request_recipients()
returns table (id uuid, display_name text, office public.bishopric_office, in_bishopric boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.office, public.holds_role(p.id, 'bishopric')
  from public.profiles p
  where public.has_role('bishopric') and p.id <> (select auth.uid()) and public.has_a_role(p.id)
  order by public.holds_role(p.id, 'bishopric') desc, p.office nulls last, p.display_name;
$$;

revoke execute on function public.request_recipients() from public, anon;
grant execute on function public.request_recipients() to authenticated;

alter table public.requests enable row level security;

create policy "people read their requests" on public.requests
  for select to authenticated
  using (
    from_id = (select auth.uid())
    or to_id = (select auth.uid())
    or (public.has_role('bishopric') and public.holds_role(from_id, 'bishopric') and public.holds_role(to_id, 'bishopric'))
  );

create policy "bishopric send requests" on public.requests
  for insert to authenticated
  with check (
    public.has_role('bishopric')
    and from_id = (select auth.uid())
    and public.has_a_role(to_id)
    and status = 'sent' and reply is null and seen_at is null and closed_at is null
  );

create policy "sender and recipient update requests" on public.requests
  for update to authenticated
  using (from_id = (select auth.uid()) or to_id = (select auth.uid()))
  with check (from_id = (select auth.uid()) or to_id = (select auth.uid()));

create policy "sender deletes requests" on public.requests
  for delete to authenticated
  using (from_id = (select auth.uid()));

-- RLS can't say which columns each side may change, so this does. The person asked answers it
-- (status and reply); the sender may reword it, change the date, or hand it to someone else,
-- which starts it over. Timestamps follow the status.
create function public.guard_request_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
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
$$;

create trigger requests_guard before update on public.requests
  for each row execute function public.guard_request_change();

-- ---------------------------------------------------------------------------
-- Follow-ups: a section kind listing open requests on an agenda. Added to the bishopric meeting
-- in the next migration, since a new enum value can't be used in the transaction that adds it.
-- ---------------------------------------------------------------------------

alter type public.agenda_section_kind add value if not exists 'follow_ups';
