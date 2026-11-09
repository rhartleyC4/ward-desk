-- The Sheets import creates accounts ahead of first sign-in, so having an account no longer means
-- someone has signed in. The Access page asks this instead; the app can't read auth.users.
-- Additive: a new function only.

create function public.accounts_not_signed_in()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u
  where u.last_sign_in_at is null and public.has_role('admin');
$$;

revoke execute on function public.accounts_not_signed_in() from public, anon;
grant execute on function public.accounts_not_signed_in() to authenticated;
