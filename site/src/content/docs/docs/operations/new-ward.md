---
title: Adding a new ward
description: What it takes today to run Ward Desk for another ward, step by step with time estimates, the code changes still needed, and how this could scale.
---

Today each ward is its own deployment: its own database, its own website, its own settings. Nothing in the app yet knows about more than one ward. This page lists what adding one takes **right now**, and what in the repository would have to change first. It documents the gaps. Nothing here has been built.

Allow **about a day of work** for a second ward, most of it the first time through the dashboards. The code changes (the second table below) come before the checklist, and are a one-off.

## What assumes a single ward

These are the gaps found in the repository. Until they are closed, a second real ward means editing code, not just running scripts.

| Where | What it assumes | What to change |
|---|---|---|
| `scripts/lib/cli.mjs`, `ENVIRONMENTS` | Only `staging` and `production` exist, each with a URL and a branch | Add an entry per ward. Every script that takes an environment name (`env:github`, `env:auth`, `env:check`, `notify:setup`, `alerts:setup`, `admin:add`) accepts only the names it is given, so many have their own list of allowed names too |
| `.github/workflows/ci.yml`, `deploy` job | `main` is staging, `gp7` is production. The job name, GitHub environment and URL are all `gp7 ? production : staging` | Add a branch, or turn the job into a matrix over wards. The `deploy` guard on `refs/heads/gp7` and the "commit must be on `main`" check need the same treatment |
| `ci.yml`, `deploy-site` | Skips only `gp7` | Skip each ward branch |
| `.github/workflows/notify.yml` | Same two-way mapping, for the manual notify run | Same |
| `.github/workflows/backup.yml` | Secrets named `BACKUP_DB_URL_PRODUCTION` and `_STAGING`; the choice list is `[production, staging]`; scheduled runs back up production only | One secret per ward, a longer choice list or a matrix |
| `scripts/lib/backup-retention.mjs` | Lifecycle rules for four fixed prefixes (`production/…`, `staging/…`) | A pair of rules per ward |
| `scripts/env-check.mjs`, `scripts/setup-alerts.mjs` | Backups are treated as required on `production` and optional on `staging`; labels say "Ward Desk" or "training site" | Make "expects backups" a per-ward setting |
| `scripts/env-github.mjs` | The branch rule is only set for `production` | Set it for every real ward |
| `src/lib/env.ts` | The training-site banner shows when `VITE_APP_ENV === 'staging'` | Another environment name just works, but only if it is not called `staging` |
| `supabase/config.toml` | One `[remotes.<name>]` block per project, with that project's ID, URLs, SMTP and passkey values | Copy a block per ward |
| Email and push identity | The sender is `noreply@warddesk.app`, and `VAPID_SUBJECT` defaults to a `warddesk.app` address | Fine to share, but every ward's mail comes from one address |
| Time zone | `WARD_TIME_ZONE` defaults to `America/Denver` | Set it per ward. `env:github` asks |
| Default data | The calling list and the agenda templates are inserted by migrations, so every ward starts with the same ones | Each ward tidies them, or a seed step is added |
| `supabase/seed.sql` | Invented training data only. There is no "empty ward" seed | A new ward starts empty after `db push`, which is right. Do not run the seed there |
| README, scripts messages | "Promote with `git push origin main:gp7`" | Reword once there are several |

Everything else (the migrations, the Edge Functions, the notify job, the app itself) is the same for every ward and needs no change.

## The checklist

Times are for someone who has done it once. The first time, add 50%.

| # | Step | Time |
|---|---|---|
| 1 | Decide the names | 10 min |
| 2 | Code changes (above) | 1 to 2 hours |
| 3 | Supabase project | 20 min |
| 4 | Cloudflare Pages project and subdomain | 20 min |
| 5 | Branch and GitHub environment | 20 min |
| 6 | Auth settings | 20 min |
| 7 | Deploy and database | 15 min |
| 8 | Notifications | 15 min |
| 9 | Alerts | 10 min |
| 10 | Backups | 30 min |
| 11 | First admin and the allowlist | 10 min |
| 12 | The ward's own data | 30 min to 2 hours |
| 13 | Check | 15 min |

### 1. Decide the names

Pick a short code for the ward, say `riverside`. It becomes the environment name, the branch, the Pages project and the subdomain (`riverside.warddesk.app`). Pick the time zone and the name shown in the app.

### 2. Make the code changes

Do the table above for the new name. Commit it to `main` first. It touches `scripts/**` and `.github/workflows/**`, so CI runs every job. Keep the existing two wards working while you do it.

### 3. Create the Supabase project

1. In the Supabase dashboard create a project named `ward-desk-<code>`, **in the same region** as the others.
2. Leave "Data API" and "Automatically expose new tables" on, since the migrations rely on the default grants, and turn on automatic RLS.
3. Use a database password of letters and digits only. It goes into a URL.
4. **This is the third free project, so it needs a paid plan.** Free plans allow two. See [Services and free-tier capacity](/docs/operations/services/).
5. Make sure the deploy bot account is still a Developer on the organization that holds the project.

### 4. Create the Pages project and subdomain

```bash
npx wrangler pages project create ward-desk-riverside --production-branch riverside
```

