---
title: "Set up hosting"
description: "Create the Supabase and Cloudflare projects, then use the environment commands."
sidebar:
  order: 3
---

A hosted copy is two cloud projects: **Supabase** for the data and sign-in, **Cloudflare Pages** for the app. A script fills in the dozens of settings between them.

The README shows two environments, a training site and a real one. A single ward can start with just the real one, or use two to try changes safely first.

## 1. Create the projects

1. **Supabase**: create a project. Leave the Data API and "Automatically expose new tables" on, and turn on automatic row level security. Use a database password of letters and digits only.
2. **Resend**: add your domain and let it set up the DNS records. Make a sending-only API key for the project. Supabase's built-in sender only reaches project team members, so you need this for sign-in emails.
3. **Supabase Auth**: in the dashboard, turn on passkeys for your site's address (the relying party), and keep the email wording generic, with no names.
4. **Cloudflare Pages**: create a Direct Upload project, then add your domain under Custom domains:

```bash
npx wrangler pages project create ward-desk --production-branch main
```

   Make an API token with only **Account → Cloudflare Pages → Edit**.
5. **A deploy account for Supabase**: CI needs a Supabase access token to redeploy the background functions. Don't use your own personal token, since it can reach every project you own. Use a separate Supabase account with access only to the ward's project.

Sign in to both CLIs once on your machine with your own account: `gh auth login` and `npx supabase login`.

## 2. Run the environment commands

Run each for your environment (the README names them `staging` and `production`):

```bash
npm run env:github -- production
```

Fills the GitHub environment: the Supabase project, keys, Pages project, ward name, time zone and notification keys. It shows what it will change and asks first.

```bash
npm run env:auth -- production
```

Applies the sign-in settings (site URL, redirects, Resend email) from `supabase/config.toml`. Edit settings there, never in the dashboard.

Then turn deploys on and push your code:

```bash
gh variable set DEPLOY_ENABLED --body true
```

Each deploy applies the database migrations and publishes the app. When you are ready:

```bash
npm run notify:setup -- production
```

```bash
npm run alerts:setup -- production
```

The first starts notifications; the second turns on alert emails if something breaks.

## 3. Add yourself as admin

Sign-in is refused for any email not on the list, so add yourself first:

```bash
npm run admin:add -- production you@example.com
```

## 4. Check everything

```bash
npm run env:check -- production
```

It checks every setting without changing anything and shows the command that fixes each problem.

## Keep migrations safe

A deploy applies database migrations and then publishes the frontend, so a migration must keep working with the frontend that is still live. Add columns before using them; remove them only after nothing uses them.

## Details

The full, step-by-step version, including the table of every setting, is the **Deploying** section of the [README](https://github.com/rhartleyC4/ward-desk#readme).
