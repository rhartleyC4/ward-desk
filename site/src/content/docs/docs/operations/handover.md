---
title: Handing the project to a new owner
description: A step-by-step playbook for passing Ward Desk, or one ward's deployment, to someone else, including what to rotate, how to check it, and how to roll back.
---

This expands the short "Handoff checklist" in the README into a full playbook. Plan on **half a day of work** spread over a week, because a few steps wait on the other person to accept an email.

Two principles run through it:

- **Add before you remove.** Give the new owner access to every service first. Take your own access away last, only after everything has been checked.
- **Do the hard-to-undo step last.** Moving the domain registration locks it for 30 days, so it comes at the end.

Commands below run from a checkout of the repository, after `source ~/.nvm/nvm.sh && nvm use`. Where a dashboard menu is named, providers rename menus now and then, so treat the path as a guide.

## Before you start

1. **Make an inventory.** Use the table on [Services and free-tier capacity](/docs/operations/services/). For each service, write down the account that owns it, the login email, and where its secrets are kept.
2. **Agree what is moving.** The whole project (this page, top to bottom) or only one ward's deployment (see [Handing over just one ward](#handing-over-just-one-ward) at the end).
3. **Both of you use a password manager** that can share a vault. Secrets travel through it, never through email or chat.
4. **Set up a second owner for each service if you can.** The new owner's email on every account, so that access never depends on one person.
5. **Check the state of things first.** Run `npm run env:check -- production` and `npm run env:check -- staging`. Both should be all ✓. Handing over a broken setup makes every later problem look like the handover's fault.
6. **Confirm a backup exists** and the new owner has the age key (see step 8). Run `npm run backup:restore -- --identity <key file> --list` and check last night's file is listed.
7. **Pick a quiet window.** Not a Sunday, and not the day before one.

### What the new owner needs

| Need | Why |
|---|---|
| A GitHub account | Owns the repository |
| A Cloudflare account | Owns Pages, DNS, R2 and the domain |
| A Supabase account | Owns the organization and projects |
| A Resend account | Owns the sending domain and keys |
| A Google account | Owns the OAuth project (optional feature) |
| A second Supabase account for the deploy bot | See step 5 |
| Node (see `.nvmrc`), `gh`, `npx supabase` | To run the scripts |

## The order

| Step | What | Time | Can be undone? |
|---|---|---|---|
| 1 | Add them as admin in the app | 5 min | Yes |
| 2 | GitHub repository | 15 min | Yes, by transferring back |
| 3 | Supabase | 20 min | Yes |
| 4 | Resend | 10 min | Yes |
| 5 | Supabase deploy bot | 15 min | Yes |
| 6 | Cloudflare account, Pages, R2 | 1 to 2 hours | Mostly |
| 7 | Google Cloud | 15 min | Yes |
| 8 | Secrets, keys and backup key | 30 min | Yes |
| 9 | Domain registration | 30 min, plus up to 5 days of waiting | **No** (30-day lock) |
| 10 | Rotate | 1 hour | n/a |
| 11 | Verify | 1 hour | n/a |
| 12 | Remove your own access | 15 min | Yes, by being re-invited |

## 1. The app

Add the new owner to the allowlist as admin and bishopric, and do the same for staging:

```bash
npm run admin:add -- production new.owner@example.com
```

```bash
npm run admin:add -- staging new.owner@example.com
```

Do this before the first sign-in, because sign-in is refused for any address not on the allowlist. Keep your own entry until step 12.

## 2. GitHub

