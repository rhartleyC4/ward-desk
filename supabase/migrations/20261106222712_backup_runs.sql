-- A row per successful off-site backup (.github/workflows/backup.yml writes it through
-- SUPABASE_DB_URL after the encrypted dump is in R2). The health check reads the newest row to
-- alert when no backup has finished in 26 hours. Holds no member data: just when, where and how big.
create table public.backup_runs (
  id bigint generated always as identity primary key,
  finished_at timestamptz not null default now(),
  object_key text not null,
  bytes bigint not null check (bytes > 0)
);

comment on table public.backup_runs is 'Successful off-site backups, newest last. Written by the backup workflow as the database owner; not readable from the app.';

create index backup_runs_finished_at on public.backup_runs (finished_at desc);

-- No policies: only the database owner (the workflow, the health check) reads or writes it.
alter table public.backup_runs enable row level security;
revoke all on public.backup_runs from anon, authenticated;
