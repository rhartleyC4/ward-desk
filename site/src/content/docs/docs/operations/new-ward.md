---
title: Adding a new ward
description: Another ward runs its own fork and accounts. This project only adds its DNS records under warddesk.app.
---

Another ward runs Ward Desk from **its own fork of the repository, with its own accounts** for GitHub, Supabase, Cloudflare and Resend. It follows [Set up hosting](/docs/self-hosting/set-up-hosting/). Nothing about that ward goes in this repository, and none of its keys or data come to this project.

The maintainer's only job is giving the ward an address, if it wants one under `warddesk.app`. A ward with its own domain needs nothing from this project.

## Who does what

| | The ward | The maintainer |
|---|---|---|
| Code and deploys | Its own fork, with its own settings and secrets | Nothing |
| Database, sign-in, email, hosting | Its own accounts, and its own costs | Nothing |
| Backups, alerts, updates | Its own | Nothing |
| The address | Asks for one, and sends the DNS records | Adds the records in the `warddesk.app` zone |

## Adding the DNS records

1. **Agree the address**, such as `gp1.warddesk.app`, and don't reuse one. Passkeys and notifications are tied to the exact address, so changing it later means everyone sets them up again.
2. **The ward sends the records** once it has added the address to its Pages project and to Resend: the `.pages.dev` target from Cloudflare, and the list from Resend. These are not secret. Never ask for a key or password, since DNS doesn't need one.
3. **Add them in Cloudflare**, under the `warddesk.app` zone:

   | Type | Name | Value | Proxy |
   |---|---|---|---|
   | `CNAME` | `gp1` | The ward's `.pages.dev` target | DNS only |
   | As Resend lists them | As Resend lists them | As Resend lists them | DNS only |

   Keep the site's record **DNS only**. The ward's Pages project is in a different Cloudflare account from this zone, and DNS only also keeps it clear of the zone's cache rules.
4. **Check** that the domain shows as active in the ward's Pages project and verified in its Resend account. The ward can then carry on with the setup.

## Afterwards

The ward depends on this zone for as long as it uses the address. Don't delete or change its records without agreeing it first, because its site and sign-in emails stop working. If `warddesk.app` is handed over, the records need to move with it (see [Handing the project to a new owner](/docs/operations/handover/)).

If a ward moves to its own domain or stops using Ward Desk, remove its records once it confirms it no longer needs them.
