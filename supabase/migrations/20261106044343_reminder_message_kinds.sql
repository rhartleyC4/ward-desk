-- Two more kinds of message: reminding someone the day before their appointment, and reminding
-- the people who attend a standing meeting. Added in their own migration because a new enum
-- value can't be used in the transaction that adds it; the next migration seeds templates.

alter type public.message_kind add value if not exists 'reminder';
alter type public.message_kind add value if not exists 'meeting';
