# Legal pages: sources and placeholders

`privacy.md` and `terms.md` are drafts for the owner's review, not legal advice. This file is for maintainers and is not a page on the site. Re-check the claims below whenever the app changes, and bump `lastUpdated` in both pages when either changes.

## Placeholders to fill before publishing

| Where | Placeholder |
|---|---|
| privacy.md, terms.md | `privacy@warddesk.app`: create the mailbox (or alias) or replace it |
| privacy.md, "How long data is kept" | Comment that `delegations`, `handovers` and `handover_seats` have no automatic deletion: remove once a purge rule exists, or keep the wording |
| terms.md, "Governing law" | `[STATE]` (and county if wanted) |

## Claims and where they come from

### Who, scope, affiliation

| Claim | Source |
|---|---|
| Hosted copies are gp7.warddesk.app (deploys from the `gp7` branch) and demo.warddesk.app (invented data) | README.md "Deploying" |
| Demo: invented data, practice accounts listed on the sign-in page, reset from time to time | `src/pages/LoginPage.tsx` (`PRACTICE_ACCOUNTS`), `supabase/seed.sql`, `.github/workflows/reset-staging.yml` |
| No connection to Church systems; nothing read from or sent to them | No such integration in `src/`, `supabase/functions/`, `scripts/` (LCR import was researched but not built) |
| Branding: no Church name or logos in the app | README.md "Maintenance notes" |

### Sign-in and invite-only

| Claim | Source |
|---|---|
| Invite-only via allowlist; unlisted emails refused | `supabase/migrations/20261101000000_initial_schema.sql` (`handle_new_user`) |
| Removing an address removes roles (and office); allowlist linked to the account by profile id | `20261108034742_profile_edits_and_allowlist_link.sql` (`sync_allowlist_roles`) |
| Profile keeps email and name (from Google `full_name`, else part of the email) | `20261101000000_initial_schema.sql` (`profiles`, `handle_new_user`) |
| Office and organization stored on the profile | `20261102050216_add_bishopric_office.sql`, `20261108060300_leader_organizations.sql` |
| Google sign-in uses only openid, email, profile scopes | README.md "Google sign-in" |
| Passkeys held by Supabase Auth | README.md "Face ID and fingerprint sign-in", `src/lib/passkeys.ts` |
| Sessions, IP, browser in sign-in records | Supabase Auth's own `auth` schema (`auth.sessions`, audit log); backed up per README.md "Backups and restore" |
| People can change their own name, nothing else; nobody signed in changes an email | `20261108034742_profile_edits_and_allowlist_link.sql`; Account page (commit 4b24790) |
| Admins delete accounts (not their own); profile and personal rows go; requests and other records stay as "Former member" | `20261108035016_delete_account.sql` (`delete_account`, `delete_person`) |
| Accounts deleted 180 days after losing every role (`profiles.removed_at`) | `20261108035016_delete_account.sql`, `20261108041724_purge_old_records.sql` |

### What's stored about members

| Claim | Source |
|---|---|
| Speakers, prayers (`program_items.person_name`, `meetings.invocation/benediction`) | `20261101000000_initial_schema.sql` |
| Calling candidates, release names, notes | `20261101000000_initial_schema.sql` (`calling_needs`, `calling_candidates`), `20261105035200_calling_requests.sql` |
| Appointments: name, purpose (incl. temple recommend, youth, tithing declaration), time, notes | `20261101000000_initial_schema.sql` (`interviews`) |
| Missed/report notes (max 500 chars) | `20261106044344_appointment_follow_up.sql` |
| Youth flag and parent name only; no birthdate or phone | `20261104035532_youth_parent_messages.sql`, README.md "Roles" |
| Prayer roll names | `20261101000000_initial_schema.sql` (`prayer_roll`) |
| No phone numbers stored; Messages opens with no recipient | README.md "Roles" (message templates paragraph) |
| Away dates, appointment hours | `absences` in initial schema; `20261104020812_appointment_hours.sql` |

### Who can see what (RLS)

| Claim | Source |
|---|---|
| Callings: bishopric only; leaders see a stage, not names | `20261101000000_initial_schema.sql` policies; `20261105035200_calling_requests.sql` (`my_calling_requests`) |
| Appointments: bishopric only | `bishopric manage interviews` policy, initial schema |
| Requests: sender and recipient; whole bishopric if both are bishopric | `20261105035000_requests.sql` |
| Agendas: bishopric plus listed attendees | `20261103025546_meeting_templates.sql`, README.md "Roles" |
| Sacrament plans, away dates, schedule readable by anyone with a role | `members read ...` policies, initial schema |
| Meeting assignments: attendees and the person asked; accept/decline with optional reply | `supabase/migrations/20261107145553_meeting_assignments.sql` |
| Error reports: admins only | `20261106222524_health_checks.sql` |

### Leadership changes and mentoring

