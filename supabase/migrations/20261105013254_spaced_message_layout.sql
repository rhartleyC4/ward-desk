-- Space out the default templates: greeting, request, times and sign-off each get their own
-- paragraph so a message reads well as an email and still looks right as a text. Only templates
-- no one has edited are changed.

update public.message_templates
set body = E'Hi {first_name},\n\n{leader} would like to meet with you for about {length}. Would {this time|one of these times} work?\n\n{times}\n\nThanks,\n{my_name}',
    updated_at = now()
where created_by is null and kind = 'offer' and audience = 'member'
  and body = E'Hi {first_name}, {leader} would like to meet with you for about {length}. Would {this time|one of these times} work?\n{times}\nThanks, {my_name}';

update public.message_templates
set body = E'Hi {parent_name},\n\n{leader} would like to meet with {first_name} for about {length}. Would {this time|one of these times} work?\n\n{times}\n\nThanks,\n{my_name}',
    updated_at = now()
where created_by is null and kind = 'offer' and audience = 'parent'
  and body = E'Hi {parent_name}, {leader} would like to meet with {first_name} for about {length}. Would {this time|one of these times} work?\n{times}\nThanks, {my_name}';

update public.message_templates
set body = E'Hi {first_name},\n\nYou''re set to meet with {leader} on {time}.\n\nThanks,\n{my_name}',
    updated_at = now()
where created_by is null and kind = 'confirm' and audience = 'member'
  and body = E'Hi {first_name}, you''re set to meet with {leader} on {time}. Thanks, {my_name}';

update public.message_templates
set body = E'Hi {parent_name},\n\n{first_name} is set to meet with {leader} on {time}.\n\nThanks,\n{my_name}',
    updated_at = now()
where created_by is null and kind = 'confirm' and audience = 'parent'
  and body = E'Hi {parent_name}, {first_name} is set to meet with {leader} on {time}. Thanks, {my_name}';
