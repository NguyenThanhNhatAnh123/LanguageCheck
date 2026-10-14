# CI/CD on the Windows production server

Pushes to `main` run lint, type checking, unit tests and a production build on
GitHub-hosted Windows. Only a successful `main` run may deploy through the
`podqa-production` self-hosted runner. Pull requests never run on this server.
Concurrent deployments are serialized; a running deployment is not cancelled.

The production runner runs as a Windows service under the dedicated non-admin
`PodQADeploy` account. PodQA uses the same account. It can control only PodQA and
write release/backup/log/data directories. Repository write access and edits to
`main`/workflows must still be trusted because deployments run application code
and can read its configuration.
GitHub Actions and the runner use outbound connections; no incoming port is added.

`scripts/deploy-release.ps1` builds the exact verified commit in a new directory
under `F:\LanguageCheck\.local-setup\releases`. The app keeps running during build.
The release uses a protected copy of the canonical `.env.local` and a junction
to `data`, so secrets and live data stay on this server. For configuration or
password changes, update the canonical env file and run the workflow manually
to deploy a fresh snapshot. An urgent change must also update the active release's
env file (directory recorded in `current-release.json`) and restart `PodQA`.

After build, deployment stops PodQA, backs up SQLite, migrates the database,
switches the service directory, starts it, and checks local/public login plus
LanguageTool. A failed deployment after stopping restores the previous service
directory and pre-migration database. Deployment has a short maintenance interval.

Machine-local paths:

- Runtime and runner: `.local-setup/runtime`, `.local-setup/runner`
- Deployment history: GitHub Actions; `.local-setup/current-release.json`
- Database snapshots: `.local-setup/backups` (on the same drive; off-machine backups
  still need to be configured separately)
- Service logs: `.local-setup/logs/PodQA.log`, `.local-setup/LanguageTool.log`

Keep `.local-setup`, `.env.local` and `data` intact. Do not commit them or uploaded
mockups. Deployments do not run the paid Claude evaluation suite.

The older `scripts/deploy.ps1` is for manual in-place deployments only; use the
GitHub workflow for production releases. Changes in the root checkout are not
live until committed, pushed, and successfully deployed.
