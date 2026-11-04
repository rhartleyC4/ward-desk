-- For a youth (under 18) the executive secretary texts a parent on the youth's behalf, so an
-- appointment can be marked as a youth's, with the parent's name for the greeting, and each
-- message template says who it's written to.

alter table public.interviews
  add column is_youth boolean not null default false,
  add column parent_name text;

-- Youth interviews are with youth.
update public.interviews set is_youth = true where purpose = 'youth';

create type public.message_audience as enum ('member', 'parent');

alter table public.message_templates add column audience public.message_audience not null default 'member';

insert into public.message_templates (name, kind, audience, body, created_by) values
  ('Offer times to a parent', 'offer', 'parent', E'Hi {parent_name}, {leader} would like to meet with {first_name} for about {length}. Would one of these times work?\n{times}\nThanks, {my_name}', null),
  ('Confirm time with a parent', 'confirm', 'parent', E'Hi {parent_name}, {first_name} is set to meet with {leader} on {time}. Thanks, {my_name}', null);
