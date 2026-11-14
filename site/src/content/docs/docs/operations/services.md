---
title: Services and free-tier capacity
description: Every outside service Ward Desk depends on, what each one is used for, the free-tier limits that matter, and how many wards they can carry.
---

Ward Desk is an independent open-source project, run by one person, with no support promised. It runs on a handful of outside services, almost all on free plans. This page lists them, the limits that matter, and a worked estimate of how far the free plans stretch.

Limits were read from each provider's own pricing or documentation page in **November 2026** and change without notice. Check the linked page before relying on a number.

## What the app depends on

| Service | Used for |
|---|---|
| Supabase | Database, sign-in, the two Edge Functions (`notify`, `push`), and the scheduled jobs (`pg_cron`) |
| Cloudflare | Hosting the app and this site (Pages), DNS, off-site backup storage (R2), and the `warddesk.app` domain registration |
| Resend | Sign-in emails (as Supabase's mail server) and alert emails |
| GitHub | The code, CI, deploys and the nightly backup job |
| Browser push services | Delivering notifications. Apple, Google and Mozilla run these. No account, no cost |
| Google Cloud | Optional "Sign in with Google" only |

Nothing else is called at run time. The app loads no analytics, no outside fonts and no tracking. Supabase Realtime keeps open pages up to date: each app joins one private channel, and a change sends a message naming only the table that changed, never the data.

Also in the pipeline, with no account of ours: the npm registry, Docker Hub (the backup job runs `pg_dump` from the `postgres` image), and the `age` encryption tool.

### Where each one lives today

| Service | What exists | Owner today | Plan assumed |
|---|---|---|---|
| Supabase | Two projects: training site and real site, plus a separate deploy-bot account | The maintainer's account | Free |
| Cloudflare | Pages projects `ward-desk-demo`, `ward-desk-gp7`, `ward-desk-site`; the `warddesk.app` zone and registration; R2 bucket `ward-desk-backups` | The maintainer's account | Free (R2 free tier) |
| Resend | Domain `warddesk.app`, one sending-only key per Supabase project | The maintainer's account | Free |
| GitHub | The private repository, two Environments (`staging`, `production`) | The maintainer's account | Free |
| Google Cloud | One OAuth client shared by both environments | A personal Gmail account, with no organization | No billing account |

The "Plan assumed" column is what the README and scripts assume. Confirm it in each dashboard, because the repository cannot see it.

## The limits that matter

### Supabase

Source: [supabase.com/pricing](https://supabase.com/pricing), checked 2026-11.

| Limit (Free) | Value | Matters here? |
|---|---|---|
| Active free projects | **2**, counted across every organization you own or administer | **Yes. Already used up** |
| Pause on inactivity | After 1 week of too little database activity | Yes, but see below |
| Database size | 500 MB per project | No |
| Egress | 5 GB, plus 5 GB cached | Not at this size |
| Monthly active users | 50,000 | No |
| Edge Function invocations | 500,000 | No |
| Realtime | 200 connections, 2 million messages | No. One connection per open app and one message per save |
| Automatic backups | **Not included** | Yes. This is why the nightly R2 backup exists |

Two of these deserve a closer look.

**Project count is the real ceiling.** Staging and production already take both free slots. A third database in this account, such as a private test copy, means a paid plan. Another ward uses its own Supabase account, so it doesn't count here. Paused projects do not count toward the two, but a paused project is not running.

**Pausing.** Supabase pauses a free project that gets too little database activity for a week. It emails the owners about a week before. A paused project can be resumed from the dashboard for up to a year, after which the backups it relies on may be gone ([pausing docs](https://supabase.com/docs/guides/platform/pausing)). A ward in daily use stays active. The 10-minute `notify` job and the hourly health check run inside the database, but Supabase does not say in writing that a `pg_cron` job counts as activity, so do not rely on them alone. The training site is the likely one to pause during a quiet stretch. Resume it from the dashboard, then run **Reset training site** (a pause or a reset can clear the Vault, so also run `npm run notify:setup -- staging`).

Sign-in email limit: with custom SMTP, Supabase allows **30 emails an hour** per project by default ([auth SMTP docs](https://supabase.com/docs/guides/auth/auth-smtp)). `config.toml` sets `email_sent = 30` for both environments. This is the practical limit when a whole ward is invited on the same morning.

### Cloudflare

Sources: [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), checked 2026-11.

| Limit (Free) | Value | Matters here? |
|---|---|---|
| Pages static requests and bandwidth | Free and unlimited | No |
| Pages builds | 500 a month, one at a time | No. See below |
| Pages files / file size | 20,000 files, 25 MiB each | No. The app is 19 files, about 1.2 MB |
| Pages projects | 100 per account | No |
| R2 storage | 10 GB-month | No |
| R2 operations | 1 million writes and lists, 10 million reads, a month | No |
| R2 egress | Free | No |

Pages builds are the dashboard's own Git builds. Ward Desk builds in GitHub Actions and uploads the finished files with `wrangler pages deploy` ("Direct Upload"), so the 500-build limit does not apply to us as far as we can tell. Cloudflare's page does not say so in as many words.

The domain is renewed at the registry's price through Cloudflare. Check the amount on the Registrar page. It is the one recurring cost that is not optional.

### Resend

Sources: [resend.com/pricing](https://resend.com/pricing), [account limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits), checked 2026-11.

| Limit (Free) | Value |
|---|---|
| Emails a month | 3,000 |
| Emails a day | **100** (counted per UTC day) |
| Verified domains | 3 |
| API rate | 10 requests a second per team |

The daily cap is the one that bites: it is shared by every ward on the same Resend team, and a launch day with a whole ward signing in can approach it.

### GitHub Actions

Source: [about billing for GitHub Actions](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions), checked 2026-11.

| | Public repository | Private repository (Free plan) |
|---|---|---|
| Standard Linux runners | Free, no cap | $12 of included usage a month, about **2,000 minutes** at $0.006 a minute |
| Over the allowance | n/a | Billed at the same rate. Without a payment method, jobs are blocked |

The repository is **private today**, so this one is real. See the measurement below.

### Google OAuth

Free. No billing account is needed, and the README sets the app up with the three basic scopes only (`openid`, email, profile), which do not need Google's app review. Publish the consent screen, or sign-ins from outside the test-user list stop working and expire after 7 days. I did not find a user quota that applies at ward scale.

### Web push

Free. There is no account; the app talks to the browser's own push service (Apple, Google, Mozilla) with a VAPID key pair. A device the service reports as gone (404 or 410) is deleted.

## What one ward uses

These are estimates unless marked measured.

**Assumptions for a typical ward.** 25 people with a role. Each opens the app twice on about 20 days a month, so about 1,000 opens. Each open makes about 15 API calls and moves about 60 KB of data. A handful of instant notifications a day. Sign-in by email link for about 2 sign-ins per person per month at first, falling as people switch to Face ID, fingerprint or Google. One nightly backup. Two scheduled database jobs.

**Measured from this repository:**

- The seed database: **32 MB** in total on a fresh Supabase stack (almost all of it Supabase's own tables). The app's own `public` schema is **3.4 MB** with 37 tables and about 330 rows.
- A compressed backup of that seed (`pg_dump --format=custom --compress=9` of `public`, `auth` and `supabase_migrations`) is **1.2 to 1.5 MB** before encryption. Encryption with age adds a few hundred bytes.
- The built app: **19 files, 1.2 MB** (largest script 323 KB compressed).
- Scheduled database jobs on `main`: **2** (`notify` every 10 minutes, `health` at 7 past every hour). That is 144 + 24 = **168 runs a day**. A nightly privacy purge is being added as a third.
- GitHub Actions in the first week of November 2026, during heavy development: **about 510 billable minutes in 6 days** across 70 runs, measured from job durations (each job rounded up to a whole minute, as GitHub bills). Typical jobs: database tests 4.1 min, check 2.1, deploy 1.1, and 1 minute each for the small "detect changes" and ".env guard" jobs.

**Per ward, per month:**

| Service | Use | Free limit | Share used |
|---|---|---|---|
| Supabase database | 3.4 MB now. A busy ward adds 5 to 15 MB a year | 500 MB | Under 5% after years |
| Supabase egress | about 0.1 GB (could be 0.3) | 5 GB | 2 to 6% |
| Supabase function calls | `notify` 4,320 (144 a day) plus about 500 `push` and trigger calls, so about 5,000 | 500,000 | 1% |
| Supabase active users | 25 | 50,000 | 0.05% |
| Resend | about 60 emails (50 sign-in, a few alerts) | 3,000 | 2% |
| R2 storage | 33 backups (30 daily and 3 monthly) at 1.5 to 3 MB each, so 50 to 100 MB | 10 GB | 0.5 to 1% |
| R2 operations | about 100 writes and 100 reads | 1 million / 10 million | Nothing |
| Cloudflare Pages requests | Whatever it is | Unlimited | n/a |
| Actions minutes (backup only) | about 2 minutes a night, so 60 | 2,000 if private | 3% |

## What binds, and how far it goes

| Limit | Runs out at |
|---|---|
| **Supabase: 2 free projects** | **2 databases total.** Today that is one real ward plus the training site |
| Resend: 100 emails a day | A few wards launching on one day. Steady state it holds about 50 wards |
| Resend: 3,000 emails a month | About 50 wards at 60 emails each |
| Supabase: egress 5 GB | About 50 wards, if one project held them all |
| Supabase: 30 sign-in emails an hour | One ward inviting more than 30 people in an hour |
| GitHub Actions: 2,000 minutes (private) | About one month of heavy development. Quiet running stays under 300 |
| R2, Cloudflare Pages, Google | Hundreds of wards |

Reading that table: **the free tiers carry exactly one real ward plus a training site**, set by Supabase's two-project rule. Every other limit has room for dozens of wards. The numbers behave this way because one ward is small: a few thousand database rows and a couple of thousand requests a month.

The GitHub row is the surprise. A private repository on the Free plan gives about 2,000 minutes, and an intense week of building used a quarter of that. Making the repository public removes the limit. Running quietly, the nightly backup, a few deploys and the odd test run use well under 300 minutes a month.

## What to upgrade first

| Order | Upgrade | Cost | When |
|---|---|---|---|
| 1 | **Supabase Pro** | From $25 a month per organization. Includes 8 GB of disk per project, 250 GB egress, 2 million function calls, 7 days of daily backups, and no pausing. A Micro-size project is covered by a $10 compute credit; each further project is billed for its own compute (about $10 a month for Micro, so check the pricing page) | If a project must never pause, or you need a third one in the account |
| 2 | **Resend Pro** | $20 a month for 50,000 emails | When a launch day goes past 100 emails, or you pass about 50 wards |
| 3 | **GitHub** | Make the repository public (free), or pay about $0.006 a minute over 2,000 | If the private repo's minutes run out |
| 4 | Cloudflare R2 | $0.015 per GB-month over 10 GB | Not for a long time |

Rough total: one ward and a training site, **$0 a month** plus the domain. Each other ward runs on its own accounts and pays its own costs, so it adds nothing here.

For what the project does when another ward joins, see [Adding a new ward](/docs/operations/new-ward/). To pass the project to someone else, see [Handing the project to a new owner](/docs/operations/handover/).
