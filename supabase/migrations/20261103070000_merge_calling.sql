-- Folds a stray calling-list title (a typo, a short form) into the right one. Open callings and
-- unsorted suggestions that used it take the right title; filled and cancelled callings keep the
-- title they had but point at the surviving entry. The stray entry is then removed.
create function public.merge_calling(stray_id uuid, keep_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  stray_title text;
  keep_title text;
begin
  if not public.has_role('admin') then
    raise exception 'Only admins can change the calling list' using errcode = '42501';
  end if;
  if stray_id = keep_id then
    raise exception 'Choose a different calling to merge into.' using errcode = 'P0001';
  end if;
  select title into stray_title from public.callings where id = stray_id;
  select title into keep_title from public.callings where id = keep_id;
  if stray_title is null or keep_title is null then
    raise exception 'That calling is no longer on the list.' using errcode = 'P0001';
  end if;

  -- Renaming relinks through the calling_needs_link trigger.
  update public.calling_needs set calling_title = keep_title, updated_at = now()
    where calling_id = stray_id and status = 'open';
  update public.calling_needs set calling_id = keep_id where calling_id = stray_id;
  update public.calling_candidates set calling_title = keep_title, updated_at = now()
    where need_id is null and status = 'suggested' and lower(calling_title) = lower(stray_title);
  delete from public.callings where id = stray_id;
end;
$$;

revoke execute on function public.merge_calling(uuid, uuid) from public, anon;
grant execute on function public.merge_calling(uuid, uuid) to authenticated;
