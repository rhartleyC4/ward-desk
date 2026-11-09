-- Alert emails went out from a fixed warddesk.app address, which a ward running its own fork
-- can't send from with its own Resend account. npm run alerts:setup now saves the sender in Vault
-- (alert_from). Projects set up before this keep the old address until it's run again.

create or replace function public.send_alert(subject text, body text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  resend_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key');
  alert_to text := (select decrypted_secret from vault.decrypted_secrets where name = 'alert_email');
  label text := coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'alert_label'), 'Ward Desk');
  sender text := coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'alert_from'), 'Ward Desk <noreply@warddesk.app>');
begin
  if resend_key is null or alert_to is null then
    return null;
  end if;
  return net.http_post(
    url := 'https://api.resend.com/emails',
    body := jsonb_build_object(
      'from', sender,
      'to', to_jsonb(string_to_array(replace(alert_to, ' ', ''), ',')),
      'subject', label || ': ' || send_alert.subject,
      'text', send_alert.body
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || resend_key),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke execute on function public.send_alert(text, text) from public, anon, authenticated;

comment on function public.send_alert(text, text) is 'Emails the alert address (Vault alert_email) through Resend, from Vault alert_from. Null when alerts aren''t set up.';
