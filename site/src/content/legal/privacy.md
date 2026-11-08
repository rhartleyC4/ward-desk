---
title: Privacy Policy
description: What Ward Desk stores, who can see it, where it lives and how long it is kept.
lastUpdated: 2026-11-06
---

<!-- DRAFT for the owner's review. Not legal advice. Have it checked before publishing. Every factual claim is listed with its source in README.md in this folder. -->

This policy explains what personal information Ward Desk handles and why. It is written to be read in a few minutes.

## Who runs Ward Desk

Ward Desk is a free, open-source app for ward administration. It is run by one person, Ryan Hartley ("I", "me"), as a personal project. There is no company behind it.

This policy covers:

- this website, **warddesk.app**
- the ward copy I host at **gp7.warddesk.app**
- the public demo at **demo.warddesk.app**, which holds invented practice data only (see "The demo" below)

**Contact:** privacy@warddesk.app <!-- PLACEHOLDER: confirm this address exists and is monitored, or replace it. -->

## Not affiliated with the Church

Ward Desk is an independent project. It is **not** made, endorsed or supported by The Church of Jesus Christ of Latter-day Saints. It is not connected to any Church system, and it does not read from or send anything to Church records. Information you put in Ward Desk stays in Ward Desk.

## Other wards' copies

Ward Desk is open source, so other wards can run their own copy. If you use a copy at any other address, the people who run that copy are responsible for it and for the data in it. This policy does not apply to them, and I have no access to their data. Ask them for their own policy.

## This website

warddesk.app (the overview and docs) does not use analytics, tracking or advertising, and sets no cookies. <!-- CHECK before publishing: still true of the finished site? --> Like any website, the hosting provider (Cloudflare) briefly processes your IP address and browser details to deliver pages and block attacks.

## The demo

**demo.warddesk.app** is a public practice copy. It holds only invented names and data, and anyone may sign in with the practice accounts listed on its sign-in page. It is reset from time to time, which wipes everything entered since the last reset.

**Never type real member information into the demo.** Anything entered there can be seen by anyone else using it until the next reset. The rest of this policy is about the real ward copy; for the demo, the only personal information involved is the technical details every website sees (see "This website") and any error reports.

## Invite-only

Nobody can sign up. An administrator in your ward adds your email address to an invite list, and only listed addresses can sign in. Removing your address takes away your access.

## What the app stores and why

The app stores only what the ward's leaders need to do their work.

**About you, as a user**

- **Your email address and name**, to sign you in and show who did what. If you sign in with Google, Google gives the app your name and email address.
- **Your role and position** (for example, bishopric or ward leader, and an office such as first counselor), to decide what you can see and do.
- **Sign-in records** kept by our sign-in provider: sessions, the passkeys you add for Face ID or fingerprint sign-in (the public part only; your fingerprint or face never leaves your device), and technical details such as IP address and browser.
- **Your notification settings and devices**: which notifications you turned off, and for each device where you turned notifications on, the address the browser's push service gave it.
- **Your away dates** and, if you are the bishop or a counselor, your **appointment hours**.
- **Your work in the app**: requests you send or answer and your replies, meeting assignments (such as a prayer) you accept or decline and any reason you give, agenda items you add, appointments you book or report on, and similar records.

**About other ward members** (who are usually not users)

Leaders type in names as part of ward business, for example:

- speakers and prayers for sacrament meeting, and names on agendas and the prayer roll
- names considered for callings, people being released, and notes about them
- people who need an appointment, its kind (for example a temple recommend or youth interview), its time, and short notes about how it went
- for a youth under 18, a parent's name, so messages go to the parent

The app does **not** store phone numbers, home addresses, birthdates, membership record numbers or photos. Messages to members are copied or opened in your own phone's messaging app; the app does not send them and does not keep the recipient.

Because the app is for a congregation, using it shows that someone is connected with the Church. Some records (such as interview types) relate to religious life. Please enter only what is needed and keep notes short and factual.

## Who can see what

Access is enforced by rules in the database itself, not only by what the screens show:

- **Calling discussions are confidential.** Names considered for callings, their status and notes are visible only to the bishopric (the bishop, counselors, executive secretaries and ward clerk). Ward leaders who ask for a calling change can see how far along their request is, never names or decisions.
- **Appointments** are visible only to the bishopric.
- **Requests** are visible to the person who sent them and the person asked. A request between two bishopric members can be read by the whole bishopric.
- **Meeting agendas** are visible to the bishopric and to people listed as attending that meeting.
- **Meeting assignments** (who gives a prayer or spiritual thought, and their answer) are visible to that meeting's attendees and the person asked.
- **Sacrament meeting plans, away dates and the standing schedule** are visible to everyone with access to the app.
- **Error reports** are visible only to administrators.

