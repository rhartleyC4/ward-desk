# Contributing

Issues and pull requests are welcome. This is a small project maintained in spare time, so **no support is promised**: there is no guaranteed response time, and a pull request may be declined or left open.

- **Setup and how the app works:** see [README.md](README.md).
- **Commits:** follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), with the types and scopes in [AGENTS.md](AGENTS.md). Keep each commit to one logical change.
- **Before you open a PR:** run `npm run lint && npx tsc -b && npm run test:all` (`test:all` needs local Supabase: `npm run db:start`). New tables need row-level security policies and pgTAP tests.
- **Never include real member data.** No real names, emails, phone numbers or addresses in code, seed data, fixtures, tests, screenshots, issues or PRs. Use invented names only.
- **Security problems:** don't file a public issue. See [SECURITY.md](SECURITY.md).
- **License:** by submitting a contribution you agree it is licensed under the [Apache License 2.0](LICENSE), as described in section 5 of that license.
