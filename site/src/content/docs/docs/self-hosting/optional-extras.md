---
title: "Optional extras"
description: "Google sign-in, notifications, alert emails and nightly encrypted backups."
sidebar:
  order: 4
---

None of these are required, but backups and alerts are strongly recommended for a real ward.

## Google sign-in

Email links work without it. With Google, most people never wait for an email.

- Create a Google Cloud project with a personal account (not a work account), name it, and set the audience to **External**.
- Allow only the basic sign-in scopes (`openid`, email and profile), which need no Google verification. **Publish** the app, or only listed test users can sign in.
- Create a web OAuth client with your site's address as an origin and your Supabase project's `/auth/v1/callback` as the redirect.
- Put the client ID in `supabase/config.toml`, run `npm run env:auth`, and set `ENABLE_GOOGLE` to `true`. Re-run the latest deploy.

The allowlist still applies: a Google account that isn't on it is refused.

## Notifications

`npm run env:github` makes a key pair for notifications. `npm run notify:setup` deploys the functions and starts the 10-minute schedule that sends the day-ahead summary and the rest. On iPhone, people must install the app to their Home Screen first. See [Notifications](/docs/settings/notifications/).

## Health checks and alert emails

Errors in the app are collected, and every hour the database checks for failed jobs and missing backups. If something is wrong, `alerts:setup` makes it email the person you choose, with counts and where to look, never names or error text.

## Nightly backups

A scheduled job dumps the database every night, encrypts it with [age](https://age-encryption.org) and stores it in a Cloudflare R2 bucket. The private key lives only in your password manager. Without it, the backups can't be read, so it is the one thing not to lose.

Dailies expire after 30 days and monthlies after 90, and `npm run backup:lifecycle` applies this. `npm run backup:restore` restores into a local database so you can check them. Do a restore drill once a quarter.

## Details

See "Google sign-in", "Notifications", "Health checks and alerts" and "Backups and restore" in the [README](https://github.com/rhartleyC4/ward-desk#readme).
