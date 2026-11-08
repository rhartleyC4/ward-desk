---
title: "Keep it running"
description: "Updates and your responsibilities."
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

## Free tiers, handover and more wards

See [Services used and free-tier capacity](/docs/operations/services/), [Handing the accounts to a new owner](/docs/operations/handover/) and [Adding another ward](/docs/operations/new-ward/).
