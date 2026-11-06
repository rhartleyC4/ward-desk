-- short_sunday: away dates that leave a Sunday with only one of the bishop and counselors, or none,
-- tell the rest of the bishopric. It comes from the 'away' rows already in notification_outbox, so
-- the only change here is letting people turn it off.

alter table public.notification_mutes drop constraint notification_mutes_kind_check;
alter table public.notification_mutes
  add constraint notification_mutes_kind_check check (kind in (
    'request_sent', 'request_answered', 'request_due',
    'calling_request_sent', 'calling_request_received', 'calling_request_progress', 'callings_to_record',
    'day_summary', 'report_due', 'reminders',
    'appointment_to_book', 'appointment_sent_back', 'away_conflict',
    'appointment_booked', 'appointment_changed', 'appointment_handed_over',
    'short_sunday'
  ));
