-- How long an appointment takes, so the open times around it adjust. Most take 10 minutes;
-- extending a calling can take 5, a temple recommend interview takes at least 10, and the bishop
-- often needs longer with some people. The secretary sets it when booking and can change it after.

alter table public.interviews
  add column duration_minutes smallint not null default 10,
  add constraint interviews_duration_check check (duration_minutes between 5 and 120 and duration_minutes % 5 = 0),
  add constraint interviews_temple_recommend_duration_check check (purpose <> 'temple_recommend' or duration_minutes >= 10);
