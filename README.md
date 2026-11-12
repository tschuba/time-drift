# Time Drift

Personal working-hours tracker (replaces an Excel "Zeitkonto"). Log clock-in/out blocks and breaks per day, compare against target hours, and follow the running over/under-hours saldo. Single user; authentication is handled externally (Authentik via Traefik).

## Stack

Node 24 · [Hono](https://hono.dev) (JSX) · [HTMX](https://htmx.org) · Tailwind 4 + daisyUI · PostgreSQL 16 · Drizzle ORM · Vitest

The previous Rust/Axum implementation lives in [`legacy/`](legacy/) for reference.

## Pages

| Route | |
|---|---|
| `/` | Running saldo, inline editor for today, last 7 days |
| `/month[/YYYY-MM]` | Month table with totals |
| `/day/YYYY-MM-DD` | Day editor (blocks, target, note) |
| `/history` | Paginated list with date filter and running saldo |
| `/analytics` | Stats, saldo trend, monthly hours, yearly heatmap |
| `/health` | Liveness check |

## Development

Requires Node ≥ 24, pnpm and Docker.

```sh
pnpm install
pnpm stack:up     # local Postgres on :5432 (matches the default DATABASE_URL)
pnpm dev          # server (watch) + Tailwind (watch)  →  http://localhost:3000
```

`pnpm stack:down` stops the database (data is kept in a volume; add `-v` via `docker compose -f docker-compose.dev.yml down -v` to wipe it). An optional `.env` overrides defaults.

Migrations in `drizzle/` run automatically on server start. After changing `src/db/schema/`, run `pnpm db:generate`.

| Script | |
|---|---|
| `pnpm stack:up` / `stack:down` | Start / stop the local Postgres |
| `pnpm dev` | Dev server with reload |
| `pnpm build` | Bundle to `dist/` and build CSS |
| `pnpm start` | Run the built server (`PORT`, default 80) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Unit and route tests |

### Integration tests

SQL tests are skipped unless `TEST_DATABASE_URL` is set. **They truncate the tables — use a disposable database.**

```sh
docker run -d --rm -p 5544:5432 -e POSTGRES_USER=timedrift -e POSTGRES_PASSWORD=x -e POSTGRES_DB=timedrift postgres:16-alpine
TEST_DATABASE_URL=postgres://timedrift:x@localhost:5544/timedrift pnpm test
```

## Import from Excel

`tools/import_excel.py` converts the SAP "Zeitkonto" export (sheet `Zeitkonto`, data from row 3, ending with a `SUM` row) into SQL. Multi-session days are merged into one entry with several blocks.

```bash
pip install openpyxl
python3 tools/import_excel.py /path/to/zeiten.xlsx > import.sql
psql $DATABASE_URL < import.sql
```

Notes: the script is not idempotent (running it twice duplicates or fails), so import into an empty database only. Dates listed in `SKIP_DATES` inside the script are excluded.

## Configuration

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | `postgres://timedrift:timedrift@localhost:5432/timedrift` | Postgres connection |
| `PORT` | `80` | HTTP port |
| `LOG_LEVEL` | `info` | pino level |
| `LOG_FORMAT` | `json` (`pretty` in development) | |

## Deployment

CI (`.github/workflows/build.yml`) typechecks, tests and builds on every PR; pushes to `main` build a multi-arch image to GHCR. `docker-compose.yml` runs the app plus Postgres (Coolify/Traefik).

## Notes

- Hours are `Decimal` (28 digits, half-even rounding). A block ending before it starts crosses midnight.
- Days with only a still-running block are excluded from the saldo.
- Default target: 8h Mon–Fri, 0h on weekends.
- Commits follow Conventional Commits (enforced by `.githooks`); direct commits to `main` are blocked.

## Versioning

[Semantic Versioning](https://semver.org). Conventional Commits drive the bump: `fix` → patch, `feat` → minor, `!`/`BREAKING CHANGE` → major (while `0.x`, breaking changes bump minor).
Releases are automated by release-please (`.github/workflows/release.yml`): it keeps a "Release PR" open on `main` (bumps `package.json`, updates `CHANGELOG.md`). Merging it creates tag `vX.Y.Z`, which publishes GHCR images `X.Y.Z`, `X.Y`, `X` (`latest` follows `main`).

### GitHub setup

Required once for the release automation:

1. **Settings → Actions → General → Workflow permissions:** enable "Allow GitHub Actions to create and approve pull requests" (release-please opens the Release PR).
2. **Secret `RELEASE_TOKEN`** (Settings → Secrets and variables → Actions): a personal access token with `contents: write` and `pull requests: write` on this repo (fine-grained PAT). Without it the workflow falls back to `GITHUB_TOKEN`; the tag is then created but does **not** trigger the image build in `build.yml`.
3. **Packages:** the GHCR image is pushed with `GITHUB_TOKEN` (`packages: write`); on first push, make sure the package is linked to the repo and has the desired visibility.
4. **Branch protection on `main`** (recommended): require PRs and the `test` check; allow merging the Release PR. Local hooks (`.githooks`) also forbid direct commits to `main` and enforce Conventional Commits, so use squash-merge with a Conventional Commit PR title.