In the project's **Custom domains**, add `riverside.warddesk.app`. The DNS record is created for you when the zone is in the same account. If the ward uses its own domain, add it there and ask them to add the record.

### 5. Branch and GitHub environment

1. Create the branch from `main`: `git push origin main:riverside`. **Do not do this until the secrets in the next step are set**, because pushing the branch starts a deploy.
2. Run `npm run env:github -- riverside`. It asks for the Supabase project, builds the session pooler URL from the database password, asks for the deploy bot token, asks which Pages project to use, sets the ward name and time zone, makes a VAPID key pair, and limits deploys to the ward's branch. It prints the VAPID private key once, so save it in the password manager.
3. Remember the key is **per ward**. A key from another ward must not be reused.

### 6. Auth settings

1. Add a `[remotes.riverside]` block to `supabase/config.toml`, copying `production` and changing the project ID, `site_url`, redirect URLs and the passkey values.
2. Make a sending-only Resend key for this project (the domain is already verified) and run `npm run env:auth -- riverside`.
3. In the project's dashboard turn on **passkeys**, with relying party ID `riverside.warddesk.app` and origin `https://riverside.warddesk.app`. `config push` cannot set these.
4. If Google sign-in is wanted, add the new site as an authorized JavaScript origin and the project's `…supabase.co/auth/v1/callback` as a redirect URI on the Google client, and set `ENABLE_GOOGLE` to `true` for the environment.
5. In **Emails → Templates** keep the wording generic, with no names.

### 7. Deploy

1. Make sure `DEPLOY_ENABLED` is `true`.
2. Push to the ward's branch. The deploy applies the migrations, redeploys the functions and publishes the app.
3. Check the site opens. There is no data yet, and that is correct.

### 8. Notifications

```bash
npm run notify:setup -- riverside
```

This needs that ward's migrations to have run. It deploys the functions, stores the secret in the database's Vault and starts the 10-minute job.

### 9. Alerts

```bash
npm run alerts:setup -- riverside
```

It asks for the alert address and this project's Resend key, then sends a test email.

### 10. Backups

1. The bucket, the age key and the R2 tokens are shared and already exist.
2. Run `npm run env:github -- riverside` again. It asks for the backup database URL and stores it as `BACKUP_DB_URL_<WARD>`.
3. Add the ward to the backup workflow and the retention rules (the code changes), then `npm run backup:lifecycle -- riverside`.
4. `gh workflow run backup.yml -f environment=riverside`, then check the file landed in the bucket.
5. Run `npm run alerts:setup -- riverside` again so the health check expects backups.

### 11. The first admin

```bash
npm run admin:add -- riverside someone@example.com
```

Do it before the first sign-in, because sign-in is refused for addresses not on the allowlist. That person adds the rest of the ward under **Access**, with their roles.

### 12. The ward's own data

The calling list and agenda templates arrive with the migrations, so the app is usable. Then the ward sets:

- The **standing schedule** (regular meetings, rotations, who has which assignment).
- Who books for whom, and appointment hours.
- Agenda templates, trimmed to the meetings they actually hold.
- Optionally, a one-off import from their spreadsheets: `npm run import-sheets`, with a dry run first. It is written around the original ward's two sheets, so expect to adjust it.

### 13. Check

```bash
npm run env:check -- riverside
```

Every line should be ✓. Then sign in on a phone, add the app to the Home Screen, turn on notifications and use **Show a test**.

## Running costs and limits

The free plans give two Supabase projects in total, and they are already used by the training site and the first ward. A third project means Supabase Pro. After that each ward is a small cost. Everything else (Cloudflare, Resend, R2, GitHub) has room for dozens of wards. The figures are on [Services and free-tier capacity](/docs/operations/services/).

## How this could scale

Two ways to run many wards.

| | One deployment per ward (today) | One database for all wards |
|---|---|---|
| Isolation | Strong. A mistake in one ward cannot reach another | Only as strong as the access rules. One missing rule exposes every ward |
| Privacy story | Simple to explain: a ward's data is in a database of its own | Harder. Needs careful rules and tests on every table |
| Changes to the app | Almost none | Large. Every table gets a ward column, every access rule and every query is rewritten, plus ward-aware sign-in and admin |
| Schema updates | Run per ward, so more to do each time | Once |
| Supabase cost | One project per ward, from the third onward paid | One project, so the free tier can last |
| Backups, alerts, notifications | One set per ward | One set |
| Handing over one ward | Easy. Move its project | Hard. Extract one ward's rows |
| Time to add a ward | Hours, mostly dashboards | Minutes, once built |

**Free-tier effect.** Per-ward projects hit the two-project limit at the second ward. A shared database would keep everything in one free project: on the measurements in the services page, a ward uses a few percent of the database and egress limits, so dozens would fit. But a shared free project is still paused after a quiet week and has no automatic backups.

**Recommendation.** Stay with one deployment per ward for now, and make it cheaper to repeat before changing the design:

1. Replace the two hard-coded environments with a list of wards in one file that the scripts, the workflows and the backup job all read.
2. Make the deploy job a matrix over that list.
3. Add a `new-ward` script that does steps 5 to 11 above in one go.

That removes most of the hours without touching the data model. Revisit a shared database only when there are many wards and the people running them are the same, because the privacy cost of mixing wards' data in one place is real, and it is the one thing this app promises to take seriously.
