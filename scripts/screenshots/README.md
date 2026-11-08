# Screenshots for the public site

`npm run screenshots` signs in to the real app as the invented `@ward.test` accounts from `supabase/seed.sql` and writes compressed WebP images, plus a manifest, to `site/src/assets/screens/`. Run it again whenever the UI changes.

## Run it

```bash
npm run db:start      # local Supabase with the seed loaded (shared with other worktrees)
npm run db:env        # writes .env, once per checkout
npm run screenshots
```

It starts its own Vite on port 5189. To use an app that is already running, set `CAPTURE_BASE_URL`. To capture only some features, pass words that match their names: `npm run screenshots -- home settings`.

Playwright needs its browser once: `npx playwright install chromium`.

| Variable | Default | Meaning |
|---|---|---|
| `CAPTURE_BASE_URL` | starts Vite | App to capture |
| `CAPTURE_PORT` | `5189` | Port for the Vite it starts |
| `CAPTURE_NOW` | `2026-11-01T07:30:00-07:00` | The frozen clock. The seed is dated around this Sunday, so Home, the agendas and appointments are full |
| `CAPTURE_OUT` | `site/src/assets/screens` | Output folder |

## What it makes

Each feature is captured as phone (390×844 at 3×) and desktop (1440×900 at 2×), in light and dark: `<feature>-<phone|desktop>-<light|dark>.webp`. `manifest.json` lists each feature's route, role, caption and variants. The folder is about 8 MB.

- Shots and roles are listed in `shots.ts`. Add a line there to add a shot.
- The time is frozen with Playwright's clock; dark mode uses `prefers-color-scheme`.
- The training banner and install prompt are hidden by injected CSS and storage flags, not app changes.
- The seed has no requests, so the script adds a few example requests and calling requests, then deletes them when it finishes (even after an error). It never submits the booking form.
- It refuses to run unless Supabase is local.

## Not captured

- A separate setup-checklist shot: the checklist shows on Home (`home-bishop`, `home-secretary`) and at the top of Settings (`settings`).
- Notifications turned on: headless Chromium reports notifications as blocked, so `settings-notifications` shows the per-notification choices below that notice instead.
