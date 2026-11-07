# Security

Ward Desk is provided **as is**, without warranty of any kind (see [LICENSE](LICENSE)). The maintainer is one person working on it in spare time, so there is no guaranteed response time and no promise that a report will be fixed.

## Reporting a vulnerability

Please report privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** (a private security advisory). Don't open a public issue or pull request for a vulnerability.

Include what you found, how to reproduce it, and which version or commit you tested. Never include real member data in a report.

## If you run a copy

Each ward or person running its own copy is responsible for its own deployment, its Supabase project, its secrets and its data. Keep your copy up to date, keep service-role keys and VAPID private keys out of the repo, and rely on the row-level security policies in `supabase/migrations/` rather than the UI checks.
