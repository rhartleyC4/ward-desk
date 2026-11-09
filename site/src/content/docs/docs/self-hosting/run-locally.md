---
title: "Run it on your computer"
description: "Start the whole app locally with invented practice data."
sidebar:
  order: 2
---

Try everything on your own computer before you set up hosting. Nothing leaves your machine.

## What you need

- [Docker](https://www.docker.com/) (OrbStack or Docker Desktop), for a local copy of the database.
- [nvm](https://github.com/nvm-sh/nvm) for the right Node.js version.
- A copy of the code: `git clone https://github.com/rhartleyC4/ward-desk`

## Steps

In the folder you cloned:

```bash
nvm use
```

```bash
npm run setup
```

`setup` checks Node and Docker, installs packages, starts the local database (loading the practice data), asks for your ward's name (shown in the header and as the installed app's name), writes your local settings, and checks the result. Running it again is safe.

Then start the app:

```bash
npm run dev
```

Open <http://localhost:5173>.

## Sign in locally

Use one of the practice accounts (`bishop@`, `first@`, `second@`, `secretary@`, `clerk@` or `leader@ward.test`) with the practice password from the seed file, or open the magic link in the local mailbox at <http://127.0.0.1:54324>. The practice accounts are the same ones described on [Try the demo](/docs/getting-started/try-the-demo/).

## Never commit `.env`

Settings files hold secrets and stay on your machine. Never commit real member data.

## Details

See "Setup" and "Tests" in the [README](https://github.com/rhartleyC4/ward-desk#readme).
