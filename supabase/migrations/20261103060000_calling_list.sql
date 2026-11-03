-- The calling list: the titles the Calling box suggests. Admins tidy it on the Calling list page.
-- It starts with the ward callings from the General Handbook (30.8.1 and the organization
-- chapters). A title the bishopric types that isn't on the list joins it with no organization, so
-- admins can review it, and renaming a title renames the open callings that use it.

-- One row per title, ignoring case.
delete from public.callings a using public.callings b
  where lower(btrim(a.title)) = lower(btrim(b.title)) and (a.created_at, a.id) > (b.created_at, b.id);
update public.callings set title = btrim(title);
alter table public.callings add constraint callings_title_not_blank check (btrim(title) <> '' and title = btrim(title));
create unique index callings_title_key on public.callings (lower(title));

insert into public.callings (title, organization)
select title, organization
from (values
  ('Bishop', 'Bishopric'),
  ('Bishopric First Counselor', 'Bishopric'),
  ('Bishopric Second Counselor', 'Bishopric'),
  ('Ward Clerk', 'Bishopric'),
  ('Assistant Ward Clerk', 'Bishopric'),
  ('Ward Executive Secretary', 'Bishopric'),
  ('Assistant Ward Executive Secretary', 'Bishopric'),
  ('Elders Quorum President', 'Elders Quorum'),
  ('Elders Quorum First Counselor', 'Elders Quorum'),
  ('Elders Quorum Second Counselor', 'Elders Quorum'),
  ('Elders Quorum Secretary', 'Elders Quorum'),
  ('Elders Quorum Teacher', 'Elders Quorum'),
  ('Elders Quorum Activity Coordinator', 'Elders Quorum'),
  ('Ministering Brother', 'Elders Quorum'),
  ('Relief Society President', 'Relief Society'),
  ('Relief Society First Counselor', 'Relief Society'),
  ('Relief Society Second Counselor', 'Relief Society'),
  ('Relief Society Secretary', 'Relief Society'),
  ('Relief Society Teacher', 'Relief Society'),
  ('Relief Society Activity Coordinator', 'Relief Society'),
  ('Compassionate Service Coordinator', 'Relief Society'),
  ('Ministering Sister', 'Relief Society'),
  ('Priests Quorum First Assistant', 'Aaronic Priesthood'),
  ('Priests Quorum Second Assistant', 'Aaronic Priesthood'),
  ('Teachers Quorum President', 'Aaronic Priesthood'),
  ('Teachers Quorum First Counselor', 'Aaronic Priesthood'),
  ('Teachers Quorum Second Counselor', 'Aaronic Priesthood'),
  ('Teachers Quorum Secretary', 'Aaronic Priesthood'),
  ('Deacons Quorum President', 'Aaronic Priesthood'),
  ('Deacons Quorum First Counselor', 'Aaronic Priesthood'),
  ('Deacons Quorum Second Counselor', 'Aaronic Priesthood'),
  ('Deacons Quorum Secretary', 'Aaronic Priesthood'),
  ('Aaronic Priesthood Quorum Adviser', 'Aaronic Priesthood'),
  ('Aaronic Priesthood Quorum Specialist', 'Aaronic Priesthood'),
  ('Young Women President', 'Young Women'),
  ('Young Women First Counselor', 'Young Women'),
  ('Young Women Second Counselor', 'Young Women'),
  ('Young Women Secretary', 'Young Women'),
  ('Young Women Class Adviser', 'Young Women'),
  ('Young Women Specialist', 'Young Women'),
  ('Young Women Class President', 'Young Women'),
  ('Young Women Class First Counselor', 'Young Women'),
  ('Young Women Class Second Counselor', 'Young Women'),
  ('Young Women Class Secretary', 'Young Women'),
  ('Primary President', 'Primary'),
  ('Primary First Counselor', 'Primary'),
  ('Primary Second Counselor', 'Primary'),
  ('Primary Secretary', 'Primary'),
  ('Primary Teacher', 'Primary'),
  ('Primary Music Leader', 'Primary'),
  ('Primary Pianist', 'Primary'),
  ('Nursery Leader', 'Primary'),
  ('Primary Activity Leader', 'Primary'),
  ('Sunday School President', 'Sunday School'),
  ('Sunday School First Counselor', 'Sunday School'),
  ('Sunday School Second Counselor', 'Sunday School'),
  ('Sunday School Secretary', 'Sunday School'),
  ('Sunday School Teacher', 'Sunday School'),
  ('Gospel Doctrine Teacher', 'Sunday School'),
  ('Youth Sunday School Teacher', 'Sunday School'),
  ('Ward Resource Center Specialist', 'Sunday School'),
  ('Ward Librarian', 'Sunday School'),
  ('Ward Mission Leader', 'Missionary'),
  ('Ward Missionary', 'Missionary'),
  ('Ward Temple and Family History Leader', 'Temple and Family History'),
  ('Temple and Family History Consultant', 'Temple and Family History'),
  ('Ward Music Coordinator', 'Music'),
  ('Ward Organist', 'Music'),
  ('Ward Chorister', 'Music'),
  ('Ward Choir Director', 'Music'),
  ('Ward Choir Accompanist', 'Music'),
  ('Ward Welfare and Self-Reliance Specialist', 'Other'),
  ('Ward Activities Coordinator', 'Other'),
  ('Ward Activities Committee Member', 'Other'),
  ('Building Representative', 'Other'),
  ('Emergency Preparedness Coordinator', 'Other'),
  ('Ward Communication Specialist', 'Other'),
  ('Ward Newsletter Editor', 'Other'),
  ('Ward Bulletin Coordinator', 'Other'),
  ('Interpreter', 'Other')
) as handbook (title, organization)
on conflict ((lower(title))) do update set organization = excluded.organization;

create policy "admins manage callings" on public.callings
  for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- Each calling to fill points at its list entry, adding the title to the list when it's new.
-- Runs as the bishopric member saving the need, who may add to the list.
create function public.link_calling_need()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  found uuid;
begin
  new.calling_title := btrim(new.calling_title);
  select id into found from public.callings where lower(title) = lower(new.calling_title);
  if found is null then
    insert into public.callings (title) values (new.calling_title)
      on conflict ((lower(title))) do nothing
      returning id into found;
    if found is null then
      select id into found from public.callings where lower(title) = lower(new.calling_title);
    end if;
  end if;
  new.calling_id := found;
  return new;
end;
$$;

create trigger calling_needs_link before insert or update of calling_title on public.calling_needs
  for each row execute function public.link_calling_need();

-- Renaming a list entry renames the open callings that use it; filled and cancelled ones keep the
-- title they had. Security definer so an admin outside the bishopric can rename too.
create function public.rename_open_needs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.calling_needs set calling_title = new.title, updated_at = now()
    where calling_id = new.id and status = 'open' and calling_title <> new.title;
  return null;
end;
$$;

revoke execute on function public.rename_open_needs() from public, anon, authenticated;

create trigger callings_rename_needs after update of title on public.callings
  for each row execute function public.rename_open_needs();

-- Link the needs already entered, adding any titles not on the list yet.
update public.calling_needs set calling_title = calling_title;
