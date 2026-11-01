# Ward Planner

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
| bishopric | View and decide on calling proposals, schedule interviews, manage meetings |
| scheduler | Manage meeting assignments and speakers; **cannot** see calling proposals |
| suggester | Submit name suggestions only |

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

Sign in locally with a seeded fake account (`bishop@`, `first@`, `second@`, `scheduler@`, or `suggester@ward.test`). Either open the magic link in Mailpit at http://127.0.0.1:54324, or expand "Local test accounts" and use the dev-only password from `supabase/seed.sql`. Supabase Studio is at http://127.0.0.1:54323.

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

## Handoff checklist

Do these in order when passing the app to a successor:

1. Add the successor to the `roles` table as **admin**
2. Transfer or share the **Supabase** organization/project ownership
3. Add them as owner on the **Google Cloud** project (or have them create new OAuth credentials and update Supabase Auth)
4. Transfer the **Cloudflare** account/project and the **GitHub** repo
5. Hand over secrets securely (password manager, not email or chat)
6. Confirm the successor can sign in, see the right data, and receive a test notification
7. Remove your own admin access once they confirm

## Maintenance notes

- **Free-tier pause:** Supabase free projects pause after about a week of inactivity. A scheduled ping keeps it awake. If it pauses, restore it from the Supabase dashboard.
- **Backups:** The free tier may not include automatic backups. Export the database on a regular schedule to a private location.
- **Dead push subscriptions:** The send function should delete subscriptions that return 404 or 410.
- **Privacy:** Notification text stays generic, with no names. Keep data retention minimal, and remove proposals once decisions are final.
- **Branding:** Don't use the church's name or logos in the app. Check the church's guidance on third-party tools before sharing widely.

## iPhone users

Push notifications require adding the app to the Home Screen first (iOS 16.4 or later): open in Safari, tap Share, then **Add to Home Screen**, then enable notifications from inside the app.
