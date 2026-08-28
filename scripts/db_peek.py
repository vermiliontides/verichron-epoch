#!/usr/bin/env python3
"""
Quick read-only summary of pipeline_runs / pipeline_stage_status /
ingested_files / forensic_records for a given run, or the most recent run
if none is given. Meant for smoketesting: confirms what actually landed in
Postgres after an orchestrator or single-extractor invocation, without
hand-writing SQL each time.

Uses psycopg2, same as packages/db/db_writer.py, for consistency.

Usage:
    python3 scripts/db_peek.py --db-url "$DATABASE_URL"
    python3 scripts/db_peek.py --db-url "$DATABASE_URL" --run-id smoke-test-1
"""

from __future__ import annotations

import argparse
import os
import sys

import psycopg2
import psycopg2.extras

DEFAULT_DB_URL = "postgresql://forensics:forensics_dev_only@localhost:5432/forensics"


def most_recent_run_id(cur) -> str | None:
    cur.execute("SELECT run_id FROM pipeline_runs ORDER BY started_at DESC LIMIT 1")
    row = cur.fetchone()
    return row["run_id"] if row else None


def print_run(cur, run_id: str) -> None:
    cur.execute("SELECT * FROM pipeline_runs WHERE run_id = %s", (run_id,))
    run = cur.fetchone()
    if not run:
        print(f"No pipeline_runs row for run_id={run_id}")
        return

    print(f"=== pipeline_runs: {run_id} ===")
    for k, v in dict(run).items():
        print(f"  {k}: {v}")

    print(f"\n=== pipeline_stage_status: {run_id} ===")
    cur.execute(
        "SELECT stage_name, status, error_message, started_at, finished_at "
        "FROM pipeline_stage_status WHERE run_id = %s ORDER BY started_at NULLS LAST",
        (run_id,),
    )
    stages = cur.fetchall()
    if not stages:
        print("  (no stage rows -- did the orchestrator or extractor actually write for this run_id?)")
    for s in stages:
        err = f" -- {s['error_message']}" if s["error_message"] else ""
        print(f"  {s['stage_name']:16} {s['status']:10}{err}")

    print(f"\n=== ingested_files: {run_id} ===")
    cur.execute(
        "SELECT source_type, file_name, ingest_complete, record_count, completed_at "
        "FROM ingested_files WHERE run_id = %s ORDER BY ingested_at",
        (run_id,),
    )
    files = cur.fetchall()
    if not files:
        print("  (no ingested_files rows for this run)")
    incomplete = [f for f in files if not f["ingest_complete"]]
    for f in files:
        state = "complete" if f["ingest_complete"] else "INCOMPLETE"
        count = f["record_count"] if f["record_count"] is not None else "-"
        print(f"  [{state:10}] {f['source_type']:20} {f['file_name']}  records={count}")
    if incomplete:
        print(
            f"\n  WARNING: {len(incomplete)} file(s) never completed ingest. Per the "
            "ingested_files_completion_consistent check constraint, this means "
            "record_count/completed_at are NULL for these rows -- the ingest either "
            "crashed mid-transaction or the stage never finished."
        )

    print(f"\n=== forensic_records by source_type: {run_id} ===")
    cur.execute(
        """
        SELECT f.source_type, COUNT(r.*) AS record_count
        FROM ingested_files f
        LEFT JOIN forensic_records r ON r.file_hash = f.file_hash
        WHERE f.run_id = %s
        GROUP BY f.source_type
        ORDER BY f.source_type
        """,
        (run_id,),
    )
    for row in cur.fetchall():
        print(f"  {row['source_type']:20} {row['record_count']} record(s)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db-url", default=os.environ.get("DATABASE_URL", DEFAULT_DB_URL))
    parser.add_argument("--run-id", default=None, help="Defaults to the most recent run in pipeline_runs")
    args = parser.parse_args()

    conn = psycopg2.connect(args.db_url)
    conn.set_session(readonly=True)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            run_id = args.run_id or most_recent_run_id(cur)
            if run_id is None:
                print("No rows in pipeline_runs yet.")
                sys.exit(0)
            print_run(cur, run_id)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
