# AGENTS.md

Guidance for AI coding agents (and humans) working in this repo. See [README.md](README.md) for what the app does and how to set it up.

## Commits

**Every commit must follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).**

```
<type>(<optional scope>): <description>

<optional body>

<optional footer(s)>
```

- **Description:** imperative mood, lowercase first letter, no trailing period, about 72 characters max. For example, `fix(agenda): keep resolved items visible on the day they close`.
- **Body:** explain *why*, not just what. Wrap at 72 columns. Leave a blank line after the subject.
- **Breaking changes:** add `!` after the type or scope (`feat(db)!: ...`) **and** a `BREAKING CHANGE: <what and how to migrate>` footer.
- Keep each commit to one logical change. Don't mix a refactor with a feature.

### Types

| Type | Use for |
|------|---------|
| `feat` | A new user-facing capability |
| `fix` | A bug fix |
| `refactor` | A code change that neither fixes a bug nor adds a feature |
| `perf` | A performance improvement |
| `test` | Adding or correcting tests only |
| `docs` | Documentation only (README, AGENTS.md, comments) |
| `style` | Formatting only, no change in behavior |
| `build` | Dependencies, Vite/TypeScript config, the PWA manifest |
| `ci` | CI configuration |
| `chore` | Maintenance that fits nothing above |
| `revert` | Reverting an earlier commit (reference its hash in the body) |

### Scopes

Optional, but use one when the change is confined to an area:

`sacrament`, `agenda`, `callings`, `away`, `schedule`, `suggest`, `auth`, `db` (migrations, RLS, seed), `ui` (theme, shared components), `pwa`, `deps`.

### Examples

```
feat(callings): show suggester submissions on the agenda
fix(db): match allowlist emails case-insensitively
test(agenda): cover items resolved on the meeting date
build(deps): upgrade @mui/material to 9.6
feat(db)!: split interviews out of calling candidates

BREAKING CHANGE: interviews.candidate_id is removed; run
`npm run db:reset` locally and regenerate types.
```

## Before committing

Run these and make sure they pass:

```bash
npm run lint && npx tsc -b && npm run test:all
```

`test:all` needs local Supabase running (`npm run db:start`).

## Project conventions

- **Data must stay private.** Never commit real member names or data. The seed, fixtures and tests use invented names only. Keep notification text generic.
- **Access rules live in the database.** Every new table needs RLS policies in a migration plus pgTAP coverage in `supabase/tests/database/`. The UI checks in `src/lib/access.ts` only decide what to show.
- **Schema changes:** add a new file with `npx supabase migration new <name>` and never edit a migration that has already been applied anywhere shared. Then run `npm run db:reset` and `npm run db:types`.
- **Database access** goes through `src/lib/queries.ts`, with functions that take the client as a parameter so integration tests can call them as any role.
- **Pure logic** (dates, schedule rules, agenda assembly) lives in `src/lib/` with unit tests next to it.
- **UI** uses MUI with the theme in `src/theme.ts`. Support both light and dark modes (use theme tokens like `text.secondary` and `divider`, never hard-coded colors). Use native selects (`slotProps={nativeSelect}`) for dropdowns, and check layouts at phone width.
- **Node** version is pinned in `.nvmrc`. Run `nvm use` first.

## Branching and PRs

The app is not live and there is one developer, so **do not open pull requests**. Commit directly to `main` (or a short-lived branch merged straight in) and push. Revisit this when the app goes live or a second developer joins.

## CI

CI (`.github/workflows/ci.yml`) runs on every push. Check it with `gh run list` and fix failures before moving on.

**Which jobs run is decided by the files changed, not the commit type.** A `docs:` commit can still touch code, and paths cannot be wrong. Don't use `[skip ci]`.

| Changed files | `guard` (no tracked `.env`) | `check` (lint, build, unit tests) | `database` (Supabase, pgTAP, integration) |
|---|---|---|---|
| Only `*.md`, `.claude/**`, `.gitignore`, `.env.example`, `public/**` | runs | skipped | skipped |
| `src/**` (UI, pages, components, tests) | runs | **runs** | skipped |
| `src/lib/**` (queries, types, access, `supabase.ts`) | runs | **runs** | **runs** |
| `supabase/**`, `tests/integration/**` | runs | skipped | **runs** |
| `package.json`, `package-lock.json`, `.nvmrc`, `tsconfig*.json`, `vite.config.ts`, `.oxlintrc.json`, `index.html`, `scripts/**`, `.github/workflows/**` | runs | **runs** | **runs** |

- `src/lib/**` also runs `database` because the integration tests call `queries.ts` and `database.types.ts` as real roles.
- A commit that mixes docs and code runs whatever the code needs. A multi-commit push is judged on the whole push.
- Skipped jobs show as "skipped" in the Actions tab. That is expected, not a failure.
- To run everything on demand: `gh workflow run ci.yml`.
- When you add a new top-level folder or config file that affects the build or tests, add its path to the filters in the `changes` job, or CI will skip checks it should run. Keep this table in sync.
