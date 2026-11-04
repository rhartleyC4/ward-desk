-- Many wards have an assistant executive secretary who shares the scheduling. Give them an office
-- so they get the secretary's home screen and can be given leaders to schedule for.
alter type public.bishopric_office add value if not exists 'assistant_executive_secretary' after 'executive_secretary';
