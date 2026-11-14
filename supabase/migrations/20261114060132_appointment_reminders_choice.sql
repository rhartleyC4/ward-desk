-- Reminders replace the separate confirmation a secretary used to send right after booking. A
-- booked time now goes straight to the leader, and the person hears from the secretary the day
-- before. Some secretaries don't send reminders at all, so each one chooses: with this off, their
-- Home and the day-before notification leave appointment reminders out. Meeting reminders are
-- assigned per meeting in the standing schedule, so they aren't affected.
--
-- interviews.confirmed_at stays for now, since the frontend already live still writes it.

alter table public.profiles add column sends_reminders boolean not null default true;

comment on column public.profiles.sends_reminders is
  'Whether this secretary reminds people of their appointments the day before. Off hides appointment reminders on their Home and in the day-before notification.';

grant update (sends_reminders) on public.profiles to authenticated;
