#!/usr/bin/env python3
"""
Diagnose what apps/extractors/ileapp_bridge/normalizer.py will and will not
ingest from a raw iLEAPP output directory, without touching Postgres.

Imports the real SUPPORTED_SUFFIXES / list_supported_artifacts /
is_excluded_table / parse_artifact_file from normalizer.py rather than
reimplementing them, so this script can never silently drift from what the
extractor actually does -- if normalizer.py changes its filtering rules,
this diagnostic changes with it automatically.

Usage:
    python3 scripts/inspect_ileapp_output.py <ileapp_output_dir>

<ileapp_output_dir> is the -o target you pass to ileapp_bridge/main.py's
--output flag -- e.g. the iLEAPP_Output_<timestamp>/ directory iLEAPP itself
creates, or its parent if you want every run under it scanned.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "apps" / "extractors" / "ileapp_bridge"))

from normalizer import (  # noqa: E402
    SUPPORTED_SUFFIXES,
    is_excluded_table,
    list_supported_artifacts,
    parse_artifact_file,
)


def inspect_sqlite(path: Path) -> None:
    conn = sqlite3.connect(str(path))
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = sorted(r[0] for r in cur.fetchall())
        if not tables:
            print("    (no tables in this database)")
            return
        included_total = 0
        excluded_total = 0
        for t in tables:
            excluded = is_excluded_table(t)
            cur.execute(f'SELECT COUNT(*) FROM "{t}"')
            count = cur.fetchone()[0]
            flag = "EXCLUDED" if excluded else "included"
            print(f"    [{flag:9}] {t}: {count} row(s)")
            if excluded:
                excluded_total += count
            else:
                included_total += count
        print(f"    -> {included_total} row(s) would be ingested, {excluded_total} row(s) filtered out by is_excluded_table()")
    except sqlite3.DatabaseError as exc:
        print(f"    [ERROR    ] not a readable SQLite database: {exc}")
    finally:
        conn.close()


def inspect_tabular(path: Path) -> None:
    try:
        records = parse_artifact_file(path)
        print(f"    [included ] {len(records)} row(s) parsed")
    except Exception as exc:
        print(f"    [ERROR    ] failed to parse: {exc}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("output_dir", help="Path to an iLEAPP output directory")
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    if not out_dir.exists():
        print(f"error: {out_dir} does not exist", file=sys.stderr)
        sys.exit(1)

    print(f"Scanning {out_dir}")
    print(f"normalizer.py's SUPPORTED_SUFFIXES: {sorted(SUPPORTED_SUFFIXES)}\n")

    all_files = sorted(p for p in out_dir.rglob("*") if p.is_file())
    supported = list_supported_artifacts(out_dir)
    supported_set = set(supported)
    unsupported = [p for p in all_files if p not in supported_set]

    if not supported:
        print("No files matched SUPPORTED_SUFFIXES. Files actually present:\n")
        for p in all_files:
            print(f"  {p.relative_to(out_dir)}  (suffix: {p.suffix or 'none'})")
        print(
            f"\nIf real evidence lives in one of those files and its suffix isn't "
            f"in {sorted(SUPPORTED_SUFFIXES)}, that's the gap: normalizer.py's "
            "SUPPORTED_SUFFIXES needs a new entry, and parse_artifact_file() "
            "needs a branch to parse it, before anything downstream can work."
        )
        return

    for path in supported:
        print(f"{path.relative_to(out_dir)}:")
        if path.suffix.lower() in {".db", ".sqlite"}:
            inspect_sqlite(path)
        else:
            inspect_tabular(path)
        print()

    if unsupported:
        print(f"{len(unsupported)} file(s) present but skipped (suffix not in {sorted(SUPPORTED_SUFFIXES)}):")
        for p in unsupported:
            print(f"  {p.relative_to(out_dir)}")


if __name__ == "__main__":
    main()
