# Extractor setup and run notes

**When/why:** the minimum commands to get the Postgres-backed extractor
pipeline running locally, from a clean checkout, for development or
smoke-testing. There is no root README.md yet — this is currently the
closest thing to one for the backend/extractor side. (For the Electron
app, apps/epoch has its own setup implicit in package.json.)

Last verified accurate: this pass. Previous version of this doc
referenced a `packages-ts/orchestrator/mvt-runner` path and a
`pip install -r requirements.txt` flow, neither of which reflects the
current repo layout — see git history if you need the old text.

## Assumptions

- Docker and docker-compose available, for local Postgres.
- `uv` installed (https://docs.astral.sh/uv/) — this is a single uv
  workspace; see pyproject.toml's `[tool.uv.workspace]`.
- `pnpm` installed, for the Node/TypeScript workspace (mvt-runner,
  orchestrator, epoch).
- `mvt-ios` installed somewhere resolvable, or its path supplied via
  `--mvt-bin` to mvt-runner.

## 1) Bootstrap everything at once

    ./scripts/bootstrap-dev.sh

Installs the pre-commit forensic-output guard, syncs the Python workspace
(`uv sync`), installs the pnpm workspace, and initializes the iLEAPP
submodule. See that script's own header for what each step does. The
steps below are the same things done manually / individually.

## 2) Bring up Postgres with migrations

    docker compose -f infra/docker-compose.yml up -d postgres

Default local connection string:

    postgresql://forensics:forensics_dev_only@localhost:5432/forensics

Apply migrations manually if you're not using compose's auto-init:
`packages/db/migrations`, applied via `python3 packages/db/migrate.py --db-url <DB_URL>`.

## 3) Ensure the iLEAPP submodule is populated

    git submodule update --init --recursive -- apps/extractors/ileapp_bridge/iLEAPP

## 4) Python workspace (single uv workspace, single .venv)

    uv sync

This resolves and installs every workspace member (packages/contracts,
packages/db, all apps/extractors/*, apps/analysis, apps/reporting,
libs/*) plus third-party dependencies from the single pyproject.toml /
uv.lock at the repo root. Do not use `pip install` here — there is no
separate requirements.txt; uv.lock is the one source of truth.

Run any Python entry point via `uv run`, e.g.:

    uv run python apps/extractors/ileapp_bridge/main.py --help

## 5) Running the iLEAPP bridge directly (example)

    uv run python apps/extractors/ileapp_bridge/main.py \
      --run-id mytest-run-1 \
      --backup-path /path/to/decrypted_backup_or_extraction_dir \
      --db-url "postgresql://forensics:forensics_dev_only@localhost:5432/forensics" \
      --output ./ileapp_raw_output

Runs the iLEAPP extraction (via the vendored submodule checked out in
step 3) and parses artifact files into `forensic_records` via
`db_writer.py`.

## 6) Running mvt-runner (real Stage 1: decrypt + scan)

mvt-runner is a TypeScript tool at `apps/mvt-runner` (package name
`@verichron/mvt-runner`). It hashes, decrypts, repairs, and mvt-ios-scans
one or more already-encrypted backups.

    pnpm --filter @verichron/mvt-runner dev -- --source /path/to/backups --workspace ~/mvt-workspace

`--source` is a directory containing already-encrypted backups (the kind
Finder/iTunes/`idevicebackup2` produce — mvt-runner does not create or
encrypt a backup itself). It prompts interactively for the decryption
password unless run non-interactively (see apps/epoch's mvt-runner
integration for how that's bridged in the desktop app). Pass `--mvt-bin`
if `mvt-ios` isn't on PATH.

## 7) Running the orchestrator (real Stage 3: pipeline_runs + forensic_records)

The orchestrator is a separate TypeScript tool at `apps/orchestrator`
(package name `@verichron/orchestrator`). It's what actually creates a
`pipeline_runs` row and runs the extractors — mvt-runner alone does not
touch Postgres at all.

    pnpm --filter @verichron/orchestrator investigate -- --workspace ~/mvt-workspace

or against one or more explicit already-decrypted backup paths instead of
`--workspace`. See `apps/orchestrator/src/main.ts`'s own usage text
(`--help`) for the current full option list — options change faster than
this doc does.

## 8) Environment variables

- `DATABASE_URL` — if unset, falls back to the same local dev string as
  above. Set explicitly for anything other than the default local
  Postgres:

      export DATABASE_URL="postgresql://forensics:forensics_dev_only@localhost:5432/forensics"

## 9) Verification

- Confirm rows landed: `uv run python scripts/db_peek.py --db-url "$DATABASE_URL"`
  (defaults to the most recent run if `--run-id` isn't given).
- Confirm iLEAPP output is being picked up as expected:
  `uv run python scripts/inspect_ileapp_output.py <ileapp_output_dir>`.
- If iLEAPP's plugin discovery returns zero plugins, start with
  `uv run python scripts/diagnose_ileapp_plugin_loading.py`.
