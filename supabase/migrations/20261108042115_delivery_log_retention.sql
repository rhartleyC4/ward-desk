-- Delivery logs no longer pile up. notification_log and push_events only exist so nothing is
-- sent twice, and nothing looks back further than a few days:
--
--   * scripts/notify reads notification_log for today and tomorrow only (daily.ts, followUps.ts,
--     notices.ts, daySummaries.ts).
--   * The push function refuses a change more than a few minutes old (plan.ts), so an old
--     request:, calling: or assignment: key can't be asked about again.
--   * The one exception: scripts/notify/daily.ts tells a leader when their calling request is in
--     progress or finished by looking for its calling:<id>:stage:<stage> key, with no time limit.
--     Those keys stay as long as the calling request does (the retention purge deletes it), or
--     the leader would hear the same news again.
--
-- So the hourly health check now deletes rows from both older than 30 days, alongside the
-- client_errors and notify_calls it already pruned. The pruning moves into prune_logs(), where
-- all the log periods live.

create function public.prune_logs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.client_errors where created_at < now() - interval '90 days';
  delete from public.notify_calls where called_at < now() - interval '7 days';
  delete from public.notification_log where sent_at < now() - interval '30 days';
  delete from public.push_events e
  where e.created_at < now() - interval '30 days'
    and not (
      e.key like 'calling:%:stage:%'
      and exists (select 1 from public.calling_requests r where r.id::text = split_part(e.key, ':', 2))
    );
end;
$$;

revoke execute on function public.prune_logs() from public, anon, authenticated;

comment on function public.prune_logs() is
  'Run by health_check() every hour. Error reports 90 days, notify calls 7 days, notification_log and push_events 30 days (calling request stage keys while the request exists).';

comment on table public.notification_log is 'Notifications sent, once per person, kind and day, so none goes twice. Kept 30 days.';
comment on table public.push_events is 'Notifications the push Edge Function already sent, so a repeat call sends nothing. Kept 30 days; calling request stage keys while the request exists.';

create or replace function public.health_check()
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  state public.health_state;
  -- Leave the last few minutes for the next check, so a call still waiting on its answer isn't
  -- counted as unanswered.
  check_until timestamptz := now() - interval '5 minutes';
  lines text[];
  stalled boolean := false;
  last_ok timestamptz;
  last_backup timestamptz;
  backup_late boolean := false;
  request bigint;
begin
  select * into state from public.health_state for update;
  lines := public.health_report(state.checked_until, check_until);

  -- No good answer for half an hour, once calls have been tracked that long: the cron job, pg_net
  -- or the function itself has stopped. Said at most every 12 hours.
  if exists (select 1 from vault.decrypted_secrets where name = 'notify_url')
    and exists (select 1 from public.notify_calls where called_at < now() - interval '30 minutes') then
    select max(c.called_at) into last_ok
    from public.notify_calls c
    join net._http_response r on r.id = c.request_id
    where r.status_code = 200 and not coalesce(r.timed_out, false);
    if (last_ok is null or last_ok < now() - interval '30 minutes')
      and (state.stalled_alerted_at is null or state.stalled_alerted_at < now() - interval '12 hours') then
      stalled := true;
      lines := lines || format(
        'The notify function hasn''t answered %s, so scheduled notifications may have stopped.',
        case when last_ok is null then 'in the last few hours' else 'since ' || to_char(last_ok at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC' end
      );
    end if;
  end if;

  -- No backup in 26 hours where the nightly one should run (production with BACKUP_ENABLED; set by
  -- alerts:setup). Also said at most every 12 hours.
  if state.expects_backups then
    select max(finished_at) into last_backup from public.backup_runs;
    if (last_backup is null or last_backup < now() - interval '26 hours')
      and (state.backup_alerted_at is null or state.backup_alerted_at < now() - interval '12 hours') then
      backup_late := true;
      lines := lines || case when last_backup is null
        then 'No off-site backup has been recorded yet (public.backup_runs). Check the "Database backup" workflow.'
        else 'The last off-site backup finished ' || to_char(last_backup at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC, over 26 hours ago. Check the "Database backup" workflow.'
      end;
    end if;
  end if;

  if cardinality(lines) > 0 then
    request := public.send_alert(
      format('%s problem%s in the last hour', cardinality(lines), case when cardinality(lines) = 1 then '' else 's' end),
      concat_ws(E'\n',
        array_to_string(array(select '- ' || l from unnest(lines) as l), E'\n'),
        '',
        'Where to look:',
        '- npm run env:check -- <environment>',
        '- Supabase dashboard: Edge Functions, notify, Logs',
        '- App errors: select created_at, route, message from client_errors order by id desc limit 20;',
        '',
        'Checked ' || to_char(state.checked_until at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' to ' || to_char(check_until at time zone 'UTC', 'HH24:MI') || ' UTC.'
      )
    );
  end if;

  update public.health_state set
    checked_until = check_until,
    checked_at = now(),
    stalled_alerted_at = case when stalled then now() else stalled_alerted_at end,
    backup_alerted_at = case when backup_late then now() else backup_alerted_at end,
    last_email_request = coalesce(request, last_email_request),
    last_email_at = case when request is not null then now() else last_email_at end
  where id;

  perform public.prune_logs();

  return lines;
end;
$$;

revoke execute on function public.health_check() from public, anon, authenticated;