Administrators can manage who has access. I, as the person who runs the service, can technically access the database to keep it running, fix problems and restore backups. I do not look at ward records unless that is needed for those purposes.

## Notifications

Notifications can show on a locked screen, so they are kept general. They say **when** and **how many**, or name an office ("The bishop asked you to do something"). They never include a member's name, what was asked, or what an appointment is for.

To deliver a notification, the app sends it to your browser's push service (Apple, Google or Mozilla, depending on your device). Those services see the notification and your device's push address.

## Emails

Sign-in links and occasional service alerts are sent by email. Sign-in emails go to your address and contain no ward information. Alert emails go only to the person running the service and contain counts and where to look, never names or error text.

## Error reports

When the app hits an error, it records the error message, the page address (without anything after a "?"), the app version, your browser type and, if you are signed in, your user ID. It never records what was on the page. Error reports are deleted automatically after **90 days**.

## Service providers and where data is stored

I use these providers to run the service. Each handles data only to provide its service.

| Provider | What it does | What it handles |
|---|---|---|
| Supabase | Database, sign-in, server functions | All app data and sign-in records |
| Cloudflare | Hosting, network, encrypted backup storage (R2), domain | Web requests (IP address, browser); encrypted backups |
| Resend | Sending email | Your email address and the sign-in email |
| Google (optional) | "Sign in with Google" | Your Google sign-in, if you choose it |
| Apple, Google, Mozilla push services | Delivering notifications | Notification text and device push address |
| GitHub | Code hosting and scheduled jobs, including the nightly backup job | The backup passes through a GitHub-run job already encrypted; nothing is stored there |

The database is hosted by Supabase in [REGION]. <!-- PLACEHOLDER: fill in the Supabase project region (e.g. "the United States (us-west-1)"). --> Providers may process data in other countries under their own terms.

I do not sell personal information, share it for advertising, or use it to train AI.

## How long data is kept

- **Ward records** (agendas, callings, appointments, requests, sacrament plans) are kept until someone in the ward deletes them, so past meetings can be looked back on. Leaders should delete records that are no longer needed, such as calling discussions once a decision is final.
- **Error reports**: 90 days.
- **Notification bookkeeping**: change notices waiting to be sent are deleted 7 days after they are sent. A log of which day-ahead and reminder notifications went to whom is kept so none is sent twice. <!-- OWNER: no automatic deletion yet for notification_log or push_events. See README.md. -->
- **Device push addresses** are deleted when the push service says the device is gone, or when you turn notifications off.
- **Accounts:** removing someone from the invite list ends their access right away. Their name stays on records they took part in, so the ward's history makes sense. To have your account and sign-in details deleted, ask (see "Your choices and rights").

## Backups

Every night the database is copied, encrypted, and stored in Cloudflare R2, separately from the main database. Only I hold the key to decrypt it. Daily backups are deleted after **31 days**, and one backup per month is kept for **366 days**. This means something deleted from the app can remain in an encrypted backup for up to about a year, until that backup expires. Backups are only used to recover from a failure.

## Cookies and storage on your device

The app does not use advertising or tracking cookies, and no analytics. It stores a few things in your browser so it works:

- your sign-in session, so you stay signed in
- your light or dark mode choice
- whether you dismissed the "install the app" hint, or chose to set up Face ID or fingerprint sign-in on this device
- on the demo, whether you hid its banner
- the app's own files, so it opens quickly and can show notifications

Signing out ends your session. Clearing your browser's site data removes the rest.

## Children

Ward Desk is meant for adult ward leaders. Accounts are added only by a ward administrator, and the app does not ask for anyone's age. Youth under 18 may be named in ward records, for example as a speaker or for a youth interview. For youth appointments, the app is designed so messages go to a parent, and it keeps only the parent's name, never a birthdate or phone number.

If you believe a child's information should be removed, contact your ward's bishopric or me.

## Your choices and rights

You can:

- see the information about you in the app, and ask your ward's administrator to correct your name or role
- turn any kind of notification off, on each device or for all of them
- remove your passkeys and devices from your Account page
- ask for a copy of your information, or for it to be corrected or deleted

Most records about you were entered by your ward's leaders as part of ward business. For those, it is usually best to speak to your bishopric first. For anything else, email privacy@warddesk.app. I will reply within 30 days. Depending on where you live, you may also have the right to complain to a data protection authority.

## Security

Data is sent over encrypted connections. Access is checked by the database on every request. Backups are encrypted. Notifications and emails leave out names. No system is perfectly secure, so please keep your sign-in methods to yourself and tell me if you think something has gone wrong.

## Changes to this policy

If this policy changes, I will update the date at the top. If the change matters (for example, a new provider or a new kind of data), I will also say so in the app or on this site before it takes effect.
