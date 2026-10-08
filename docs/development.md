# Development

Setting up, running the pipeline, testing, and the conventions changes follow.
For what the pieces are, read [architecture.md](architecture.md) first.

## Prerequisites

| Tool | Version | Used by |
|---|---|---|
| Node.js | 24 or later | the app, mvt-runner, the orchestrator |
| pnpm | 10 (pinned in `package.json`) | TypeScript workspace |
| Python | 3.12 or later | stages, the writer, the report |
| uv | current | Python workspace (`uv.lock` is the only lockfile) |
| Docker | current | local PostgreSQL 16 |
| `mvt-ios` | in its own venv, e.g. `~/mvt/.venv` | mvt-runner (`--mvt-bin` if it isn't found) |
| `sqlite3` | any | mvt-runner's repair pass (recorded as skipped if missing) |

## First-time setup

```bash
git clone --recurse-submodules <repo>    # or: git submodule update --init  (iLEAPP)
cp .env.example .env                     # then fill in DB_USER, DB_PASSWORD, DB_NAME, DB_HOST, DB_PORT
scripts/bootstrap-dev.sh                 # git hooks, infra/.env link (needs .env), uv sync, pnpm install, submodules
docker compose -f infra/docker-compose.yml up -d postgres
set -a; . ./.env; set +a                 # load DB_* into this shell
uv run python packages/etl-db-writer/migrate.py --db-url "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
```

PostgreSQL applies the migrations itself on its first boot; `migrate.py` records
what was applied and applies anything newer. It refuses a database where a
migration stopped part-way.

**Development data is disposable.** When a migration changes existing tables,
recreate the database instead of patching it:

```bash
docker compose -f infra/docker-compose.yml down -v && docker compose -f infra/docker-compose.yml up -d postgres
```

## Running the pipeline

```bash
# 1. Prepare backups: hash, decrypt (prompts for the password), repair, IOC scan
pnpm --filter @verichron/mvt-runner dev -- --source /path/to/backups --workspace ~/mvt-workspace

# 2. Register the evidence and run every stage, for every decrypted backup in the workspace
pnpm --filter @verichron/orchestrator investigate -- --workspace ~/mvt-workspace

# 3. Or drive both from the desktop app
pnpm --filter @verichron/epoch dev
```

The orchestrator reads `DATABASE_URL` or `DB_*` from `.env`. The report is
written by the `reporting` stage to `results/<label>/investigation_report.md`.

Useful tools:

| Command | What it does |
|---|---|
| `uv run python scripts/db_peek.py` | Shows the latest run's stages and records |
| `uv run python scripts/synthetic_backup_generator.py` | Builds a synthetic backup for testing |
| `pnpm gen:fake-stix` | Builds a fake STIX2 IOC set from generated indicators |
| `uv run python scripts/inspect_ileapp_output.py <dir>` | Shows what an iLEAPP output directory contains |

## Testing

There are two test tiers, and both run in CI (R33):

- **Unit and PgDouble:** fast, with no external services. PgDouble is an
  SQLite-backed stand-in that runs the same test bodies.
- **Real Postgres:** the same bodies against PostgreSQL, enabled by
  `TEST_DATABASE_URL`. It **truncates tables**, so point it at a throwaway
  database, never your dev one.

```bash
uv run pytest                                        # Python: packages/, scripts/, apps/
TEST_DATABASE_URL=postgresql://.../verichron_test uv run pytest

pnpm --filter @verichron/mvt-runner test             # TypeScript (node:test via tsx)
pnpm --filter @verichron/orchestrator test           # real-Postgres tests need TEST_DATABASE_URL
pnpm --filter @verichron/etl-db-reader test
pnpm check:contracts                                 # schema ↔ TS ↔ Python mirrors in sync
```

External tools are tested through stub executables and servers (a stub
`mvt-ios`, `sqlite3`, Ollama), so tests exercise the real process boundary.

## CI

| Workflow | Runs |
|---|---|
| `.github/workflows/python-tests.yml` | Migrations applied twice to a fresh PostgreSQL 16, pytest on both tiers, the index-usage check for evidence reads |
| `.github/workflows/ts-tests.yml` | Typecheck and tests for mvt-runner, the reader and the orchestrator, with real PostgreSQL |

All Actions are pinned to full commit SHAs. The desktop app isn't built or
tested in CI yet (EPOCH-454).

## Conventions

- **Branches:** work branches start from `dev` and merge back through a pull
  request. Linear names branches from tickets (`<user>/ver-<n>-epoch-<n>-…`).
- **Tickets:** scope lives in the Linear ticket (`EPOCH-<n>`). A change that
  settles a decision updates [decisions.md](decisions.md) in the same PR, and a
  change to how the system works updates the doc that describes it.
- **Migrations:** add the next numbered file in
  `packages/etl-db-writer/migrations/`, plus its entry in `APPLIED_MARKERS` in
  `migrate.py`. Never edit a merged migration; add a new one.
- **Contracts:** add a `source_type` to `normalized-record.schema.json` first,
  then run `pnpm sync:contracts`.
- **Fail fast:** no fallbacks, backfills or legacy-compatibility paths for
  development data.
