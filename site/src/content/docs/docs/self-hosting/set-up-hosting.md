---
title: "Set up hosting"
description: "Fork the repository, create your own accounts, then use the environment commands."
sidebar:
  order: 3
---

Your ward's copy is a **fork of the repository** plus **accounts of your own**: Supabase for the data and sign-in, Cloudflare Pages for the app, and Resend for email. Nothing is shared with the hosted copy at warddesk.app. A script fills in the dozens of settings between them.

Most wards need only the real site (`production`). A training site (`staging`) is a second Supabase project and a second Pages project, for trying changes safely first.

## 1. Fork the repository

Sign in to both command-line tools with your own account:

```bash
gh auth login
```

```bash
npx supabase login
```

Then, in the folder you cloned to [run it on your computer](/docs/self-hosting/run-locally/), make your fork. This makes your fork `origin` and the original repository `upstream`, which is where updates come from:

```bash
gh repo fork --remote
```

`gh` now points at the original repository, so tell it to use yours. The setup commands read and write whichever one it points at:

```bash
gh repo set-default YOUR-GITHUB-NAME/ward-desk
```

On GitHub, open your fork's **Actions** tab and enable workflows. Forks start with them off, and deploys and backups need them.

A fork of a public repository is public too. That is fine, because settings and member data never go in the code. Keep it that way.

## 2. Choose your address

- **Your own domain**, such as `ward.example.org`. You manage its DNS yourself.
- **A subdomain of warddesk.app**, such as `gp1.warddesk.app`. The Ward Desk maintainer may add the DNS records for you if you [open an issue](https://github.com/rhartleyC4/ward-desk/issues). That is the only part the project plays: the accounts, the code and the data stay yours.

Choose one you can keep. Passkeys and notifications are tied to the exact address, so if it changes, everyone has to set them up again.

## 3. Create your accounts and projects

1. **Supabase**: create a project. Leave the Data API and "Automatically expose new tables" on, and turn on automatic row level security. Use a database password of letters and digits only.
2. **Resend**: add your domain and make a sending-only API key for the project. Supabase's built-in sender only reaches project team members, so you need this for sign-in emails. On a warddesk.app subdomain, add the subdomain itself and keep the DNS records Resend lists.
3. **Supabase Auth**: in the dashboard, turn on passkeys for your site's address (the relying party), and keep the email wording generic, with no names.
4. **Cloudflare Pages**: create a Direct Upload project, then add your address under Custom domains:

   ```bash
   npx wrangler pages project create ward-desk --production-branch gp7
   ```

   The production branch has to be `gp7`, the branch the real site deploys from. With any other branch, deploys land as previews and your address never updates. For a training site, create a second project with `--production-branch main`.

   Make an API token with only **Account → Cloudflare Pages → Edit**.
5. **A deploy account for Supabase**: CI needs a Supabase access token to redeploy the background functions. Don't use your own personal token, since it can reach every project you own. Use a separate Supabase account with access only to the ward's project.

On a warddesk.app subdomain, send the maintainer Resend's DNS records and the `.pages.dev` target Cloudflare shows for your custom domain. These are not secret, and no key or password is needed. Carry on once Cloudflare shows the domain as active and Resend shows it as verified.

## 4. Put your details in the config

`supabase/config.toml` ships with the original project's details. The setup commands read them, so replace them first and commit the file. In the `[remotes.production]` blocks (and `[remotes.staging]` if you have a training site):

| Setting | Change it to |
|---|---|
| `project_id` | Your Supabase project's reference |
| `site_url`, `additional_redirect_urls` | Your site's address, such as `https://ward.example.org` |
| `admin_email` | The address sign-in emails come from, on the domain you added to Resend |
| `rp_id`, `rp_origins` | Your site's host name, and its full address |
| `enabled` under `auth.external.google` | `false`, unless you set up [Google sign-in](/docs/self-hosting/optional-extras/) with your own client ID |

## 5. Run the environment commands

Run each for your environment (`production`, and `staging` if you have a training site):

```bash
npm run env:github -- production
```

Fills the GitHub environment on your fork: the Supabase project, keys, Pages project, ward name, time zone and notification keys. It shows what it will change and asks first.

```bash
npm run env:auth -- production
```

Applies the sign-in settings (site URL, redirects, Resend email) from `supabase/config.toml`. Edit settings there, never in the dashboard.

Then turn deploys on and push your config:

```bash
gh variable set DEPLOY_ENABLED --body true
```

```bash
git push origin main
```

`main` deploys the training site if you have one. The real site deploys from `gp7` and only accepts commits already on `main`, so promote them to it:

```bash
git push origin main:gp7
```

If you set up only `production`, the `staging` deploy that runs on each push to `main` fails because it has no settings. The real site isn't affected.

Each deploy applies the database migrations and publishes the app. When you are ready:

```bash
npm run notify:setup -- production
```

```bash
npm run alerts:setup -- production
```

The first starts notifications; the second turns on alert emails if something breaks.

## 6. Add yourself as admin

Sign-in is refused for any email not on the list, so add yourself first:

```bash
npm run admin:add -- production you@example.com
```

## 7. Check everything

```bash
npm run env:check -- production
```

It checks every setting without changing anything and shows the command that fixes each problem. Backups show as problems until you set up [nightly backups](/docs/self-hosting/optional-extras/).

## Keep migrations safe

A deploy applies database migrations and then publishes the frontend, so a migration must keep working with the frontend that is still live. Add columns before using them; remove them only after nothing uses them.

## Details

The full, step-by-step version, including the table of every setting, is the **Deploying** section of the [README](https://github.com/rhartleyC4/ward-desk#readme). It describes the original project's two sites, so use your own names and addresses.
