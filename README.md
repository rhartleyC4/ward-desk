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

- **Frontend:** PWA hosted on Cloudflare Pages
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

## Setup

1. Clone the repo and run `npm install`
2. Copy `.env.example` to `.env` and fill in the values
3. Run `npm run dev`

Never commit `.env`. Secrets needed:

- `SUPABASE_URL` and `SUPABASE_ANON_KEY` (safe for the frontend)
- `SUPABASE_SERVICE_ROLE_KEY` (server only, never in the frontend)
- `VAPID_PUBLIC_KEY` (frontend) and `VAPID_PRIVATE_KEY` (server only)
- Google OAuth client ID and secret (stored in Supabase Auth settings)

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
