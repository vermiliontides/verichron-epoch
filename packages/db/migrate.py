#!/usr/bin/env python3
"""
packages-py/db/migrate.py

Minimal, dependency-light migration runner.

Why this exists alongside docker-entrypoint-initdb.d:
Docker's initdb hook only runs against a *fresh* Postgres data volume — it
never re-applies anything once forensics_pgdata already exists. That's fine
for 0001_init.sql against a brand-new dev environment, but the moment we add
0002_*.sql, any already-initialized volume (yours, a teammate's, CI) won't
pick it up. This script is what keeps a long-lived database in sync with
migrations/ as the schema evolves after first boot.

Usage:
    python3 packages-py/db/migrate.py --db-url postgresql://forensics:forensics_dev_only@localhost:5432/forensics

Tracks applied migrations in a schema_migrations table. Migrations are
applied in filename order (hence the 0001_, 0002_ prefix convention), each
inside its own transaction — one failing migration stops the run and leaves
everything before it committed, everything from it on untouched.
"""

import argparse
import sys
from pathlib import Path

_PY_ROOT = Path(__file__).resolve().parents[1]
if str(_PY_ROOT) not in sys.path:
    sys.path.insert(0, str(_PY_ROOT))
from runtime_env import fatal_if_missing_venv

import psycopg2

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def ensure_migrations_table(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename    TEXT PRIMARY KEY,
                applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    conn.commit()


def bootstrap_if_needed(conn) -> None:
    """
    Handles the one case that would otherwise break this script on day one:
    a dev environment where 0001_init.sql was already applied by
    docker-entrypoint-initdb.d (container's first boot) but schema_migrations
    has no record of it, because that hook doesn't know this script exists.

    Without this, the first real `migrate.py` run would try to CREATE TABLE
    pipeline_runs again and fail on "relation already exists" — not because
    anything is wrong, just because two different mechanisms applied the
    same file. Detect that case and backfill the ledger instead of re-running.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'pipeline_runs'
            )
            """
        )
        pipeline_runs_exists = cur.fetchone()[0]

    if not pipeline_runs_exists:
        return

    with conn.cursor() as cur:
        cur.execute("SELECT filename FROM schema_migrations")
        applied = {row[0] for row in cur.fetchall()}

    if "0001_init.sql" in applied:
        return

    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO schema_migrations (filename) VALUES (%s) ON CONFLICT DO NOTHING",
            ("0001_init.sql",),
        )
    conn.commit()
    print(
        "[migrate] detected 0001_init.sql already applied via "
        "docker-entrypoint-initdb.d — backfilling schema_migrations instead "
        "of re-running it"
    )


def pending_migrations(conn) -> list[Path]:
    with conn.cursor() as cur:
        cur.execute("SELECT filename FROM schema_migrations")
        applied = {row[0] for row in cur.fetchall()}
    return [m for m in sorted(MIGRATIONS_DIR.glob("*.sql")) if m.name not in applied]


def apply_migration(conn, path: Path) -> None:
    sql = path.read_text()
    with conn.cursor() as cur:
        cur.execute(sql)
        cur.execute(
            "INSERT INTO schema_migrations (filename) VALUES (%s)", (path.name,)
        )
    conn.commit()


def main() -> None:
    fatal_if_missing_venv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--db-url", required=True)
    args = parser.parse_args()

    try:
        conn = psycopg2.connect(args.db_url)
    except Exception as e:
        print(f"[migrate] could not connect to database: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        ensure_migrations_table(conn)
        bootstrap_if_needed(conn)

        pending = pending_migrations(conn)
        if not pending:
            print("[migrate] up to date, nothing to apply")
            return

        for path in pending:
            print(f"[migrate] applying {path.name}")
            try:
                apply_migration(conn, path)
            except Exception as e:
                conn.rollback()
                print(f"[migrate] FAILED on {path.name}: {e}", file=sys.stderr)
                print(
                    f"[migrate] stopped — {path.name} and everything after it "
                    "still pending. Fix the migration and re-run.",
                    file=sys.stderr,
                )
                sys.exit(1)
            print("[migrate]   ok")

        print(f"[migrate] applied {len(pending)} migration(s)")
    finally:
        conn.close()


if __name__ == "__main__":
    fatal_if_missing_venv()
    main()