-- Templates can now word things for one time or several, as {this time|one of these times}.
-- Switch the two default offer templates over, but only where no one has edited them.

update public.message_templates
set body = E'Hi {first_name}, {leader} would like to meet with you for about {length}. Would {this time|one of these times} work?\n{times}\nThanks, {my_name}',
    updated_at = now()
where created_by is null and kind = 'offer' and audience = 'member'
  and body = E'Hi {first_name}, {leader} would like to meet with you for about {length}. Would one of these times work?\n{times}\nThanks, {my_name}';

update public.message_templates
set body = E'Hi {parent_name}, {leader} would like to meet with {first_name} for about {length}. Would {this time|one of these times} work?\n{times}\nThanks, {my_name}',
    updated_at = now()
where created_by is null and kind = 'offer' and audience = 'parent'
  and body = E'Hi {parent_name}, {leader} would like to meet with {first_name} for about {length}. Would one of these times work?\n{times}\nThanks, {my_name}';
