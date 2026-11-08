---
title: "Keep it running and hand it over"
description: "Updates, privacy responsibilities and passing the app to a successor."
sidebar:
  order: 5
---

## Your responsibilities

If you run a copy for your ward, you (or whoever you hand it to) are responsible for:

- **The data.** Only invite people who need access, and give the right roles. Remove people when they are released. Never copy real data to a demo or practice site.
- **Backups.** Check that the nightly backup runs and do a restore drill each quarter.
- **Security and updates.** Update the code and the services you use.
- **Privacy.** Your members' names are in your copy. Follow your ward's and the Church's guidance on third-party tools.

There is **no support**. The software is provided as is. You are free to read and change the code (Apache-2.0), but nobody is obliged to help you with it.

## Updates

New versions are changes to the code. Pull them into your copy and push. Deploys apply the database migrations first, then publish the app. Look at the checks after a deploy: `npm run env:check -- production` should show all ✓.

## Free-tier pausing

A free Supabase project pauses after about a week without use. A scheduled job pings it to keep it awake. If it ever pauses, restore it from the Supabase dashboard.

## Handing it over

Callings change, so plan for a successor. In order:

1. Add the successor as admin: `npm run admin:add -- production <their email>`
2. Transfer or share the Supabase organization and project.
3. Make them an owner of the Google Cloud project, if you use Google sign-in.
4. Transfer the Cloudflare Pages projects and the GitHub repository.
5. Invite them to the Resend team.
6. Transfer the domain.
7. Hand over secrets through a password manager, including the backup key.
8. Send alert emails to them.
9. Check they can sign in, see the right data and get a test notification.
10. Remove your own admin access.

## Details

See "Maintenance notes" and "Handoff checklist" in the [README](https://github.com/ward-desk/ward-desk#readme).