1. In the repository, open **Settings → General → Danger Zone → Transfer**. Choose the new owner (a user, or an organization they own), type the repository name, and confirm.
2. If the target is another person, they get an email and must accept within a day. If you have no time to wait, add them first as a collaborator with admin access and transfer later.
3. After the transfer, GitHub redirects the old address, and the code, issues, history, secrets and variables stay with the repository ([GitHub's transfer docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)). The docs do not mention Environments, so check them yourself.

**What to check straight after:**

| Check | Where | If wrong |
|---|---|---|
| Both Environments exist, with their secrets and variables | Settings → Environments | Rebuild with `npm run env:github -- production` and `-- staging` |
| The `production` environment allows only the `gp7` branch | Settings → Environments → production | Same command, which fixes the rule |
| Repository variables `DEPLOY_ENABLED`, `NOTIFY_ENABLED`, `BACKUP_ENABLED`, `CLOUDFLARE_ACCOUNT_ID` | Settings → Secrets and variables → Actions → Variables | `gh variable set ...` |
| Repository secrets `CLOUDFLARE_API_TOKEN`, `BACKUP_*` | Same page, Secrets | Re-enter in step 10 |
| Actions are enabled and the workflows are listed | Actions tab | Enable them |
| Your local remote points at the new address | `git remote -v` | `git remote set-url origin <new url>` |

**What can break:**

- If you move to an organization on a Free plan and the repository is private, features that depend on the plan (such as protected branches) can be lost. Check the plan before you transfer.
- A private repository uses GitHub's included Actions minutes for the new owner's plan, not yours. See the minutes figures on the services page.
- The `gh` commands the scripts run use **whoever is signed in**, so the new owner must run `gh auth login` before running anything.
- GitHub switches off scheduled workflows in a public repository that has had no activity for 60 days. If the repository is public, check the nightly backup is still running after a quiet stretch.

**Rollback:** the new owner transfers the repository back the same way. Do not create a new repository at the old address, because that deletes the redirect for good.

## 3. Supabase

You have two choices. The first is simpler and is the one to prefer.

**A. Make them an owner of your organization.** Organization settings → Team → Invite, role **Owner**. Once they have accepted, you can leave the organization (step 12) and the projects stay where they are, with their URLs, keys and database passwords unchanged. Nothing downstream has to change.

**B. Move each project to their organization.** In each project open **Settings → General → Transfer project**. You need to be an owner of the source organization, and they need to be at least a member of the target ([project transfer docs](https://supabase.com/docs/guides/platform/project-transfer)). It cannot be done while the project has an active GitHub integration or log drains. The project keeps its region. On the Free plan the target organization is allowed two free projects in total across everything its owners and administrators have, so a new owner with their own free projects may need Pro first.

For either choice:

1. Check the deploy bot account from step 5 is still a **Developer** on the organization, and that the organization holds only Ward Desk projects.
2. Check project **Settings → General** shows the same project reference IDs. The scripts and `config.toml` read them (`project_id` in `[remotes.staging]` and `[remotes.production]`).
3. Check **Authentication → URL Configuration**, **Emails → SMTP** and **Passkeys** still show the right values. `npm run env:check -- production` reads them back.

**Rollback:** with A, the old owner stays an owner until step 12. With B, the new organization's owner transfers the project back.

## 4. Resend

1. Invite the new owner: **Settings → Team → Invite**, and make them owner, as the README says.
2. The domain `warddesk.app` and its DNS records stay with the team. You can see them under **Domains**.
3. Do not delete the API keys yet. The app has two (one per Supabase project) and they keep working.

If you move the DNS later (step 9), Resend's records move with the zone. Check that Resend still shows the domain as **Verified** afterwards.

**Rollback:** nothing to roll back; the old keys still work.

## 5. The Supabase deploy bot

CI redeploys the Edge Functions with a Supabase access token that belongs to a **separate bot account**, so it can only reach this one organization. Hand that over properly:

1. The new owner makes their own bot: a separate Supabase account (for example a `+deploy` alias of their email) invited to the organization as **Developer**.
2. Signed in as the bot, **Account → Access Tokens → Generate new token**, named `github-deploy`.
3. Keep it in the password manager. It is entered in step 10 when `env:github` asks.
4. Later, in step 12, remove your old bot from the organization.

**Rollback:** the old bot still works until you remove it.

## 6. Cloudflare

Cloudflare cannot move a Pages project from one account to another in a way we found documented. The reliable path is to **recreate the projects in the new account** and point the domain at them. The code lives in GitHub, so nothing is lost. Deploys are the only thing that moves.

1. In the new Cloudflare account, create the three Pages projects as the README shows:

   ```bash
   npx wrangler pages project create ward-desk-demo --production-branch main
   ```

   ```bash
   npx wrangler pages project create ward-desk-gp7 --production-branch gp7
   ```

   ```bash
   npx wrangler pages project create ward-desk-site --production-branch main
   ```

   The new owner runs these, signed in to wrangler with their own account (`npx wrangler login`).
2. In each new project open **Custom domains** and add `demo.warddesk.app`, `gp7.warddesk.app`, and `warddesk.app` with `www.warddesk.app`. A domain can only be attached to one project at a time, so the old project has to release it first. Expect a few minutes of the sites being unreachable while you swap each one, so do the training site first.
3. Create an **account-owned** API token: **Manage Account → Account API Tokens**, with only **Account → Cloudflare Pages → Edit**. Account-owned tokens survive the person who made them leaving. Keep it in the password manager.
4. Create the R2 bucket `ward-desk-backups` (no public access) in the new account, and its tokens: **Object Read & Write** limited to that bucket, for GitHub, and a second **Object Read** one for restores. Then copy the old backups across so the history is not lost. Use the S3-compatible API with any S3 tool, for example:

   ```bash
   aws s3 sync s3://ward-desk-backups ./old-backups --endpoint-url <old endpoint> --profile old
   ```

   ```bash
   aws s3 sync ./old-backups s3://ward-desk-backups --endpoint-url <new endpoint> --profile new
   ```

   The two profiles in `~/.aws/credentials` hold the old and new R2 tokens. The files are age-encrypted, so a local folder of them is safe to handle, but delete it afterwards.
5. Re-apply the expiry rules on the new bucket: `npm run backup:lifecycle -- production`. This needs a short-lived **Admin Read & Write** token on the bucket.
6. Update the GitHub repository variable `CLOUDFLARE_ACCOUNT_ID` and the secret `CLOUDFLARE_API_TOKEN`, and the R2 variables and secrets. `npm run env:github -- production` asks for each.
7. Trigger a deploy to each project (push to `main`, then `git push origin main:gp7`) and check the sites load.

**Rollback:** the old Pages projects still exist in your account until you delete them. Keep them for a week. If the new ones misbehave, remove the custom domains from the new projects and add them back to the old ones.

## 7. Google Cloud

This only matters if "Sign in with Google" is on.

1. In [console.cloud.google.com](https://console.cloud.google.com), select the `Ward Desk` project and open **IAM & Admin → IAM → Grant access**. Add the new owner with the **Owner** role.
2. They accept the invitation.
3. In **Google Auth Platform → Branding**, change the support email and developer contact to theirs.
4. Check the project is still **Published** (Audience page). In "Testing", only listed users can sign in.

If the project sits under a Workspace organization (the README warns against this), adding an outside Owner may be blocked. Then it is simpler to have the new owner create their own project and OAuth client, put the new client ID in `supabase/config.toml` (both `[remotes.*.auth.external.google]` blocks), and run `npm run env:auth -- production` and `-- staging`.

**Rollback:** remove the new owner from IAM. Nothing else changed.

## 8. Secrets and keys

Put these in the password manager, shared or handed over, and let the new owner confirm they can open each:

| Secret | Where it is used | Hand it over? |
|---|---|---|
| **Backup age private key** (`AGE-SECRET-KEY-…`) | Only to read backups | **Yes. Without it every backup is unreadable.** |
| R2 read-only token | Restores | Yes, or they make a new one |
| VAPID private key, one per environment | Push notifications | Yes, kept as is (see below) |
| Supabase database passwords | CI, backups | Yes, then rotate |
| Resend API keys | Sign-in email, alerts | Yes, then rotate |
| Cloudflare API token | Deploys | New one, step 6 |
| Supabase deploy bot token | Function deploys | New one, step 5 |
| `NOTIFY_SECRET` | Notify function and the database | Regenerated by `notify:setup` |
| Google client secret | Google sign-in | Rotate or recreate |

Do not rotate the VAPID keys unless they leaked. Changing a pair signs every device out of notifications and each person has to turn them on again. The scripts never replace an existing pair on purpose.

**How the age key travels:** the new owner can verify they hold the right one without exposing it. They can run `npm run backup:restore -- --identity <key file> --list` and then a full restore on a spare local database (step 11).

## 9. The domain

Do this last, once everything else works, because it cannot be quickly undone: a moved Cloudflare Registrar domain is transfer-locked for 30 days.

If the domain is registered at Cloudflare Registrar ([Cloudflare's guide](https://developers.cloudflare.com/registrar/account-options/inter-account-transfer/)):

1. The new owner adds `warddesk.app` as a site in their Cloudflare account and picks the Free plan.
2. In the old zone, **turn off DNSSEC** (and ask the new owner to do the same on the new zone).
3. In your account open **Domain Registration → Manage Domains → warddesk.app → Configuration → Start** and follow the prompts. The domain must be older than 10 days, not locked, and the registrant email must be verified.
4. The new owner gets an email and has **five days** to accept under **Domain Registration → Manage Domains → View actions**. If they do not, the request cancels.
5. Only WHOIS contacts move. **Do not assume DNS records or Pages domains came across.** In the new zone, re-create or import the records: the `CNAME`s for `demo`, `gp7`, `www` and the apex pointing at the Pages projects, the Resend records (`MX`, `TXT` for SPF and DKIM), and Google Search Console's `TXT` if you added one. Compare against the old zone's exported records.
6. Re-add the redirect rule `www.warddesk.app/*` → `https://warddesk.app/${1}` (301), and re-check the cache rule on the zone. After the move, re-enable DNSSEC if you used it.
7. Cloudflare's own zone-moving guide ([move a domain](https://developers.cloudflare.com/fundamentals/manage-domains/move-domain/)) says certificates do not come across. Universal SSL issues a new one within minutes.

If the domain is registered elsewhere, change the nameservers at that registrar to the new account's Cloudflare ones instead and use the zone-move steps from the same guide.

**There is no clean rollback.** Take a full export of the old zone's DNS records first, so the new zone can be rebuilt by hand if needed.

## 10. What the new owner must rotate afterwards

You still know every secret you ever handled. Rotate them once access is theirs:

| What | How |
|---|---|
| Supabase database passwords | Dashboard → Project Settings → Database → Reset password (letters and digits only, since it goes in a URL). Then `npm run env:github -- production` and `-- staging`, which rebuild the `SUPABASE_DB_URL` and `BACKUP_DB_URL_*` secrets |
| Deploy bot token | Step 5 |
| Cloudflare API token and R2 tokens | Steps 6 and 8. Revoke the old ones in the old account |
| Resend keys | Make new sending-only keys, then `npm run env:auth -- <env>` and `npm run alerts:setup -- <env>` ask for them |
| Google client secret | Google Auth Platform → Clients → the client → add a new secret, then `npm run env:auth -- <env>` |
| `NOTIFY_SECRET` | `npm run notify:setup -- staging`, then `-- production` |
| Backup age key (optional) | Make a new pair, change the `BACKUP_AGE_RECIPIENT` repository variable, keep the old key until the last backup made with it has expired (90 days) |
| GitHub personal access tokens you made | Revoke them |
| Alert emails | `npm run alerts:setup -- production --email <their address>`, and the same for staging |

## 11. Verify

All of this should be done by the **new owner**, on their machine, with their own sign-ins.

1. `npm run env:check -- production`, then `-- staging`. Every line should be ✓. Each ✗ prints the command that fixes it.
2. **Sign in.** Open the real site, sign in with their email link, and check their admin and bishopric access. Try Face ID or fingerprint too if they have it.
3. **Push.** On the Account page turn on notifications on one device, use **Show a test**, and send a request to yourself to check an instant notification arrives.
4. **Email.** Request a sign-in link and an alert: `npm run alerts:setup -- production` sends a test email. Confirm it arrives and is not in spam.
5. **Deploy.** Make a small change, push it to `main`, and check the training site updates. Then promote with `git push origin main:gp7` and check the real site.
6. **Backup.** Run `gh workflow run backup.yml`, wait for it to finish, and confirm `npm run env:check -- production` shows the backup ✓ (or `--list` the bucket).
7. **Restore drill.** Follow the quarterly drill in the README: `npm run backup:restore -- --identity <key file> --list`, then restore into local Supabase, sign in, spot-check data, and finish with `npm run db:reset`. This proves the new owner holds the age key and the read-only R2 token.
8. Check the **site** at https://warddesk.app and the docs load.

## 12. Remove your own access

Only now, and only after the new owner has said everything works:

1. Remove yourself from Supabase, Resend and Google Cloud (and demote or leave GitHub, if you stayed a collaborator).
2. Remove your old deploy bot and revoke its tokens, and revoke any R2 and Cloudflare tokens you made.
3. Remove your own admin entry in the app (on **Access**), once the new owner confirms.
4. Delete local copies: the age key file, `.env`, and any downloaded backups.

## If something fails

| If | Then |
|---|---|
| A deploy fails after the GitHub transfer | Open the run's log. The usual cause is a missing secret or variable. `npm run env:github -- <env>` re-fills them |
| Sign-in emails stop | The Resend key or domain was disturbed. `npm run env:check` shows the SMTP line. Re-run `npm run env:auth -- <env>` |
| Pages shows an error page after the domain move | The `CNAME` is missing or the custom domain is still attached to the old project |
| Notifications stop | `npm run env:check` shows the notify job's last answer. A `401` means run `npm run notify:setup -- <env>` again |
| Backups fail | The R2 variables point at the old account. Fix them with `env:github` |
| Nothing works and you need the old setup | Everything you left in place still works. Take the new owner's access away one service at a time |

## Handing over just one ward

Today each ward is its own deployment: its own Supabase project, Cloudflare Pages project, GitHub Environment and database. Shared between them are the repository, the Cloudflare account, the R2 bucket, the Resend domain and the Google client. So handing one ward to someone means **giving them their own copy of the shared parts** and moving only that ward's data.

The cleanest way:

1. **They fork** (or you transfer a copy of) the repository, so they own their code and CI. Their fork needs its own details in `supabase/config.toml` (see [Set up hosting](/docs/self-hosting/set-up-hosting/)).
2. **They create their own accounts** for Supabase, Cloudflare, Resend and, if wanted, Google, and follow the README setup for a single environment.
3. **Move the data.** Take a backup (the nightly one, or `pg_dump` by hand), and restore it into their new Supabase project with `pg_restore`. `npm run backup:restore` refuses anything but local Supabase on purpose, so this part is a manual step done after a drill. Migrations are in the backup (`supabase_migrations`), so check versions match.
4. **Domain.** If they keep a subdomain of yours (`gp7.warddesk.app`), they depend on you for DNS. A domain of their own is cleaner. **Changing the address breaks passkeys and push subscriptions**, because both are tied to the exact domain: everyone must turn on Face ID and notifications again, and the Google client's redirect addresses and the `[remotes.*.auth.webauthn]` values need updating.
5. **Cut over** in a quiet window: take a final backup, restore it, point the domain, and ask the ward to sign in again.
6. **Then remove** the ward from your own side: delete the project, the Pages project and the GitHub Environment, and tidy the bucket prefix (the lifecycle rules expire it in 30 to 90 days).

Because the backup holds `auth` users, **people keep their accounts**, but their sessions end.
