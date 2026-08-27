Extractor setup and run notes

Purpose

This document collects the minimum commands and environment notes to get the Postgres-backed extractor pipelines (iLEAPP bridge and MVT runner) running for local development and smoke tests.

Assumptions

- Repository root: the directory where you cloned this repo (for example, run `git rev-parse --show-toplevel` to get it on any machine).
- Docker and docker-compose are available for bringing up a local Postgres instance.
- Python 3.11+ is available for creating a .venv in the repository root when running Python pipelines.
- mvt-ios is installed in a predictable location for mvt-runner, or its path is supplied explicitly via --mvt-bin.

1) Bring up Postgres with migrations

The repository provides a docker-compose service (infra/docker-compose.yml) that mounts migrations into Postgres' init folder. From the repo root:

  cd "$(git rev-parse --show-toplevel)"
  docker compose -f infra/docker-compose.yml up -d postgres

Wait for Postgres to become healthy (the compose healthcheck uses pg_isready). The default local connection string for the repo is:

  postgresql://forensics:forensics_dev_only@localhost:5432/forensics

If you need to run migrations manually (outside compose), check packages-py/db/migrations and apply with your preferred tool (psql/psycopg2-based script).

2) Ensure the iLEAPP submodule is populated

The repo uses a submodule at packages-py/extractors/ileapp_bridge/iLEAPP. Initialize and update the submodule:

  git submodule update --init --recursive -- packages-py/extractors/ileapp_bridge/iLEAPP

3) Create the Python virtual environment (repo-root .venv)

A repo-root `.venv` is expected and required before any Python pipeline script runs. If it does not exist, create it and install dependencies before invoking extractor commands.

The orchestrator expects a Python interpreter at .venv/bin/python by default. Create the venv and install dependencies used by extractors:

  python3 -m venv .venv
  . .venv/bin/activate
  pip install --upgrade pip
  pip install -r packages-py/requirements.txt

Note: individual extractor folders (e.g., ileapp_bridge) may have additional requirements; inspect their README or requirements files.

4) Running the iLEAPP bridge directly (example)

The iLEAPP bridge entrypoint is packages-py/extractors/ileapp_bridge/main.py. It expects a run id, path to a decrypted backup or extraction directory, and a Postgres URL.

  . .venv/bin/activate
  python packages-py/extractors/ileapp_bridge/main.py \
    --run-id mytest-run-1 \
    --backup-path /path/to/decrypted_backup_or_extraction_dir \
    --db-url "postgresql://forensics:forensics_dev_only@localhost:5432/forensics" \
    --output ./ileapp_raw_output

The bridge will run the iLEAPP extraction (via its local iLEAPP clone) and then parse artifact files and persist NormalizedRecord rows into the forensic_records table using the shared db_writer helpers.

5) Running the mvt runner (example)

mvt-runner is a TypeScript node tool under packages-ts/orchestrator/mvt-runner. It spawns the mvt-ios binary and writes outputs into a workspace directory. The orchestrator sets a default mvt path, but you can override with --mvt-bin.

  # build or use the packaged mvt-runner; or run via node ./dist/main.js
  node ./packages-ts/orchestrator/mvt-runner/dist/main.js --source /path/to/backups --workspace ./mvt-workspace --mvt-bin /path/to/mvt/.venv/bin/mvt-ios

mvt-runner expects mvt-ios to be available (the binary is typically inside an mvt virtualenv). If mvt-runner cannot find it, pass --mvt-bin explicitly.

6) Environment variables

- DATABASE_URL or explicit --db-url flags: pipelines look for a Postgres URL in DATABASE_URL; if absent, they default to a local forensics DB string (see orchestrator code).
- For secure setups, set DATABASE_URL before running orchestrator steps:

  export DATABASE_URL="postgresql://forensics:forensics_dev_only@localhost:5432/forensics"

7) Developer convenience

- To run the orchestrator end-to-end (TypeScript), ensure node dependencies are installed and the repo's root ts build is up-to-date. The orchestrator spawns the Python pipeline (ileapp_bridge) and passes run-id and db-url to it.
- When adding TypeScript extractors, follow the normalized-record.schema.json envelope and implement a Node.js equivalent of db_writer.py that
  - computes file hashes for idempotency,
  - inserts into ingested_files if not already present,
  - writes validated normalized records into forensic_records (use normalizedRecord.ts for validation), and
  - supports batch writes (execute_values or bulk insert) for higher throughput.

8) Next steps and verification

- Run a smoke ingestion: bring up Postgres, create the venv, and run the ileapp_bridge on a tiny sample extraction. Confirm rows appear in forensic_records and ingested_files.
- Verify timestamps in records are ISO-8601 (UTC preferred) per normalized-record.schema.json so correlate.py and other tools can perform cross-domain correlation.

If anything here is unclear or you'd like the repository to contain small helper scripts (e.g., scripts/bootstrap-dev.sh), say which parts to implement and they can be added next.
