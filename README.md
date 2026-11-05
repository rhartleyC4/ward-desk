# Ward Desk

A mobile-first web app (PWA) for managing ward administration in one place: callings (proposing names, discussion, appointments) and sacrament meeting planning (conducting assignments, speakers, talks).

> Contains no member data in this repo. All data lives in Supabase. Keep this repo **private**.

## Modules

**Callings**
- Propose and discuss names for a calling, right on the bishopric meeting agenda
- Assign the bishop or a counselor to meet with each approved name
- Executive secretaries schedule those appointments for the leaders they cover

**Meetings**
- Conducting assignments by date
- Speakers, topics, and talk assignments
- Reminders to the people assigned

Both modules share the same users, roles, notifications, and calendar.

**Layout.** The tab bar (at the bottom on phones, the top on wider screens) holds only everyday work: Home, Meetings (each meeting's agenda), Sacrament and Appointments. Everything set up once lives in **Settings**, opened from the initials button at the top right, and grouped into You, Appointments, Meetings and Ward (`settingsFor` in `src/lib/access.ts`). Each person sees only the settings their role can change. Until someone has finished the one-time steps that apply to them (appointment hours, Face ID, the day-ahead summary), a "Finish setting up" card shows on Home, a red dot shows on the initials, and the checklist sits at the top of Settings (`src/lib/setup.ts`).

## Stack

- **Frontend:** React + TypeScript PWA built with Vite and [MUI](https://mui.com/), hosted on Cloudflare Pages. Light and dark themes follow the device by default; Appearance in Settings overrides it (see `src/theme.ts`)
- **Backend:** Supabase (Postgres, Auth, Realtime, Edge Functions)
- **Auth:** Google sign-in and email magic links, invite-only via an allowlist table
- **Notifications:** Web Push (VAPID), sent by a scheduled GitHub Actions job (`scripts/notify`). See "Notifications" below

## Roles

Roles live in the `roles` table, not in Google. Access is enforced by Row Level Security (RLS) in the database, not just the UI. Calling proposals are confidential, so access to the Callings module is separate from access to Meetings.

| Role | Can do |
|------|--------|
| admin | Manage users, roles, settings |
| bishopric | The bishop, 1st and 2nd counselors, executive secretaries and ward clerk. View and decide on calling proposals, schedule appointments, manage meetings and their agendas |
| leader | Other called leaders. Submit name suggestions only; **cannot** see calling proposals |

Meeting agendas follow attendance, not roles. The bishopric sees every agenda. Anyone else sees only the meetings they're listed for in `agenda_attendees`, plus the shared prayer roll if one of those agendas shows it. A leader who attends ward council can read and edit the ward council agenda, but still can't see appointments or callings.

Each bishopric member's profile also has an `office` (bishop, first or second counselor, executive secretary, assistant executive secretary, ward clerk) that only an admin can set. The Conducting and "Meets with" pickers list only the bishop and counselors.

Who schedules appointments for whom lives in `secretary_assignments`, set in **Settings › Who books for whom**. The executive and assistant executive secretaries can be picked, and a leader can have more than one. Each secretary's list starts with the leaders they cover. A leader no one has been picked for falls to the executive secretary when there's only one, so a ward with a single secretary needs no setup, and that page just says so until there's an assistant to share the leaders with.

The bishop and counselors keep appointment hours in **Settings › Appointment hours**: usual weekly blocks (`availability`) plus single dates that differ (`availability_changes`), either different hours or not available at all. Away dates take a whole day out on top of that. A bishop or counselor who hasn't set usual hours lands there at sign-in, where two short steps ask which days, then what times. Anyone in the bishopric can read and change everyone's hours, so a secretary can take out a day when a leader says he can't make it.

Each appointment has a length (`interviews.duration_minutes`): 10 minutes unless the secretary changes it, in 5-minute steps, with at least 10 for a temple recommend interview. Open times (`src/lib/slots.ts`) fill each block of hours one appointment after another and start the next one right after whatever is booked ends, so lengthening or shortening a booking moves the open times around it.

The bishopric keeps the standing schedule in **Settings › Standing schedule**: regular meetings (`recurring_events`, every week or one week of the month, with an optional time), rotations (`rotations`) and each member's assignments (`stewardships`). A rotation is due in the months ticked and either falls on a set day ("3rd Sunday", `weekday` + `week_of_month`) or runs any time that month. It reminds whoever has the turn (`assignee_id`); one that names someone outside the app (`assignee_label`, like "EQ President") reminds the whole bishopric. Home shows a set-day rotation on its day and lists the month's under **This month**, for the bishop, counselors and secretaries alike. Assignments are picked from the calling list's organizations (or typed in for anything else). When a name is marked Approved, "Meets with" fills in with the bishop or counselor assigned to that calling's organization, unless someone already meets with them, the calling isn't on the list, or two leaders share the organization. The secretaries' Home has a folded **Who covers what** card listing each leader's areas.

New appointments start at the usual length for their kind (`appointment_lengths`, one row per purpose, all 10 minutes to begin with), which the bishopric sets under **Usual lengths** on Home.

The executive and assistant executive secretaries land on **Home**, "Your week": who needs an appointment with the leaders they schedule for, with open times by day at the chosen length and a button to book one; what's booked, with the length adjustable and a warning when one runs into the next; and each leader's hours for the next seven days. A secretary not yet assigned to any leader sees everyone.

To reach someone, the secretary picks a few open times and writes a message from a template (`message_templates`, shared by the bishopric and edited on Home). Templates use variables such as `{first_name}`, `{leader}`, `{length}`, `{times}` and `{time}`, and should stay general rather than say what the appointment is for. Wording in braces with a bar, like `{this time|one of these times}`, uses the first part when one time is offered and the second when there are more; a single time is written without a bullet. **Copy** puts the text on the clipboard; **Open Messages** opens the phone's messaging app with the text filled in and no recipient, so no phone numbers are stored. Sending records `offered_at` and `offered_times`, so the list shows when times went out and the picker marks them when the reply comes in. Offered times are held for three days: no one else's picker offers them until that person is booked, the secretary presses **Release**, or the three days pass. Booked appointments have a confirmation message too.

For a youth under 18 the secretary texts a parent instead. Ticking "Youth under 18" on an appointment (`interviews.is_youth`, set automatically for youth interviews) and entering the parent's name (`parent_name`) switches its messages to the templates written to a parent (`message_templates.audience = 'parent'`), where `{parent_name}` greets the parent and `{first_name}` is the youth's. Only the parent's name is kept, never a birthdate or phone number.

Adjust these as the real needs become clear.

## Notifications

Bishopric members can turn on a **day-ahead summary** for each device on the Account page (Settings, then their name at the top). The evening before, it lists that person's next day:

- The standing meetings on the **Schedule** page (`recurring_events`) that fall on that day, with their times
- Their rotations: one with a set day on that day, and on the 1st of the month "This month: …" for each one due any time that month. Only the title is sent, never the label naming who it's with, so keep titles general
- Conducting sacrament meeting, when they're down to conduct, with how many releases and sustainings there are to read
- Their own booked appointments: how many, from the first start to the last end
- For a secretary, the appointments booked for the leaders they schedule for
- A note when they're marked away that day

Notifications show on lock screens, so the text says when and how many, never who or what an appointment is for. Nothing is sent for a day with nothing on it. The lines are built by `src/lib/daySummary.ts`.

Each device's push subscription lives in `push_subscriptions` (saved through `save_push_subscription`, so whoever turns it on last on a shared device owns it). `notification_log` records each person and day sent, so a rerun never sends twice. The workflow `.github/workflows/notify.yml` runs every evening, hourly from 00:07 to 04:07 UTC. `npm run notify -- --scheduled` sends only between 6 and 10 PM ward time, so the first run in that window sends and the rest find it already sent. Push services that report a device gone (404 or 410) get it removed.

On iPhone, notifications only work from the Home Screen app (see "iPhone users"). The service worker that shows them is only in a built app, so locally use `npm run build && npm run preview`, not `npm run dev`.

**Trying it locally:** `npm run db:env` writes a VAPID key pair for this machine into `.env`. Build and preview the app, sign in as a bishopric account, turn the summary on from the Account page, then:

```bash
npm run notify -- --date 2026-11-08 --dry-run
```

```bash
npm run notify -- --date 2026-11-08 --only bishop@ward.test --force
```

The first shows what everyone would get; the second sends it to one account. **Show a test** on the Account page checks that the device can display a notification without sending anything.

**Trying it on staging or production:** Actions → "Day-ahead summaries" → Run workflow, on `main` for staging or `production` for production. It's a dry run unless you untick that box; set a date and your own email to send yourself one.

## How it replaces the Google Sheet

| Sheet tab | In the app |
|-----------|------------|
| Sacrament | **Sacrament** page (`meetings`, `program_items`) |
| Bishopric Schedule | **Schedule** page (`recurring_events`, `rotations`, `stewardships`) |
| Travel | **Away** page (`absences`). Warns when whoever is conducting is away |
| Weekly agenda tab (copied every Sunday) | **Meetings** tab, assembled live. Upcoming sacrament meetings, callings, releases, and sustainings fill in automatically. Discussion and calendar items carry forward until marked done. |
| Ward council agenda sheet | **Meetings** tab, Ward Council tab. Same idea: the prayer roll and assignments fill in, and each organization's items carry forward until marked done. |
| Callings Needed table | The callings section of the bishopric agenda on **Meetings** (`calling_needs`, `calling_candidates`). The bishopric adds callings and names, changes statuses, and picks who meets with each approved name. Marking a name Accepted sets the sustaining and the release for that Sunday (or the coming one), marks the appointment met, and from that Sunday on the calling shows under "Sustainings today" and "Releases today" instead of in the callings list. The bishopric can move either date from those sections |
| Interviews kept by the executive secretary | **Appointments** page (`interviews`, `secretary_assignments`). Approved names arrive without a time; the secretary who covers that leader books them |

## Setup

Requirements: Node 24+ (`nvm use` reads `.nvmrc`) and Docker (OrbStack or Docker Desktop) for local Supabase.

1. `npm install`
2. `npm run db:start` starts local Supabase and applies `supabase/migrations` and `supabase/seed.sql`
3. `npm run db:env` writes `.env` pointing at local Supabase
4. `npm run dev` and open http://localhost:5173

Sign in locally with a seeded fake account (`bishop@`, `first@`, `second@`, `secretary@`, `clerk@`, or `leader@ward.test`). Either open the magic link in Mailpit at http://127.0.0.1:54324, or enter the practice password from `supabase/seed.sql`. Supabase Studio is at http://127.0.0.1:54323.

After changing the schema, add a new migration (`npx supabase migration new <name>`), then run `npm run db:reset` and `npm run db:types`.

Never commit `.env`. See `.env.example`. Secrets needed for a hosted deployment:

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (safe for the frontend)
- `SUPABASE_SERVICE_ROLE_KEY` (server only, never in the frontend)
- `VITE_VAPID_PUBLIC_KEY` (frontend) and `VAPID_PRIVATE_KEY` (the notification job only). `npm run db:env` makes a local pair
- Google OAuth client ID and secret (stored in Supabase Auth settings; set `VITE_ENABLE_GOOGLE=true` once configured)

## Tests

| Command | What it covers | Needs local Supabase |
|---------|----------------|----------------------|
| `npm test` | Unit and component tests (Vitest + Testing Library): dates, schedule rules, agenda assembly, role-based navigation, auth loading, forms | No |
| `npm run test:db` | pgTAP tests in `supabase/tests/database`. Every RLS rule, checked as each role | Yes |
| `npm run test:integration` | Signs in as each seeded role and runs the app's real queries (`src/lib/queries.ts`) against the local API, and runs the notification sender against the local database with a fake push service | Yes |
| `npm run test:all` | All of the above | Yes |

Integration tests refuse to run against anything but a local Supabase. They clean up the rows they create.

## Deploying

There are two hosted copies of the app. Each has its own Supabase project and Cloudflare Pages project.

| | Training site (staging) | Real site (production) |
|---|---|---|
| URL | https://gp7-training.warddesk.app | https://gp7.warddesk.app |
| Deploys from | `main`, after CI passes | `production`, after CI passes |
| Data | Invented practice data from `supabase/seed.sql` | Real ward data. Never copy it to staging |
| Extras | "Training site" banner, practice-account sign-in | None |

**Promoting** sends the code and migrations from staging to production. Data is never copied. After trying a change on staging:

```bash
git push origin main:production
```

The deploy job refuses any `production` commit that isn't already on `main`. Each deploy applies migrations (`supabase db push`) and then publishes the frontend, so **a migration must keep working with the frontend that is still live**. Add columns before using them, and remove them only after nothing uses them.

**Resetting the training site:** Actions → "Reset training site" → Run workflow, then type `reset staging`. This wipes staging and reloads the seed data, then re-adds everyone in the staging variable `STAGING_ADMIN_EMAILS` (comma-separated) as admin and bishopric. Real addresses live there rather than in `seed.sql`. Run it once after the first staging deploy, since `db push` doesn't load the seed. Trainees sign in with a seeded `@ward.test` email and the password from `seed.sql`.

### One-time setup

1. **Supabase:** create `ward-desk-staging` and `ward-desk-prod` in the same region. Leave Data API and "Automatically expose new tables" on, since the migrations rely on the default grants, and turn on automatic RLS. For each project, note the project ref and anon (publishable) key. Also copy the **Session pooler** connection string (Connect, in the top bar) with the database password filled in. Percent-encode any symbols in the password, or use a password that's letters and digits only. Don't use the direct connection, because on the free plan it's IPv6-only and GitHub's runners can't reach it. No Supabase access token is needed: it would grant access to every project you own.
2. **Supabase Auth**, in each project:
   - Under URL Configuration, set the site URL to that environment's URL and add it to the redirect URLs.
   - Under Emails → SMTP Settings, connect Resend. The built-in sender only reaches project team members. In Resend, add the domain `gp7.warddesk.app` and let it auto-configure the Cloudflare DNS records. Then either use Integrations → Supabase, or enter host `smtp.resend.com`, port `465`, username `resend`, and a sending-only API key (one key per project) with sender `noreply@warddesk.app`.
   - Under Emails → Templates, keep the email wording generic, with no names.
   - Google sign-in is optional and can wait. See "Google sign-in" below.
3. **Cloudflare Pages:** create two Direct Upload projects:
   ```bash
   npx wrangler pages project create ward-desk-staging --production-branch main
   ```
   ```bash
   npx wrangler pages project create ward-desk --production-branch production
   ```
   Under Custom domains, add `gp7-training.warddesk.app` to the staging project and `gp7.warddesk.app` to the other. Create a custom API token (or an account-owned token under Manage Account → Account API Tokens, which survives a handoff). Give it only **Account → Cloudflare Pages → Edit** on your account, with no zone permissions and no IP filtering.
4. **GitHub** (Settings → Secrets and variables → Actions, and Settings → Environments):

   | Where | Secrets | Variables |
   |---|---|---|
   | Repository | `CLOUDFLARE_API_TOKEN` | `CLOUDFLARE_ACCOUNT_ID`, `DEPLOY_ENABLED` = `true` (set this last) |
   | Environment `staging` | `SUPABASE_DB_URL` (session pooler string), `VAPID_PRIVATE_KEY` | `SUPABASE_PROJECT_REF`, `SUPABASE_ANON_KEY`, `CLOUDFLARE_PAGES_PROJECT` = `ward-desk-staging`, `WARD_TIME_ZONE`, `ENABLE_GOOGLE`, `VAPID_PUBLIC_KEY` |
   | Environment `production` | `SUPABASE_DB_URL`, `VAPID_PRIVATE_KEY` | Same as staging, with `CLOUDFLARE_PAGES_PROJECT` = `ward-desk` |

   Limit the `production` environment to the `production` branch under Deployment branches.
5. Push to `main`, then run "Reset training site". Then promote to production.
6. Add yourself to production **before** your first sign-in, since sign-in is refused for any email not on the allowlist. Run this in the production project's SQL editor, then sign in. For staging, add your address to `STAGING_ADMIN_EMAILS` instead, so it survives resets:
   ```sql
   insert into public.allowlist (email, initial_roles) values ('you@example.com', '{admin,bishopric}');
   ```

### Google sign-in

Optional. Email links work without it, but Google sign-in means most people never wait for an email. One OAuth client serves both environments.

1. **Google Cloud project:** at console.cloud.google.com, create a project named `Ward Desk` while signed in with a personal `@gmail.com` account, so the project has "No organization". Don't use a Workspace account (such as one on warddesk.app), because the project would land inside that domain's organization, which can block adding outside owners. No billing account is needed. Add a second Owner early (IAM → Grant access → role Owner) so access doesn't depend on one person.
2. **Branding and audience** (Google Auth Platform, formerly "OAuth consent screen"):
   - App name `Ward Desk`, with your support and developer contact email.
   - Audience **External**, since ward members use their own Google accounts, not warddesk.app ones.
   - Authorized domains: `warddesk.app` and `supabase.co`.
   - Data access: only `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. These basic scopes don't need Google's app verification.
   - **Publish the app** (Audience → Publish app). While it is in "Testing", only listed test users can sign in, and their sign-ins expire after 7 days.
3. **OAuth client** (Clients → Create client → Web application):
   - Authorized JavaScript origins: `https://gp7.warddesk.app` and `https://gp7-training.warddesk.app`.
   - Authorized redirect URIs: `https://<prod-ref>.supabase.co/auth/v1/callback` and `https://<staging-ref>.supabase.co/auth/v1/callback`.
   - Copy the client ID and client secret.
4. **Supabase**, in each project: Authentication → Sign In / Providers → Google. Enable it and paste the client ID and secret.
5. **GitHub:** set the `ENABLE_GOOGLE` variable to `true` in both environments, then re-run the latest deploy for each. The button only appears in a fresh build, because the setting is read at build time.

The allowlist still applies. A Google account whose email isn't on the allowlist is refused, and the same address can sign in with either Google or an email link. Google's sign-in screen says "continue to `<ref>.supabase.co`". Showing your own domain there needs Supabase's paid custom-domain add-on.

### Notifications

1. Make a VAPID key pair for each environment. Keep the two separate, so a staging key can't send to production devices:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. In each GitHub environment, set the variable `VAPID_PUBLIC_KEY` to the public key and the secret `VAPID_PRIVATE_KEY` to the private one. Optionally set `VAPID_SUBJECT` (defaults to `mailto:noreply@warddesk.app`); push services use it to reach you about problems.
3. Re-run the latest deploy for each environment. The app reads the public key at build time, so the Account page only offers notifications after a fresh build.
4. Set the repository variable `NOTIFY_ENABLED` to `true`. Until then the nightly job does nothing. Production's nightly run starts only once `notify.yml` is on the `production` branch.

Changing a key pair later signs every device out of notifications; each person turns them on again.

### Face ID and fingerprint sign-in (passkeys)

After someone signs in once with an email link or Google, the app offers to "Turn on" Face ID or fingerprint sign-in for that device. After that, they tap **Face ID or fingerprint** on the sign-in screen and skip the email. This matters most on iPhone: an email link opens in Safari, not in the Home Screen app, so a link sign-in never reaches the installed app, but a passkey sign-in happens inside it. Each person can see and remove their devices on the Account page (Settings, then their name at the top). Passkeys sync through iCloud Keychain or Google Password Manager, so a new phone usually has them already.

Turn passkeys on in each Supabase project's Auth settings, with that site's own domain. A passkey only works on the domain it was made for, so staging and production passkeys are separate:

| Setting | Staging | Production |
|---|---|---|
| Passkeys | Enabled | Enabled |
| Relying party ID | `gp7-training.warddesk.app` | `gp7.warddesk.app` |
| Origins | `https://gp7-training.warddesk.app` | `https://gp7.warddesk.app` |
| Display name | `Ward Desk` | `Ward Desk` |

Locally, `supabase/config.toml` already turns them on for `localhost`. Open the app at `http://localhost:5173` (not `127.0.0.1`) to try them. Passkeys only work on HTTPS or localhost, so a phone on your local network can't test them; use staging. The allowlist still applies, since only someone already signed in can add a passkey.

## Handoff checklist

Do these in order when passing the app to a successor:

1. Add the successor to the `roles` table as **admin**
2. Transfer or share the **Supabase** organization/project ownership
3. Add them as Owner on the **Google Cloud** project (IAM → Grant access) and have them accept. Change the consent screen's support and developer contact email to theirs, then remove yourself. Or have them create new OAuth credentials and update Supabase Auth
4. Transfer the **Cloudflare** Pages projects and the **GitHub** repo
5. Invite them to the **Resend** team (Settings → Team) and make them owner
6. Move the **domain**. `gp7.warddesk.app` and `gp7-training.warddesk.app` live on a personal domain, so either keep those DNS records in place for them or point the Pages projects and Resend at a domain they control. Then update each Supabase project's site URL and redirect URLs, the SMTP sender, and the Google OAuth origins
7. Hand over secrets securely (password manager, not email or chat)
8. Confirm the successor can sign in, see the right data, and receive a test notification and sign-in email
9. Remove your own admin access once they confirm

## Agenda templates

Each meeting with an agenda is a row in `agenda_templates`: its name, URL slug, and when it meets (weekday, plus which weeks of the month, or every week). Its layout is an ordered list of rows in `agenda_sections`. Each section has a title and a kind:

| Kind | Shows |
|------|-------|
| `items` | Open items for that section, carried forward until marked done |
| `calendar` | Dated items, dropped once the date passes |
| `assignments` | Rotations due this month |
| `sacrament` | Upcoming sacrament meetings |
| `callings` | Callings to fill, names to consider and who meets with them, all editable by the bishopric |
| `releases`, `sustainings` | From the callings section |
| `prayer_roll` | The prayer roll, shared by every agenda that shows it |
| `closing_prayer` | The closing prayer from the agenda header |

Callings stay confidential: that section shows nothing to attendees outside the bishopric. Interviews and appointments aren't on any agenda; they live on the **Appointments** page. (The old `interviews` section kind is still in the enum but the database refuses it.)

Manage them on the **Meetings** page. Anyone in the bishopric role (the bishop, counselors, executive secretary and ward clerk) and admins can use it; leaders can't. There you can:

- create a meeting and set its day, weeks of the month and time
- add sections, rename them, move them up or down, and remove them
- choose who attends besides the bishopric

The database enforces the same rule (`can_manage_meetings()`), plus two safeguards:

- A section can only be removed once all its items are marked done. Its finished items are removed with it.
- A meeting can only be deleted if it has never had an agenda or item. The bishopric meeting can never be deleted.

A section's kind can't be changed after it's added. Add a new section and remove the old one instead.

## Maintenance notes

- **Free-tier pause:** Supabase free projects pause after about a week of inactivity. A scheduled ping keeps it awake. If it pauses, restore it from the Supabase dashboard.
- **Backups:** The free tier may not include automatic backups. Export the database on a regular schedule to a private location.
- **Dead push subscriptions:** The notification job deletes subscriptions that return 404 or 410.
- **Privacy:** Notification text stays generic, with no names. Keep data retention minimal, and remove proposals once decisions are final.
- **Branding:** Don't use the church's name or logos in the app. Check the church's guidance on third-party tools before sharing widely.

## iPhone users

Push notifications require adding the app to the Home Screen first (iOS 16.4 or later): open in Safari, tap Share, then **Add to Home Screen**, then enable notifications from inside the app.
