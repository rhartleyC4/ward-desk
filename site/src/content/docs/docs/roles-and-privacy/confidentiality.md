---
title: "How confidentiality is enforced"
description: "Access rules are enforced in the database, so hiding a button is never the only protection."
sidebar:
  order: 2
---

Callings and interviews are sensitive. Ward Desk is built so that nobody can see them by accident, and nobody can see them on purpose without the right role.

## Rules live in the database

Ward Desk keeps its data in a Postgres database (on Supabase). Every table has **row level security** (RLS) rules written into the database itself. They say which rows each signed-in person may read or change. The app asks the database for data, and the database answers only with what that person is allowed to see.

The screens do also hide things you can't use, to keep them tidy. But that is only for convenience: if someone tampered with the app to ask for something they shouldn't have, the database would still refuse.

## What that means in practice

- **Calling proposals** (names, statuses, decisions) can be read only by people with the bishopric role. A ward leader can send a calling request, and follows its progress through a special lookup that returns only the stage (sent, received, being worked on, finished). It never returns names or decisions.
- **Interviews and appointments** can be read only by the bishopric. They are not on any agenda.
- **Agendas** follow attendance: the bishopric sees all of them, everyone else only the meetings they are listed for.
- **Requests** can be read by the person who sent one and the person asked. A request between two bishopric members can be read by the whole bishopric.
- **Meeting assignments** (prayers and spiritual thoughts) can be read by the meeting's attendees and the person asked.
- **Who can sign in**, and anyone's roles, can be changed only by an admin. People can change their own name and nothing else about their profile: not their email, and not their position.
- **Error reports** (technical problems from the app) can be read only by admins.

- **Mentoring** is limited by the database: a mentor acts as the new bishop only until the last day, never as admin, and calling discussions stay hidden unless the new bishop allows them. See [Mentoring](/docs/leadership-changes/mentoring/).

## Tested, not just trusted

Every rule has automated tests that sign in as each role and check what they can and can't read or change. A new table can't be added without its rules and tests.

## Sign-in is invite-only

Only email addresses an admin has added can sign in, whether by email link, Google or Face ID. Removing an address ends access right away. Deleting an account removes the person's sign-in and personal data. See [Who can sign in](/docs/settings/who-can-sign-in/).

## Honest limits

- Anyone with the bishopric role can see everything the bishopric can, so give that role only to people who should have it.
- An admin of a self-hosted copy can also reach the database directly. Whoever runs a ward's copy is trusted with its data. See [Running it for your ward](/docs/self-hosting/).
- Ward Desk is not a Church system, and the Church has no access to it.
