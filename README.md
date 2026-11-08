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

**Requests**
- The bishopric asks someone to do something. The person taps **Got it**, then **It's done** (or **I can't do this**), with an optional note. The sender sees each step, and a request unread after two days is flagged
- An agenda item can be handed to someone the same way, and shows who has it and where it stands
- Ward leaders ask for a calling change (fill a calling, release someone, both, or just suggest names). It goes onto the bishopric's callings list right away and to the bishop or counselor over that organization, who marks it received. The leader sees how far along it is (sent, received, being worked on, finished) but never names or decisions

All three modules share the same users, roles, notifications, and calendar.

**Layout.** The tab bar (at the bottom on phones, the top on wider screens) holds only everyday work: Home, Meetings (each meeting's agenda), Sacrament, Appointments and Requests. The Requests tab shows a count of what's waiting on you. Everything set up once lives in **Settings**, opened from the initials button at the top right, and grouped into You, Appointments, Meetings and Ward (`settingsFor` in `src/lib/access.ts`). Each person sees only the settings their role can change. Until someone has finished the one-time steps that apply to them (appointment hours, Face ID, the day-ahead summary), a "Finish setting up" card shows on Home, a red dot shows on the initials, and the checklist sits at the top of Settings (`src/lib/setup.ts`).

## Stack

- **Frontend:** React + TypeScript PWA built with Vite and [MUI](https://mui.com/), hosted on Cloudflare Pages. Light and dark themes follow the device by default; Appearance in Settings overrides it (see `src/theme.ts`)
- **Backend:** Supabase (Postgres, Auth, Realtime, Edge Functions)
- **Auth:** Google sign-in and email magic links, invite-only via an allowlist table
- **Notifications:** Web Push (VAPID). Day-ahead summaries come from a scheduled GitHub Actions job (`scripts/notify`); requests notify right away through a Supabase Edge Function (`supabase/functions/push`). See "Notifications" below

## Roles

Roles live in the `roles` table, not in Google. Access is enforced by Row Level Security (RLS) in the database, not just the UI. Calling proposals are confidential, so access to the Callings module is separate from access to Meetings.

| Role | Can do |
|------|--------|
| admin | Manage users, roles, settings |
| bishopric | The bishop, 1st and 2nd counselors, executive secretaries and ward clerk. View and decide on calling proposals, schedule appointments, manage meetings and their agendas |
| leader | Other called leaders. Send calling requests (with suggested names) and follow their own; answer requests sent to them. **Cannot** see calling proposals |

Requests are between the sender and the person asked. A request between two bishopric members is bishopric business, so the whole bishopric can read it (the bishopric agenda's **Follow-ups** section lists those still open and those finished in the past week). Only the bishopric sends requests. Calling requests are readable by the bishopric only; a leader follows their own through `my_calling_requests()`, which gives a stage, never names or decisions. A calling request goes to the bishop or counselor whose assignment on the Standing schedule names the calling's organization (`calling_request_recipients()`), and to the bishop when no one's does.

Meeting agendas follow attendance, not roles. The bishopric sees every agenda. Anyone else sees only the meetings they're listed for in `agenda_attendees`, plus the shared prayer roll if one of those agendas shows it. A leader who attends ward council can read and edit the ward council agenda, but still can't see appointments or callings.

Each bishopric member's profile also has an `office` (bishop, first or second counselor, executive secretary, assistant executive secretary, ward clerk) that only an admin can set. The Conducting and "Meets with" pickers list only the bishop and counselors.

Who schedules appointments for whom lives in `secretary_assignments`, set in **Settings › Who books for whom**. The executive and assistant executive secretaries can be picked, and a leader can have more than one. Each secretary's list starts with the leaders they cover. A leader no one has been picked for falls to the executive secretary when there's only one, so a ward with a single secretary needs no setup, and that page just says so until there's an assistant to share the leaders with.

The bishop and counselors keep appointment hours in **Settings › Appointment hours**: usual weekly blocks (`availability`) plus single dates that differ (`availability_changes`), either different hours or not available at all. Away dates take a whole day out on top of that. A bishop or counselor who hasn't set usual hours lands there at sign-in, where two short steps ask which days, then what times. Anyone in the bishopric can read and change everyone's hours, so a secretary can take out a day when a leader says he can't make it.

Each appointment has a length (`interviews.duration_minutes`): 10 minutes unless the secretary changes it, in 5-minute steps, with at least 10 for a temple recommend interview. Open times (`src/lib/slots.ts`) fill each block of hours one appointment after another and start the next one right after whatever is booked ends, so lengthening or shortening a booking moves the open times around it.

The bishopric keeps the standing schedule in **Settings › Standing schedule**: regular meetings (`recurring_events`, every week or one week of the month, with an optional time), rotations (`rotations`) and each member's assignments (`stewardships`). A rotation is due in the months ticked and either falls on a set day ("3rd Sunday", `weekday` + `week_of_month`) or runs any time that month. It reminds whoever has the turn (`assignee_id`); one that names someone outside the app (`assignee_label`, like "EQ President") reminds the whole bishopric. Home shows a set-day rotation on its day and lists the month's under **This month**, for the bishop, counselors and secretaries alike. Assignments are picked from the calling list's organizations (or typed in for anything else). When a name is marked Approved, "Meets with" fills in with the bishop or counselor assigned to that calling's organization, unless someone already meets with them, the calling isn't on the list, or two leaders share the organization. The secretaries' Home has a folded **Who covers what** card listing each leader's areas.

New appointments start at the usual length for their kind (`appointment_lengths`, one row per purpose, all 10 minutes to begin with), which the bishopric sets under **Usual lengths** on Home.

The executive and assistant executive secretaries land on **Home**, "Your week": tomorrow's reminders to send; who needs an appointment with the leaders they schedule for, with open times by day at the chosen length and a button to book one; booked times still **To confirm**, with the length adjustable and a warning when one runs into the next; and each leader's hours for the next seven days. A secretary not yet assigned to any leader sees everyone.

Once a booked time is confirmed (`interviews.confirmed_at`, set by sending the confirmation message or by **They already know**), it leaves the secretary's Home and belongs to the leader: it shows on their Home, and when it's over, under **How did these go?**. The leader marks it **Done** or **Didn't come**. For a missed one they either send it back to the secretary to **find a new time** (it returns to "Needs an appointment" marked with the date it was missed and the leader's note) or say **I'll take care of it** with a note, which closes it (`status = 'cancelled'`, `missed_at`, `report_note`). Moving a booked time clears its confirmation and reminder (a trigger), so the new time is confirmed and reminded too.

The day before, the secretary sends each person a reminder from a **Reminder the day before** template (`reminded_at`), and reminds everyone who attends a standing meeting they've been given in **Settings › Standing schedule** ("Who reminds people the day before", `recurring_events.reminder_by`) from a **Meeting reminder** template, which can use `{meeting}` and `{when}`. A meeting linked to its agenda ("Its agenda" in the same editor, `recurring_events.agenda_template_id`, filled in for meetings named like an agenda) can also name who is down on that day's agenda: `{opening_prayer}`, `{spiritual_thought}` and `{closing_prayer}` one at a time (to write to that person), or `{assignments}` for all of them, one per line (a line holding only `{assignments}` is dropped when no one is down yet). An assignment no one has shows as "(not assigned yet)", and the Reminders page warns about it with a link to fill it in on the agenda. Sent meeting reminders are kept in `meeting_reminders`. The **Reminders** page (`/reminders?date=…`) lists them with each message ready to copy, text or email.

To reach someone, the secretary picks a few open times and writes a message from a template (`message_templates`, shared by the bishopric and edited on Home). Templates use variables such as `{first_name}`, `{leader}`, `{length}`, `{times}` and `{time}`, and should stay general rather than say what the appointment is for. Wording in braces with a bar, like `{this time|one of these times}`, uses the first part when one time is offered and the second when there are more; a single time is written without a bullet. **Copy** puts the text on the clipboard; **Open Messages** opens the phone's messaging app with the text filled in and no recipient, so no phone numbers are stored. Sending records `offered_at` and `offered_times`, so the list shows when times went out and the picker marks them when the reply comes in. Offered times are held for three days: no one else's picker offers them until that person is booked, the secretary presses **Release**, or the three days pass. Booked appointments have a confirmation message too.

For a youth under 18 the secretary texts a parent instead. Ticking "Youth under 18" on an appointment (`interviews.is_youth`, set automatically for youth interviews) and entering the parent's name (`parent_name`) switches its messages to the templates written to a parent (`message_templates.audience = 'parent'`), where `{parent_name}` greets the parent and `{first_name}` is the youth's. Only the parent's name is kept, never a birthdate or phone number.

Adjust these as the real needs become clear.

## Notifications

Anyone with a role turns on notifications for each device on the Account page (Settings, then their name at the top). Below that, a switch for each kind they could be sent lets them turn any of it off; the choice is per person, so it applies on every device. Everything starts on. Turned-off kinds are stored in `notification_mutes`, and every sender skips them. The list of kinds, and who sees which switch, is in `src/lib/notifications.ts`.

Besides the instant ones for requests (below), these are sent:

- **How did your appointments go?** to a bishop or counselor, half an hour after their last appointment of the day ends, if any are still unreported. Opens Home.
- **Reminders for tomorrow** to a secretary, from 10 AM the day before, when appointments they schedule (or meetings they remind people about) still need a reminder. Opens the Reminders page. A leader no secretary covers counts for every secretary.
- The **day-ahead summary**, in the evening (6 to 10 PM ward time), described below.
- **Requests due tomorrow** to the person asked, from 10 AM the day before, when it isn't done.
- **Callings to record** to the ward clerk, Sunday from 1 PM: how many callings were sustained and people released that day, so the church's records can be updated.
- **Calling request progress** to the ward leader who asked, in the daytime: when the bishopric starts on it, and when it's finished (`push_events` keeps each to once).
- **Appointment changes**, as they happen:
  - To the secretaries who book for that leader: a new appointment to book (added, or handed to that leader), a missed one sent back for a new time, and away dates that cover appointments already booked.
  - To the leader: one booked for today, or for tomorrow after tomorrow's summary went out, one moved or cancelled, and one handed to them.
  - To the whole bishopric: away dates that leave a Sunday with none of the bishop and counselors at church ("No bishopric on Sunday"), or only one of them ("Short-handed Sunday", naming which one by office). The Away page and bishopric Home show the same warning in the app.
  - Nobody hears about their own change. Triggers on `interviews` and `absences` write each change to `notification_outbox` and ask the `notify` function to run straight away; the 10-minute run picks up anything that call missed. Who hears what is in `src/lib/notices.ts`. Changes made as the database owner (seed, imports) notify no one.

The scheduled ones go once per person and day (`notification_log`), and only when there's something to do. The timing and text are in `src/lib/followUp.ts` and `scripts/notify/`.

The **day-ahead summary** lists that person's next day:

- The standing meetings on the **Schedule** page (`recurring_events`) that fall on that day, with their times
- Their rotations: one with a set day on that day, and on the 1st of the month "This month: …" for each one due any time that month. Only the title is sent, never the label naming who it's with, so keep titles general
- Conducting sacrament meeting, when they're down to conduct, with how many releases and sustainings there are to read
- Their own booked appointments: how many, from the first start to the last end
- For a secretary, the appointments booked for the leaders they schedule for
- A note when they're marked away that day
- How many requests are due that day or still unopened, and calling requests waiting to be marked received

Notifications show on lock screens, so the text says when and how many, never who or what an appointment is for. Nothing is sent for a day with nothing on it. The lines are built by `src/lib/daySummary.ts`.

Each device's push subscription lives in `push_subscriptions` (saved through `save_push_subscription`, so whoever turns it on last on a shared device owns it). `notification_log` records each person, kind and day sent, so a rerun never sends twice. Push services that report a device gone (404 or 410) get it removed.

**How the schedule runs:** every 10 minutes, `pg_cron` in the database runs `public.call_notify()`, which posts to the `notify` Edge Function with a shared secret. The function runs `scripts/notify/tick.ts` (bundled into the function by `npm run functions:build`), which sends whatever is due at that moment in the ward's time zone. A run takes an advisory lock, so a run started by a change and the 10-minute one never send the same thing twice. Until the Vault secrets below are set, `call_notify()` does nothing, so local databases stay quiet.

On iPhone, notifications only work from the Home Screen app (see "iPhone users"). The service worker that shows them is only in a built app, so locally use `npm run build && npm run preview`, not `npm run dev`.

**Trying it locally:** `npm run db:env` writes a VAPID key pair for this machine into `.env`. Build and preview the app, sign in as a bishopric account, turn the summary on from the Account page, then:

```bash
npm run notify -- --date 2026-11-08 --dry-run
```

```bash
npm run notify -- --date 2026-11-08 --only bishop@ward.test --force
```

The first shows what everyone would get; the second sends it to one account. **Show a test** on the Account page checks that the device can display a notification without sending anything.

To see what the scheduled run would send at a given moment:

```bash
npm run notify -- --tick --now 2026-11-08T11:00:00-07:00 --dry-run
```

**Trying it on staging or production:** Actions → "Day-ahead summaries" → Run workflow, on `main` for staging or `production` for production. It's a dry run unless you untick that box; set a date and your own email to send yourself one, or tick "tick" to see everything due right now.

### Instant notifications for requests

When someone sends or answers a request, sends or receives a calling request, or gives out or answers a meeting assignment (a prayer or the spiritual thought on an agenda), the app calls the `push` Edge Function (`pushAbout` in `src/lib/queries.ts`). The function checks that the caller made that change in the last few minutes, records it in `push_events` so a repeat call sends nothing, and notifies the other person on each of their devices. Who gets what is in `supabase/functions/push/plan.ts`. The text names an office ("The bishop asked you to do something"), never a member or what was asked. If the function isn't deployed or fails, the request still goes through and shows in the app; only the notification is missed.

**Locally:** `npm run db:env` also writes `supabase/functions/.env` with this machine's key pair. Serve the function with:

```bash
npx supabase functions serve --env-file supabase/functions/.env
```

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

### Moving data to and from the sheets

Both are commands run by hand against a database (`SUPABASE_DB_URL` from `.env`, or `--db-url`). Neither is in the app.

- **Import** (one time): download each sheet as .xlsx, then `npm run import-sheets -- --bishopric <file> --ward-council <file>`. It's a dry run until you add `--apply`. See the top of `scripts/import-sheets/import.ts`.
- **Export**: `npm run export-sheets` writes `Bishopric Agendas <date>.xlsx` and `Ward Council Agenda <date>.xlsx` to `~/Downloads` (change it with `--out`), in the sheets' layout with the newest meeting tab first. It covers the last 2 months plus what's planned ahead. Change that with `--months 6`, `--since 2026-01-01` or `--all`. Upload the files to Google Drive to open them as sheets. The files hold member names and callings, so the command won't write them inside the repo.
  - Each meeting tab shows its items as they stood that day. Callings show their current status, since the app doesn't keep a history of status changes, and callings already filled don't appear on earlier tabs.

## Setup

Requirements: Docker (OrbStack or Docker Desktop) for local Supabase, and [nvm](https://github.com/nvm-sh/nvm). Run `nvm use` first, since it reads the Node version from `.nvmrc`. Then:

```bash
npm run setup
```

It checks Node and Docker, runs `npm install`, starts local Supabase (which applies `supabase/migrations` and `supabase/seed.sql`), asks for the ward name (shown in the header and as the installed app's name; Ward Desk if left blank), writes `.env` and `supabase/functions/.env`, and ends with `npm run env:check -- local`. Running it again is safe. Local Supabase is shared by every checkout and worktree on this machine, so if it's already running, `setup` leaves it as it is. Apply a new branch's migrations to it with `npx supabase migration up`.

Then run `npm run dev` and open http://localhost:5173.

Sign in locally with a seeded fake account (`bishop@`, `first@`, `second@`, `secretary@`, `clerk@`, or `leader@ward.test`). Either open the magic link in Mailpit at http://127.0.0.1:54324, or enter the practice password from `supabase/seed.sql`. Supabase Studio is at http://127.0.0.1:54323.

After changing the schema, add a new migration (`npx supabase migration new <name>`), then run `npm run db:reset` and `npm run db:types`.

Never commit `.env`. `.env.example` lists what goes in it. The hosted environments keep their settings in GitHub and Supabase instead, set by the commands under "Deploying".

## Site screenshots

`npm run screenshots` captures the app's screens from the seed data for the public site; see [scripts/screenshots/README.md](scripts/screenshots/README.md).

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
| URL | https://demo.warddesk.app | https://gp7.warddesk.app |
| Deploys from | `main`, after CI passes | `gp7`, after CI passes |
| Data | Invented practice data from `supabase/seed.sql` | Real ward data. Never copy it to staging |
| Extras | "Training site" banner, practice-account sign-in | None |

**Promoting** sends the code and migrations from staging to production. Data is never copied. After trying a change on staging:

```bash
git push origin main:gp7
```

The deploy job refuses any `production` commit that isn't already on `main`. Each deploy applies migrations (`supabase db push`) and then publishes the frontend, so **a migration must keep working with the frontend that is still live**. Add columns before using them, and remove them only after nothing uses them.

**Resetting the training site:** Actions → "Reset training site" → Run workflow, then type `reset staging`. This wipes staging and reloads the seed data, then re-adds everyone in the staging variable `STAGING_ADMIN_EMAILS` (comma-separated) as admin and bishopric. Real addresses live there rather than in `seed.sql`. Run it once after the first staging deploy, since `db push` doesn't load the seed. Trainees sign in with a seeded `@ward.test` email and the password from `seed.sql`.

### One-time setup

A few steps need a person in a dashboard. Do these first:

1. **Supabase:** create `ward-desk-staging` and `ward-desk-prod` in the same region. Leave Data API and "Automatically expose new tables" on, since the migrations rely on the default grants, and turn on automatic RLS. Use a database password of letters and digits only, since it goes into a connection URL.
2. **Resend:** add the domain `warddesk.app` and let it auto-configure the Cloudflare DNS records. Make one sending-only API key per project and keep both in your password manager. The built-in Supabase sender only reaches project team members.
3. **Supabase Auth, in each project's dashboard:**
   - Turn on passkeys with that site's relying party. See "Face ID and fingerprint sign-in (passkeys)" below. `supabase config push` can't set these.
   - Under Emails → Templates, keep the email wording generic, with no names.
4. **Cloudflare Pages:** create two Direct Upload projects:
   ```bash
   npx wrangler pages project create ward-desk-staging --production-branch main
   ```
   ```bash
   npx wrangler pages project create ward-desk --production-branch gp7
   ```
   Under Custom domains, add `demo.warddesk.app` to the staging project and `gp7.warddesk.app` to the other. Create a custom API token (or an account-owned token under Manage Account → Account API Tokens, which survives a handoff). Give it only **Account → Cloudflare Pages → Edit** on your account, with no zone permissions and no IP filtering.
5. **Google Cloud** (optional, can wait): see "Google sign-in" below.
6. **Supabase deploy bot:** CI redeploys the notify and push Edge Functions on every deploy, and that needs a Supabase access token. A token reaches every project its account can see, so never use your own. Sign up for a separate Supabase account (for example a `+deploy` alias of your email), invite it to the Ward Desk organization as a **Developer** (Organization settings → Team), and make sure that organization holds only the two Ward Desk projects. Signed in as the bot, create an access token (Account → Access Tokens) named `github-deploy`. Keep it in your password manager; `env:github` asks for it.

Then sign in to both CLIs once on your machine: `gh auth login` and `npx supabase login`, with your own account. Run each command for staging first, then production:

1. **`npm run env:github -- staging`** fills the GitHub environment, and any repository settings that are missing. It asks which Supabase project to use, reads the anon key from it, asks for the database password to build the session pooler URL (and tests it), asks for the deploy bot's access token (and checks it can see the project), sets the Pages project, ward name, time zone and Google flag, and makes a VAPID key pair if there isn't one. For production it also limits deploys to the `gp7` branch. It shows the changes and asks first, and prints a new VAPID private key once, for your password manager. `--dry-run` only shows what it would change.
2. **`npm run env:auth -- staging`** applies the Auth settings in `[remotes.staging]` of `supabase/config.toml`: site URL, redirect URLs, Resend SMTP and Google. It asks for the project's Resend key and the Google client secret (leave one blank to keep what's set), shows `supabase config diff`, and asks before `supabase config push`. `--diff` only shows the differences. `config push` sends every setting the file declares, so the remotes blocks restate the live values. Edit them there, never in the dashboard.
3. **Deploy.** The first time, once both environments are filled, turn deploys on with `gh variable set DEPLOY_ENABLED --body true`. Then push to `main` for staging and run "Reset training site" once, since `db push` doesn't load the seed. For production, promote with `git push origin main:gp7`.
4. **`npm run notify:setup -- staging`** deploys the notification functions and starts the schedule, once that environment's migrations have run. After that, each deploy redeploys the functions right after the migrations, so they never run against a schema they weren't written for. See "Notifications" below.
5. **`npm run alerts:setup -- staging`** turns on alert emails: it asks where to send them and for that project's Resend key, then sends a test email. See "Health checks and alerts" below.
6. **`npm run admin:add -- staging you@example.com`**, before your first sign-in, since sign-in is refused for any email not on the allowlist. On production it adds you to the allowlist as admin and bishopric. On staging it also saves you in the `STAGING_ADMIN_EMAILS` variable, so training-site resets keep you.
7. **`npm run env:check -- staging`** checks all of it without changing anything: the GitHub variables and secrets, the branch rule, the functions and their secrets, the Vault entries and the notify job's last answer, the health check and its last alert email, the Auth settings and the allowlist. Each ✗ shows the command that fixes it.

Where the settings live, for reference (`env:github` fills them):

| Where | Secrets | Variables |
|---|---|---|
| Repository | `CLOUDFLARE_API_TOKEN` | `CLOUDFLARE_ACCOUNT_ID`, `NOTIFY_ENABLED`, `DEPLOY_ENABLED` |
| Environment `staging` | `SUPABASE_DB_URL` (session pooler), `SUPABASE_ACCESS_TOKEN` (deploy bot), `VAPID_PRIVATE_KEY` | `SUPABASE_PROJECT_REF`, `SUPABASE_ANON_KEY`, `CLOUDFLARE_PAGES_PROJECT` = `ward-desk-staging`, `WARD_NAME`, `WARD_TIME_ZONE`, `ENABLE_GOOGLE`, `VAPID_PUBLIC_KEY`, `STAGING_ADMIN_EMAILS` |
| Environment `production` | `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`, `VAPID_PRIVATE_KEY` | Same as staging, with `CLOUDFLARE_PAGES_PROJECT` = `ward-desk` and no `STAGING_ADMIN_EMAILS` |

### Google sign-in

Optional. Email links work without it, but Google sign-in means most people never wait for an email. One OAuth client serves both environments.

1. **Google Cloud project:** at console.cloud.google.com, create a project named `Ward Desk` while signed in with a personal `@gmail.com` account, so the project has "No organization". Don't use a Workspace account (such as one on warddesk.app), because the project would land inside that domain's organization, which can block adding outside owners. No billing account is needed. Add a second Owner early (IAM → Grant access → role Owner) so access doesn't depend on one person.
2. **Branding and audience** (Google Auth Platform, formerly "OAuth consent screen"):
   - App name `Ward Desk`, with your support and developer contact email.
   - Audience **External**, since ward members use their own Google accounts, not ones from a Workspace domain.
   - Authorized domains: `warddesk.app` and `supabase.co`. Google may ask you to verify `warddesk.app` in Google Search Console; add the TXT record it gives you in Cloudflare DNS.
   - Data access: only `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. These basic scopes don't need Google's app verification.
   - **Publish the app** (Audience → Publish app). While it is in "Testing", only listed test users can sign in, and their sign-ins expire after 7 days.
3. **OAuth client** (Clients → Create client → Web application):
   - Authorized JavaScript origins: `https://gp7.warddesk.app` and `https://demo.warddesk.app`.
   - Authorized redirect URIs: `https://<prod-ref>.supabase.co/auth/v1/callback` and `https://<staging-ref>.supabase.co/auth/v1/callback`.
   - Copy the client ID and client secret.
4. **Supabase:** put the client ID in each `[remotes.*.auth.external.google]` block of `supabase/config.toml`, then run `npm run env:auth -- staging` (and production) and paste the client secret when it asks.
5. **GitHub:** set `ENABLE_GOOGLE` to `true` in both environments (`gh variable set ENABLE_GOOGLE --env staging --body true`), then re-run the latest deploy for each. The button only appears in a fresh build, because the setting is read at build time.

The allowlist still applies. A Google account whose email isn't on the allowlist is refused, and the same address can sign in with either Google or an email link. Google's sign-in screen says "continue to `<ref>.supabase.co`". Showing your own domain there needs Supabase's paid custom-domain add-on.

### Notifications

`npm run env:github` makes each environment's VAPID key pair: the public key is the `VAPID_PUBLIC_KEY` variable and the private key the `VAPID_PRIVATE_KEY` secret. The two environments get separate pairs, so a staging key can't send to production devices. It never replaces a pair, because changing one signs every device out of notifications and each person has to turn them on again. The app reads the public key at build time, so the Account page only offers notifications after a fresh build.

**The Edge Functions and the schedule.** One command sets up an environment's notifications: the `push` function (instant notifications for requests) and the `notify` function the database calls every 10 minutes (scheduled ones). Run it once per environment, after that environment's migrations have run (a deploy does that). After that, CI redeploys both functions on every deploy with the deploy bot's token, and running this again is only needed to replace the notify secret:

```bash
npm run notify:setup -- staging
```

```bash
npm run notify:setup -- production
```

It reads the project ref, VAPID public key and time zone from that GitHub environment and asks you to confirm. Then it makes a new `NOTIFY_SECRET`, sets the functions' secrets (asking for the VAPID private key if the project has none, since GitHub can't hand a secret back), builds and deploys both functions (`--skip-deploy` leaves them as they are), saves the function's address and the secret in the database's Vault (`notify_url`, `notify_secret`), and starts one run of the scheduled job to show it works. That run sends whatever happens to be due at that moment, as the schedule would. It prints the new secret once, for your password manager.

Running it again is safe: it replaces the secret in both places and redeploys. Run it again after changing `supabase/functions/`, `scripts/notify/` or the `src/lib/` code they use, and after resetting the training site (a reset can clear the Vault). Do staging first. `npm run notify:setup -- local` does the Vault and test-run steps against the local stack, once `npx supabase functions serve --env-file supabase/functions/.env` is running.

If the job stops working later, `npm run env:check -- staging` shows the last answer. A `401` means the Vault secret and `NOTIFY_SECRET` differ, so run the setup again.

### Health checks and alerts

Nobody has to watch the Supabase or Cloudflare dashboards. The database tells you when something breaks:

- **Errors in the app.** Each page sits inside an error boundary that shows "Something went wrong" with a Reload button. The app reports that error, any uncaught error or rejected promise, and any failed page load (`useAsync`) to `client_errors` through `report_client_error`. It works before sign-in too. A report holds the page path without the query string, the message and stack, the build's commit (`__APP_VERSION__`) and the browser, but no page contents. Each different error goes once per page load, at most 10, and offline errors are skipped. The database keeps at most 200 an hour and deletes them after 90 days. Admins can read them: `select created_at, route, message, app_version from client_errors order by id desc limit 20;` The pure logic is in `src/lib/errorReport.ts`.
- **The hourly check.** At 7 minutes past each hour, `pg_cron` runs `public.health_check()`. It looks at the hour since the last check for calls to the `notify` function that failed or got no answer (`notify_calls` records each call so its answer in `net._http_response` can be found), pushes a push service refused, failed `pg_cron` runs, and app errors. It also notices when `notify` hasn't answered for 30 minutes, and, on production, when no off-site backup has finished in 26 hours (see "Backups and restore"). It says each of those at most every 12 hours. If it finds anything, `send_alert()` emails the alert address through Resend with counts and where to look. The email never includes names or error text. No email means nothing went wrong.

The check runs inside the database, not in an Edge Function, so it still works when the functions are what broke. It can't report on `pg_cron` itself stopping. `npm run env:check` shows when it last ran.

Turn the emails on per environment once the migration has been deployed:

```bash
npm run alerts:setup -- staging
```

```bash
npm run alerts:setup -- production
```

It asks for the address (default: your git email; separate several with commas) and that project's Resend API key, saves them in Vault (`alert_email`, `resend_api_key`, and `alert_label`, which goes at the start of the subject), and sends a test email. On production it also turns the missing-backup alert on (`health_state.expects_backups`) once the `BACKUP_ENABLED` repository variable is true, so run it again after turning backups on. Staging never expects backups, since it only gets them when you run one by hand. Until it has run, `health_check()` only returns what it found, so local databases and fresh environments stay quiet. Run it again after resetting the training site. To try the check by hand, run `select public.health_check();` as the database owner. It returns the problem lines and moves the window forward.

### Face ID and fingerprint sign-in (passkeys)

After someone signs in once with an email link or Google, the app offers to "Turn on" Face ID or fingerprint sign-in for that device. After that, they tap **Face ID or fingerprint** on the sign-in screen and skip the email. This matters most on iPhone: an email link opens in Safari, not in the Home Screen app, so a link sign-in never reaches the installed app, but a passkey sign-in happens inside it. Each person can see and remove their devices on the Account page (Settings, then their name at the top). Passkeys sync through iCloud Keychain or Google Password Manager, so a new phone usually has them already.

Turn passkeys on in each Supabase project's Auth settings in the dashboard, with that site's own domain. `supabase config push` doesn't manage these, so the `[remotes.*.auth.passkey]` and `[remotes.*.auth.webauthn]` blocks in `supabase/config.toml` are only the record, and `npm run env:check` reads the relying party back. A passkey only works on the domain it was made for, so staging and production passkeys are separate:

| Setting | Staging | Production |
|---|---|---|
| Passkeys | Enabled | Enabled |
| Relying party ID | `demo.warddesk.app` | `gp7.warddesk.app` |
| Origins | `https://demo.warddesk.app` | `https://gp7.warddesk.app` |
| Display name | `Ward Desk` | `Ward Desk` |

Locally, `supabase/config.toml` already turns them on for `localhost`. Open the app at `http://localhost:5173` (not `127.0.0.1`) to try them. Passkeys only work on HTTPS or localhost, so a phone on your local network can't test them; use staging. The allowlist still applies, since only someone already signed in can add a passkey.

## Overview site

`site/` is the public overview and documentation site for https://warddesk.app (Astro + Starlight, its own npm project). It is separate from the app and has its own `package-lock.json`.

```bash
source ~/.nvm/nvm.sh && nvm use
npm --prefix site ci
npm --prefix site run dev   # http://localhost:4321
```

Links (sign-in, demo, repository) live in `site/src/site.config.ts`. Screenshots go in `site/src/assets/screens/` and are shown with the `Screenshot` component. Legal pages are Markdown in `site/src/content/legal/`.

One-time setup (a person does these in Cloudflare; CI does not):

1. Create the Pages project: `npx wrangler pages project create ward-desk-site --production-branch main`
2. Add the custom domains `warddesk.app` and `www.warddesk.app` to that project.
3. In the `warddesk.app` zone, add a Redirect Rule: `www.warddesk.app/*` → `https://warddesk.app/${1}`, status 301.

The `deploy-site` CI job then publishes `main` as the live site (the project's production branch) and any other branch as a preview, whenever `site/` changed, once `DEPLOY_ENABLED` is `true`.

## Backups and restore

Every night `.github/workflows/backup.yml` dumps the production database, encrypts it, and stores it in Cloudflare R2, away from Supabase's own account and backups. The dump is piped straight into [age](https://age-encryption.org), so nothing unencrypted is written to disk or uploaded anywhere, Actions artifacts included. Only the public key is on GitHub. The private key lives only in your password manager.

**What's backed up:** the `public` schema (tables, data, functions, policies, grants), the rows in `auth` (users, identities, passkeys, sessions), and `supabase_migrations` (so you can see which migrations a backup has). It's `pg_dump --format=custom` at the server's own Postgres major version.

**What isn't, and why that's fine:**

- The code, the Cloudflare Pages sites and their settings, and the GitHub variables can be rebuilt from this repo and `npm run env:github`.
- Vault secrets (`notify_url`, `notify_secret`) and the functions' secrets: `npm run notify:setup -- production` creates fresh ones.
- Supabase's own schemas (`storage`, `realtime`, `cron`, `vault`, `extensions`): the platform or the migrations create them. The app stores no files.

**Where:** `<bucket>/production/daily/<UTC time>.dump.age`, plus the month's first backup again as `production/monthly/<YYYY-MM>.dump.age`. R2 lifecycle rules delete dailies after 30 days and monthlies after 90, so there are about 30 dailies and 3 monthlies. The periods are set in `scripts/lib/backup-retention.mjs` (so deleted data is out of every backup within about three months), and `npm run backup:lifecycle -- production` applies them to the bucket; `npm run env:check` reads them back. A manual run can back up staging the same way (`gh workflow run backup.yml -f environment=staging`).

**Last-success marker:** after each upload the workflow adds a row to `public.backup_runs` (time, R2 key, size). The app's roles can't read it. The health check alerts when the newest `finished_at` is over 26 hours old (once `npm run alerts:setup -- production` has run with `BACKUP_ENABLED` on), and `npm run env:check -- production` shows it too.

### One-time setup

1. **age key.** Install age (`brew install age`) and make a key pair. Put the whole output (including the `AGE-SECRET-KEY-…` line) in your password manager as "Ward Desk backup key", then delete the file:

   ```bash
   age-keygen -o ward-desk-backup.key
   ```

   It prints the public key (`age1…`). That's the only part that goes to GitHub. Without the private key the backups can't be read, so the password manager entry is the one thing you must not lose. The successor gets it in the handoff (step 7).
2. **R2 bucket.** In Cloudflare, go to R2 → Create bucket `ward-desk-backups` (no public access). Expiry is set from the repo, not the dashboard, once step 4 has put the bucket and endpoint on GitHub: create an R2 API token with **Admin Read & Write** on the bucket (the lifecycle API needs it; the upload and restore tokens can't), then run `npm run backup:lifecycle -- production --dry-run` to see the change and `npm run backup:lifecycle -- production` to apply it (it asks first). It covers both environments' prefixes, since they share the bucket. Delete the Admin token afterwards, or keep it in your password manager for the next change.
3. **R2 tokens.** R2 → Manage API tokens → Create: **Object Read & Write**, limited to that bucket, for GitHub. Make a second one with **Object Read** only for restores, and keep it in your password manager.
4. **GitHub.** `npm run env:github -- production` asks for the age public key, the bucket, and the read/write token. It builds the R2 endpoint from `CLOUDFLARE_ACCOUNT_ID`, and asks for the database password to set `BACKUP_DB_URL_PRODUCTION`. That is a repository secret holding the same URL as the environment's `SUPABASE_DB_URL`, because the production environment only lets the `production` branch use its secrets, and scheduled runs start from `main`. Do the same for staging if you want staging backups. They're optional, so `env:check -- staging` lists the backup settings as notes, not failures.
5. **Turn it on and try it:**

   ```bash
   gh variable set BACKUP_ENABLED --body true
   ```

   ```bash
   gh workflow run backup.yml
   ```

   Then `npm run env:check -- production` should show the backup ✓.

### Restoring

`npm run backup:restore` downloads a backup, decrypts it in memory, and loads it into **local** Supabase. It refuses any database that isn't local Supabase on this machine. It replaces `public` and the `auth` rows in the local database, which other worktrees share, and asks before it does.

```bash
npm run backup:restore -- --identity /path/to/ward-desk-backup.key
```

Options: `--list` shows what's in R2. `--key production/monthly/2026-11.dump.age` picks one (the default is the latest daily). `--file <path>` uses a downloaded file. `--env staging` uses staging's backups. It asks for the read-only R2 token (or set `BACKUP_R2_ACCESS_KEY_ID` and `BACKUP_R2_SECRET_ACCESS_KEY`). The identity path is used once and never stored. Save the key from your password manager to a temporary file and delete it afterwards.

Afterwards your local database holds **real member data**. Don't seed, test or screenshot it, and run `npm run db:reset` when you're done to get back to the invented data.

**Restoring production itself** (after data loss) is the same dump with `pg_restore` pointed at production. Do it deliberately, by hand, after a drill. The script won't do it.

### Restore drill (quarterly)

Once a quarter, and after any change to the schema's shape or to Supabase's Postgres version:

1. Get the key from the password manager into a temporary file.
2. `npm run backup:restore -- --identity <file> --list` and check last night's backup and this month's monthly are there.
3. `npm run backup:restore -- --identity <file>` and check the summary: the auth user count and the newest migration should match production.
4. Run `npm run dev` and sign in locally. Spot-check a recent agenda and the callings list.
5. `npm run db:reset`, and delete the key file.

## Data retention

Every day at 09:23 UTC, `pg_cron` runs `public.purge_old_records()`, which deletes records once they are past these periods. The same table heads the migration that made it (`supabase/migrations/*_purge_old_records.sql`); change both together, in a new migration.

| Records | Rule |
|---|---|
| Declined names on a calling | deleted 90 days after the decision |
| Cancelled callings ("no longer needed") | deleted 90 days after the decision, with their names and calling requests |
| Finished callings (name set apart, or a release-only calling whose release was announced) | notes on the calling, its names and its calling requests cleared 90 days after done; all of them deleted 1 year after done |
| Calling requests without a calling (suggested names, or the calling was deleted) | notes cleared 90 days after they were made, deleted after 1 year, once finished |
| Appointments | notes and the report cleared 90 days after the appointment; deleted 1 year after |
| Requests, done or declined | deleted 1 year after they were closed |
| Prayer roll | deleted 90 days after the name was taken off |
| Agenda items, resolved | deleted 2 years after they were resolved |
| Sacrament meetings and programs | deleted 3 years after the meeting |
| Away dates | deleted 1 year after they end |
| Meeting reminders sent | deleted 90 days after the meeting |
| Meeting assignments (prayers, spiritual thought) and the answers | deleted 90 days after the meeting; the name stays on that day's agenda |
| Accounts removed from every role | deleted 180 days after the last role was taken away, the same way an admin's **Delete account** does |

Kept by the hourly `health_check()` instead:

| Records | Rule |
|---|---|
| Calls to the notify function (`notify_calls`) | deleted after 7 days |
| Error reports from the app (`client_errors`) | deleted after 90 days |

Open work is never deleted: a calling still being filled, an appointment waiting for a time, an open request, a name still on the prayer roll and unresolved agenda items stay however old. `npm run export-sheets` only reaches back as far as these periods. Deleted rows stay in backups until those expire (see "Backups and restore").

To see what the next run would delete without deleting anything:

```sql
begin; select public.purge_old_records(); rollback;
```

It returns a count for each kind. The first run on a database deletes everything already past its date, so tell the ward before it reaches production.

## Handoff checklist

Do these in order when passing the app to a successor:

1. Add the successor as **admin**: `npm run admin:add -- production <their email>`
2. Transfer or share the **Supabase** organization/project ownership
3. Add them as Owner on the **Google Cloud** project (IAM → Grant access) and have them accept. Change the consent screen's support and developer contact email to theirs, then remove yourself. Or have them create new OAuth credentials and update Supabase Auth
4. Transfer the **Cloudflare** Pages projects and the **GitHub** repo
5. Invite them to the **Resend** team (Settings → Team) and make them owner
6. Transfer the **domain** `warddesk.app` to the successor's Cloudflare account (Domain Registration → Transfer, or move the zone with the Pages projects). Its DNS records for the Pages sites and Resend move with it, so nothing else needs updating
7. Hand over secrets securely (password manager, not email or chat), including the backup age key and the R2 read-only token
8. Send alert emails to them: `npm run alerts:setup -- production --email <their email>` (and the same for staging)
9. Confirm the successor can sign in, see the right data, and receive a test notification and sign-in email. `npm run env:check -- production` should be all ✓
10. Remove your own admin access once they confirm

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