| Claim | Source |
|---|---|
| Bishop (or admin) runs a bishopric handover; anyone in the bishopric (or admin) changes an organization leader | `20261108060400_leadership_changes.sql` (`run_handover`, `change_leader`) |
| Open work moves to successors; closed and past records stay | `20261108060400_leadership_changes.sql` (`move_leadership_work`) |
| Bishopric can add newcomers to the allowlist during a change | `20261108060400_leadership_changes.sql` |
| Mentoring up to 12 weeks; new bishop can extend, end, allow callings | `20261108060000_mentoring_delegations.sql` (`delegations_length`, column grants) |
| Mentor's actions recorded as the new bishop; only bishopric role carries over, never admin | `20261108060000_mentoring_delegations.sql` (`acting_as`), `20261108060100_record_acting_person.sql` |
| Calling discussions hidden from a mentor unless allowed | `20261108060200_mentor_callings.sql` (`can_see_callings`) |
| New bishop notified of mentor's appointment and away-date changes | `20261108060100_record_acting_person.sql` (`acted_by`), `src/lib/notices.ts` (`mentor_change`) |
| Handover records readable by bishopric and admins; delegations by mentor and mentored | RLS in the two migrations above |

### This website (warddesk.app)

| Claim | Source |
|---|---|
| No analytics, cookies or outside resources; theme choice in localStorage | No external `src`/`href` or analytics in `site/src`; `site/src/components/ThemeScript.astro`, `ThemeToggle.astro` |

### Notifications and email

| Claim | Source |
|---|---|
| Notification text has no names or details; office only (incl. meeting assignment notices) | README.md "Notifications"; `supabase/functions/push/plan.ts`; `src/lib/daySummary.ts` |
| Rotation titles are sent as typed (keep them general) | README.md "Notifications" |
| Push via browser push services (VAPID) | `public/push-handler.js`, `scripts/notify/deliver.ts`, `supabase/functions/push/index.ts` |
| Dead subscriptions deleted on 404/410; turning off deletes it | `scripts/notify/deliver.ts`, `supabase/functions/push/index.ts`, `deletePushSubscription` in `src/lib/queries.ts` |
| Notification mutes stored per person | `20261106210218_notification_choices.sql` |
| Sign-in email via Resend SMTP; wording kept generic | `supabase/config.toml` `[remotes.*.auth.email.smtp]`, README.md "One-time setup" |
| Alert emails: counts only, no names or error text | README.md "Health checks and alerts", `20261106222524_health_checks.sql` |

### Retention

| Claim | Source |
|---|---|
| Error reports: scrubbed message and stack, route without query, version, browser family/version/OS, signed in or not (no user id); deleted after 30 days | `src/lib/errorReport.ts` (`scrubText`), `20261108042339_anonymous_error_reports.sql` (`scrub_error_text`, `prune_logs`) |
| Outbox rows deleted 7 days after claimed | `scripts/notify/notices.ts` |
| `notification_log` and `push_events` deleted after 30 days | `20261108042115_delivery_log_retention.sql` (`prune_logs`) |
| Every keep period in the privacy policy's table; open work never purged | `20261108041724_purge_old_records.sql` (header table, `purge_old_records`), README.md "Data retention" |
| Handovers and delegations: no purge; names set null / rows cascade when an account is deleted | `20261108060000_mentoring_delegations.sql`, `20261108060400_leadership_changes.sql` |

### Backups

| Claim | Source |
|---|---|
| Nightly, age-encrypted, stored in Cloudflare R2; only owner holds the private key | `.github/workflows/backup.yml`, README.md "Backups and restore" |
| Includes `public`, `auth` rows, migrations | `.github/workflows/backup.yml` |
| Dailies 30 days, monthlies 90 days | `scripts/lib/backup-retention.mjs`, applied by `npm run backup:lifecycle`, checked by `env:check` (commit ff337d8) |
| Nothing unencrypted stored on GitHub | `.github/workflows/backup.yml` (no artifacts; local file removed) |

### Device storage

| Claim | Source |
|---|---|
| Session token in localStorage | `src/lib/supabase.ts` (supabase-js default storage) |
| Theme choice | `src/theme.ts` (MUI color scheme) |
| Install hint dismissed | `src/components/InstallPrompt.tsx` |
| Passkey choice per device | `src/lib/passkeys.ts` |
| Demo banner hidden (sessionStorage) | `src/components/EnvironmentBanner.tsx` |
| Service worker caches app files | `vite.config.ts` (vite-plugin-pwa / Workbox) |
| No analytics in the app | No analytics library in `package.json` or `src/` |

### Providers

| Provider | Source |
|---|---|
| Supabase | README.md "Stack" |
| Cloudflare Pages, DNS, R2 | README.md "Stack", "Deploying", "Backups and restore" |
| Resend | README.md "One-time setup", `supabase/config.toml` |
| Google (optional) | README.md "Google sign-in" |
| GitHub Actions | `.github/workflows/*.yml` |
| Push services | Web Push standard; endpoint set by the browser |
