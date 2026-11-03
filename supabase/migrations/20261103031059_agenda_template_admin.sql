-- Lets the bishopric (including the executive secretary and ward clerk) manage agenda templates
-- from the app: create meetings, edit and reorder sections, choose attendees, and delete
-- sections and meetings without losing anything still being discussed.

-- Same people who can edit the standing schedule.
create function public.can_manage_meetings()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('bishopric') or public.has_role('admin');
$$;

drop policy "admins manage templates" on public.agenda_templates;
create policy "bishopric manage templates" on public.agenda_templates
  for all to authenticated
  using (public.can_manage_meetings()) with check (public.can_manage_meetings());

drop policy "admins manage sections" on public.agenda_sections;
create policy "bishopric manage sections" on public.agenda_sections
  for all to authenticated
  using (public.can_manage_meetings()) with check (public.can_manage_meetings());

drop policy "admins manage attendance" on public.agenda_attendees;
create policy "bishopric manage attendance" on public.agenda_attendees
  for all to authenticated
  using (public.can_manage_meetings()) with check (public.can_manage_meetings());

-- Checked at commit, so one UPDATE can swap positions.
alter table public.agenda_sections
  drop constraint agenda_sections_template_id_position_key,
  add constraint agenda_sections_template_id_position_key unique (template_id, position) deferrable initially deferred;

-- Puts a meeting's sections in the given order. Runs as the caller, so RLS decides who may.
create function public.reorder_agenda_sections(template uuid, section_ids uuid[])
returns void
language sql
set search_path = ''
as $$
  update public.agenda_sections s
  set position = o.position
  from unnest(section_ids) with ordinality as o (id, position)
  where s.id = o.id and s.template_id = template;
$$;

-- Removes a section once nothing in it is still open. Its resolved items go with it.
-- Security definer so an admin outside the bishopric can clear the resolved items too.
create function public.delete_agenda_section(section uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_meetings() then
    raise exception 'Only the bishopric can change meetings' using errcode = '42501';
  end if;
  if exists (select 1 from public.agenda_items where section_id = section and resolved_on is null) then
    raise exception 'This section still has open items. Mark them done first.' using errcode = 'P0001';
  end if;
  delete from public.agenda_items where section_id = section;
  delete from public.agenda_sections where id = section;
end;
$$;

-- Removes a meeting that has never been used. One with agendas or items keeps its history.
create function public.delete_agenda_template(template uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_meetings() then
    raise exception 'Only the bishopric can change meetings' using errcode = '42501';
  end if;
  if template = public.bishopric_template() then
    raise exception 'The bishopric meeting can''t be deleted.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.agendas where template_id = template)
     or exists (select 1 from public.agenda_items i join public.agenda_sections s on s.id = i.section_id where s.template_id = template) then
    raise exception 'This meeting already has agendas or items, so it can''t be deleted.' using errcode = 'P0001';
  end if;
  delete from public.agenda_templates where id = template;
end;
$$;

revoke execute on function public.reorder_agenda_sections(uuid, uuid[]) from public, anon;
revoke execute on function public.delete_agenda_section(uuid) from public, anon;
revoke execute on function public.delete_agenda_template(uuid) from public, anon;
grant execute on function public.reorder_agenda_sections(uuid, uuid[]) to authenticated;
grant execute on function public.delete_agenda_section(uuid) to authenticated;
grant execute on function public.delete_agenda_template(uuid) to authenticated;
