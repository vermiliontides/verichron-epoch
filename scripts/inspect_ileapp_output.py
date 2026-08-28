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


def probe_unknown_file(path: Path, full_structure: bool = False) -> None:
    """Best-effort identification of a file whose suffix isn't in
    SUPPORTED_SUFFIXES, without assuming its format. Prints the first bytes'
    signature and tries opening it as SQLite -- SQLite only checks for the
    16-byte "SQLite format 3\\0" header, not the extension, so a real SQLite
    database saved under a made-up extension (e.g. iLEAPP's own .lava) will
    open successfully here even though normalizer.py would currently skip
    it on suffix alone.
    """
    try:
        with open(path, "rb") as fh:
            header = fh.read(32)
    except OSError as exc:
        print(f"    [ERROR] could not read file: {exc}")
        return

    printable = "".join(chr(b) if 32 <= b < 127 else "." for b in header)
    print(f"    first 32 bytes (hex): {header.hex()}")
    print(f"    first 32 bytes (ascii): {printable}")

    if header.startswith(b"SQLite format 3\x00"):
        print("    -> SQLite header detected despite the extension. This IS a SQLite database;")
        print("       normalizer.py's suffix filter is skipping it purely on file extension.")
        inspect_sqlite(path)
    elif header.startswith(b"PK\x03\x04"):
        print("    -> ZIP header detected (could be an .xlsx, or a zip archive under a different name).")
    elif header.startswith(b"\x1f\x8b"):
        print("    -> gzip header detected.")
    elif header.lstrip().startswith(b"{") or header.lstrip().startswith(b"["):
        print("    -> JSON header detected. Streaming its structure (keys/types/counts only):\n")
        inspect_lava_json(path, full_structure=full_structure)
    else:
        print("    -> no recognized signature (not SQLite/zip/gzip/JSON-looking). Could be a custom")
        print("       binary format, pickle, msgpack, or similar -- check the iLEAPP source for how")
        print("       it writes this file (search the vendored apps/extractors/ileapp_bridge/iLEAPP/")
        print("       checkout for the string 'lava' to find the writer).")


def summarize_json_structure(value, key_name: str = "<root>", depth: int = 0, max_depth: int = 3) -> None:
    """Print a value's SHAPE (key names, types, counts) but never its actual
    scalar content. This file is real personal forensic data -- device
    activity, messages, timestamps tied to real events -- and neither this
    script nor anyone reading its output needs to see field values to
    understand what normalizer.py needs to be able to parse. Keys are
    structural metadata (a field is named "message_date"); values are the
    private payload. Only the former is printed.
    """
    indent = "  " * depth
    if isinstance(value, dict):
        print(f"{indent}{key_name}: object, {len(value)} key(s): {sorted(value.keys())[:20]}")
        if depth < max_depth:
            for k, v in list(value.items())[:10]:
                summarize_json_structure(v, k, depth + 1, max_depth)
    elif isinstance(value, list):
        print(f"{indent}{key_name}: array, {len(value)} item(s)")
        if value and depth < max_depth:
            summarize_json_structure(value[0], "[0] (sample item's shape only)", depth + 1, max_depth)
    else:
        print(f"{indent}{key_name}: {type(value).__name__}")


def inspect_lava_json(path: Path, full_structure: bool) -> None:
    """Stream the top-level structure of a .lava (or any large JSON) file
    with ijson rather than json.load, since these can be large enough that
    loading the whole file into memory isn't a reasonable default. Only
    reports structure -- see summarize_json_structure()'s docstring for why.

    Assumes the root is a JSON object (matches the observed
    '{"lava_schema_version": 2, ...' header) and uses ijson.kvitems(fh, "")
    to enumerate its top-level keys one at a time, rather than materializing
    the entire document to find them.
    """
    try:
        import ijson
    except ImportError:
        print("    ijson is not installed in this environment (it IS declared in")
        print("    apps/extractors/ileapp_bridge/pyproject.toml -- run `uv sync` or")
        print("    `pip install -e apps/extractors/ileapp_bridge` first).")
        return

    size_mb = path.stat().st_size / (1024 * 1024)
    print(f"    file size: {size_mb:.1f} MB")

    max_depth = 3 if full_structure else 1
    try:
        with open(path, "rb") as fh:
            for key, value in ijson.kvitems(fh, ""):
                summarize_json_structure(value, key, depth=1, max_depth=max_depth)
    except Exception as exc:
        print(f"    [ERROR] streaming parse failed: {exc}")
        return

    if not full_structure:
        print("\n    Re-run with --full-structure to recurse further into each key")
        print("    (still structure-only: key names/types/counts, never values).")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("output_dir", help="Path to an iLEAPP output directory")
    parser.add_argument(
        "--full-structure",
        action="store_true",
        help="Recurse deeper into unrecognized JSON files' structure (still key names/types/counts only, never values).",
    )
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

    if not supported and not unsupported:
        print("No files found at all under this directory.")
        return

    if not supported:
        print("No files matched SUPPORTED_SUFFIXES. Files actually present:\n")
        for p in all_files:
            print(f"  {p.relative_to(out_dir)}  (suffix: {p.suffix or 'none'})")
        print(
            f"\nIf real evidence lives in one of those files and its suffix isn't "
            f"in {sorted(SUPPORTED_SUFFIXES)}, that's the gap: normalizer.py's "
            "SUPPORTED_SUFFIXES needs a new entry, and parse_artifact_file() "
            "needs a branch to parse it, before anything downstream can work.\n"
            "Probing unsupported files below for their actual format:\n"
        )

    for path in supported:
        print(f"{path.relative_to(out_dir)}:")
        if path.suffix.lower() in {".db", ".sqlite"}:
            inspect_sqlite(path)
        else:
            inspect_tabular(path)
        print()

    if unsupported:
        print(f"{len(unsupported)} file(s) present but skipped (suffix not in {sorted(SUPPORTED_SUFFIXES)}):\n")
        for p in unsupported:
            print(f"{p.relative_to(out_dir)}:")
            probe_unknown_file(p, full_structure=args.full_structure)
            print()


if __name__ == "__main__":
    main()
