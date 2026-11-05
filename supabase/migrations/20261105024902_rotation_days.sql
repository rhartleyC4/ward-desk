-- A rotation can fall on a set day of the months it's due ("Primary message, 3rd Sunday"), so it
-- shows on that day on Home and in the day-ahead summary. Without a day it runs all month (PPIs).
-- Additive: the live frontend ignores the new columns.

alter table public.rotations
  add column weekday smallint check (weekday between 0 and 6), -- 0 = Sunday
  add column week_of_month smallint check (week_of_month between 1 and 5),
  add constraint rotations_day_check check ((weekday is null) = (week_of_month is null)),
  add constraint rotations_months_not_empty check (cardinality(months) > 0);

comment on column public.rotations.weekday is 'With week_of_month, the day it falls on in each due month. Both null: any time that month.';
comment on column public.rotations.assignee_id is 'Who it reminds. When null (assignee_label only), it reminds the whole bishopric.';

-- The day used to live in the title.
update public.rotations
set weekday = 0, week_of_month = 3, title = 'Primary message'
where title = 'Primary message (3rd Sunday)';
