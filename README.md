# Ward Desk

A mobile-first web app (PWA) for managing ward administration in one place: callings (proposing names, discussion, interviews) and sacrament meeting planning (conducting assignments, speakers, talks).

> Contains no member data in this repo. All data lives in Supabase. Keep this repo **private**.

## Modules

**Callings**
- Propose and discuss names for a calling
- Schedule and track interviews
- Track assignments once decisions are made

**Meetings**
- Conducting assignments by date
- Speakers, topics, and talk assignments
- Reminders to the people assigned

Both modules share the same users, roles, notifications, and calendar.

## Stack

- **Frontend:** React + TypeScript PWA built with Vite and [MUI](https://mui.com/), hosted on Cloudflare Pages. Light and dark themes follow the device by default; the toggle in the top bar overrides it (see `src/theme.ts`)
- **Backend:** Supabase (Postgres, Auth, Realtime, Edge Functions)
- **Auth:** Google sign-in and email magic links, invite-only via an allowlist table
- **Notifications:** Web Push (VAPID) plus email fallback

## Roles

Roles live in the `roles` table, not in Google. Access is enforced by Row Level Security (RLS) in the database, not just the UI. Calling proposals are confidential, so access to the Callings module is separate from access to Meetings.

| Role | Can do |
|------|--------|
| admin | Manage users, roles, settings |
| bishopric | The bishop, 1st and 2nd counselors, executive secretary and ward clerk. View and decide on calling proposals, schedule interviews, manage meetings |
| leader | Other called leaders. Submit name suggestions only; **cannot** see calling proposals |

Each bishopric member's profile also has an `office` (bishop, first or second counselor, executive secretary, ward clerk) that only an admin can set. The Conducting and Interviewer pickers list only the bishop and counselors.

Adjust these as the real needs become clear.

## How it replaces the Google Sheet

| Sheet tab | In the app |
|-----------|------------|
| Sacrament | **Sacrament** page (`meetings`, `program_items`) |
| Bishopric Schedule | **Schedule** page (`recurring_events`, `rotations`, `stewardships`) |
| Travel | **Away** page (`absences`). Warns when whoever is conducting is away |
| Weekly agenda tab (copied every Sunday) | **Agenda** page, assembled live. Upcoming sacrament meetings, interviews, the callings table, releases, and sustainings fill in automatically. Discussion and calendar items carry forward until marked done. |
| Callings Needed table | **Callings** page (`calling_needs`, `calling_candidates`). Accepted names with a sustain date show up under "Sustainings today" |

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
- `VAPID_PUBLIC_KEY` (frontend) and `VAPID_PRIVATE_KEY` (server only)
- Google OAuth client ID and secret (stored in Supabase Auth settings; set `VITE_ENABLE_GOOGLE=true` once configured)

## Tests

| Command | What it covers | Needs local Supabase |
|---------|----------------|----------------------|
| `npm test` | Unit and component tests (Vitest + Testing Library): dates, schedule rules, agenda assembly, role-based navigation, auth loading, forms | No |
| `npm run test:db` | pgTAP tests in `supabase/tests/database`. Every RLS rule, checked as each role | Yes |
| `npm run test:integration` | Signs in as each seeded role and runs the app's real queries (`src/lib/queries.ts`) against the local API | Yes |
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
   | Environment `staging` | `SUPABASE_DB_URL` (session pooler string) | `SUPABASE_PROJECT_REF`, `SUPABASE_ANON_KEY`, `CLOUDFLARE_PAGES_PROJECT` = `ward-desk-staging`, `WARD_TIME_ZONE`, `ENABLE_GOOGLE` |
   | Environment `production` | `SUPABASE_DB_URL` | Same as staging, with `CLOUDFLARE_PAGES_PROJECT` = `ward-desk` |

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

## Maintenance notes

- **Free-tier pause:** Supabase free projects pause after about a week of inactivity. A scheduled ping keeps it awake. If it pauses, restore it from the Supabase dashboard.
- **Backups:** The free tier may not include automatic backups. Export the database on a regular schedule to a private location.
- **Dead push subscriptions:** The send function should delete subscriptions that return 404 or 410.
- **Privacy:** Notification text stays generic, with no names. Keep data retention minimal, and remove proposals once decisions are final.
- **Branding:** Don't use the church's name or logos in the app. Check the church's guidance on third-party tools before sharing widely.

## iPhone users

Push notifications require adding the app to the Home Screen first (iOS 16.4 or later): open in Safari, tap Share, then **Add to Home Screen**, then enable notifications from inside the app.
