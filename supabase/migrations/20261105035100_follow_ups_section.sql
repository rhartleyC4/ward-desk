-- The bishopric meeting reviews open requests each week, just after its action and discussion items.
-- A ward that has rearranged its sections still gets it after the first list of items.

do $$
declare
  template uuid := (select id from public.agenda_templates where slug = 'bishopric');
  after_position smallint;
begin
  if template is null or exists (select 1 from public.agenda_sections where template_id = template and kind = 'follow_ups') then
    return;
  end if;

  select coalesce(min(position), 0) into after_position
  from public.agenda_sections where template_id = template and kind = 'items';

  -- Positions are unique, so move the later sections out of the way and back one place further.
  update public.agenda_sections set position = position + 1000 where template_id = template and position > after_position;
  update public.agenda_sections set position = position - 999 where template_id = template and position > 1000;

  insert into public.agenda_sections (template_id, position, kind, title)
  values (template, after_position + 1, 'follow_ups', 'Follow-ups');
end;
$$;
