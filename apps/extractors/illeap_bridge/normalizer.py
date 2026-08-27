#!/usr/bin/env python3
"""
Verichron Epoch - iLEAPP Data Normalizer
Reads raw iLEAPP extraction outputs (CSV/TSV/SQLite) and transforms them
into the unified extractor-contract normalized record shape (see
ileapp_bridge/main.py for how these get validated into NormalizedRecord).
"""

from __future__ import annotations

import csv
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

SUPPORTED_SUFFIXES = {".csv", ".tsv", ".db", ".sqlite"}

# iLEAPP's own bookkeeping tables. These describe how iLEAPP searches for
# artifacts — module names, artifact names, glob patterns — and contain no
# device activity whatsoever. Ingesting them produced "forensic records"
# whose entire payload was a search regex:
#
#   {"module_name": "lastBuild", "regex": "*/installd/.../LastBuildInfo.plist"}
#
# Those rows then sat in forensic_records alongside real evidence, inside the
# same table the correlation window queries. Tool configuration is not
# evidence; skip it at the source.
EXCLUDED_TABLE_PREFIXES = ("_lava", "_artifact", "sqlite_")

# Column names, in priority order, that genuinely carry "when did this event
# happen". Matched case-insensitively and exactly — not by substring.
#
# Substring matching was the previous approach and it is actively dangerous
# here: "time" matches TimeZone, "date" matches date_added / updated_date /
# LastModifiedDate, "created" matches created_by. iLEAPP column order is not
# stable across artifacts, so the first substring hit could be a row's
# modification time while the real event time sat two columns over. event_time
# is the single field the entire correlation model rests on, and a *wrong*
# event_time is materially worse than a null one: it silently lands inside
# someone's correlation window and reads as corroborating evidence. That is
# the same argument normalize_timestamp() already makes about fabricated
# "now" values, applied one level up.
EVENT_TIME_COLUMNS: tuple[str, ...] = (
    # Explicit event semantics — unambiguous, prefer these.
    "event_time",
    "event_timestamp",
    "eventtime",
    "timestamp",
    "datetime",
    # iLEAPP / Apple artifact conventions.
    "start_time",
    "starttime",
    "visit_time",
    "last_visit_time",
    "date_visited",
    "message_date",
    "date_sent",
    "date_received",
    "date_created",
    "creation_date",
    "created_at",
    "time_stamp",
    "date_time",
    "date",
    "time",
)

# Columns that look temporal to a substring match but are not the event's own
# time. Listed explicitly so the exclusion is auditable rather than implied by
# the absence of an entry above.
NON_EVENT_TIME_COLUMNS: frozenset[str] = frozenset(
    {
        "timezone",
        "time_zone",
        "tz",
        "utc_offset",
        "date_added",
        "updated_date",
        "date_updated",
        "updated_at",
        "modified",
        "date_modified",
        "last_modified",
        "lastmodified",
        "lastmodifieddate",
        "expiration_date",
        "expiry_date",
        "date_expires",
        "created_by",
        "duration",
        "elapsed_time",
        "time_elapsed",
        "validated",
    }
)


def normalize_timestamp(raw_ts) -> str | None:
    """Ensures timestamps conform to ISO 8601 UTC string format.

    Returns None when no real timestamp can be recovered from raw_ts,
    rather than fabricating one from the current wall-clock time. A
    fabricated "now" timestamp is worse than no timestamp: it silently
    lands inside someone's correlation window and reads as real evidence
    (see extractors/crash/main.py's parse_crash_time, which follows the
    same null-over-misleading-value convention for the same reason).
    """
    if not raw_ts:
        return None

    if isinstance(raw_ts, (int, float)):
        if raw_ts > 1e12:
            raw_ts /= 1000.0
        try:
            return datetime.fromtimestamp(raw_ts, tz=timezone.utc).isoformat()
        except (ValueError, OSError):
            return None

    if isinstance(raw_ts, str):
        try:
            dt = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            return None

    return None


def build_normalized_record(source_artifact: str, timestamp: str | None, data: dict) -> dict:
    """Construct a single standardized record conforming to the extractor schema."""
    return {
        "schema_version": "1.0.0",
        "engine": "iLEAPP",
        "source_artifact": source_artifact,
        "timestamp": normalize_timestamp(timestamp),
        "data": data,
    }


def list_supported_artifacts(output_dir: str | Path) -> list[Path]:
    out_path = Path(output_dir)
    if not out_path.exists():
        raise FileNotFoundError(f"iLEAPP output directory does not exist: {out_path}")

    return sorted(
        path for path in out_path.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES
    )


def parse_artifact_file(file_path: Path) -> list[dict]:
    suffix = file_path.suffix.lower()
    if suffix == ".csv":
        return _parse_tabular_artifact(file_path, delimiter=",")
    if suffix == ".tsv":
        return _parse_tabular_artifact(file_path, delimiter="\t")
    if suffix in {".db", ".sqlite"}:
        return _parse_sqlite_artifact(file_path)
    return []


def parse_ileapp_outputs(output_dir: str) -> list:
    """Walks the iLEAPP output directory and normalizes every supported artifact."""
    normalized_records = []
    for file_path in list_supported_artifacts(output_dir):
        normalized_records.extend(parse_artifact_file(file_path))
    print(f"[+] Successfully normalized {len(normalized_records)} total records from iLEAPP output.")
    report_timestamp_coverage(normalized_records)
    return normalized_records


def report_timestamp_coverage(records: list[dict], stream=None) -> list[str]:
    """Print which artifacts produced no usable event_time, and return them.

    Written to stderr so it reaches `pipeline_stage_status.error_message` and
    therefore the rendered report. An artifact with no mapped timestamp column
    still lands rows in forensic_records, but those rows can never appear in a
    correlation window - they are inert. That is a mapping gap to fix, not a
    condition to discover by noticing a domain is quietly missing from every
    alert. Loud and non-fatal: it does not fail the stage, since a genuinely
    timestamp-free artifact (device metadata, installed-app inventory) is
    legitimate.
    """
    err = stream if stream is not None else sys.stderr
    missing = unmapped_artifacts(records)
    if not missing:
        return []

    total_null = sum(1 for record in records if record.get("timestamp") is None)
    print(
        f"[!] {total_null}/{len(records)} record(s) have no event_time; "
        f"{len(missing)} artifact(s) had no mappable timestamp column:",
        file=err,
    )
    for name in missing:
        print(f"[!]   - {name}", file=err)
    print(
        "[!] These records cannot participate in correlation. If any of the "
        "above should be time-anchored, add its column to "
        "normalizer.EVENT_TIME_COLUMNS.",
        file=err,
    )
    return missing


def _normalize_column_name(key: str) -> str:
    """Collapse an artifact's column name to a comparable form.

    iLEAPP exports are inconsistent about casing and separators for the same
    logical column ("Start Time", "start_time", "StartTime"), so compare on a
    lowercased, separator-normalized form rather than adding three spellings
    of every entry to EVENT_TIME_COLUMNS.
    """
    return key.strip().lower().replace(" ", "_").replace("-", "_")


def _find_timestamp_key(keys) -> str | None:
    """Pick the column holding this row's own event time, or None.

    Exact-match against EVENT_TIME_COLUMNS in priority order, so the choice is
    deterministic regardless of the artifact's column ordering: if a row has
    both `timestamp` and `date`, `timestamp` wins every time. Columns in
    NON_EVENT_TIME_COLUMNS are never eligible.

    Returns None rather than guessing when nothing matches. Callers surface
    that as a null event_time - see normalize_timestamp()'s docstring for why
    a null beats an approximation here.
    """
    available: dict[str, str] = {}
    for key in keys:
        if key is None:
            continue
        normalized = _normalize_column_name(key)
        if normalized in NON_EVENT_TIME_COLUMNS:
            continue
        # First spelling wins on collision, matching the source's own order.
        available.setdefault(normalized, key)

    for candidate in EVENT_TIME_COLUMNS:
        if candidate in available:
            return available[candidate]

    # Separator-insensitive second pass: catches "StartTime" against
    # "start_time" without a combinatorial explosion in the table above.
    squashed = {name.replace("_", ""): original for name, original in available.items()}
    for candidate in EVENT_TIME_COLUMNS:
        if candidate.replace("_", "") in squashed:
            return squashed[candidate.replace("_", "")]

    return None


def unmapped_artifacts(records: list[dict]) -> list[str]:
    """Artifacts in `records` for which no event-time column could be found.

    Exposed so an extractor can log timestamp coverage loudly instead of
    letting a whole artifact silently land with null event_times - an artifact
    with no usable timestamp column contributes nothing to correlation, and
    that is a mapping gap worth seeing rather than a quiet degradation.
    """
    missing = {
        record.get("source_artifact", "unknown")
        for record in records
        if record.get("timestamp") is None
    }
    return sorted(missing)


def is_excluded_table(table_name: str) -> bool:
    """True for iLEAPP/SQLite bookkeeping tables that hold no device activity.

    See EXCLUDED_TABLE_PREFIXES. Kept a named function rather than an inline
    check so the test suite can assert the policy directly.
    """
    lowered = table_name.lower()
    return any(lowered.startswith(prefix) for prefix in EXCLUDED_TABLE_PREFIXES)


def _parse_tabular_artifact(file_path: Path, delimiter: str = ",") -> list:
    """Parse a CSV/TSV artifact in full, or raise.

    Deliberately does NOT swallow parse errors. The previous behavior caught
    every exception, printed it, and returned whatever rows it had managed -
    so a truncated or corrupt export was indistinguishable from a legitimately
    short one, and the caller counted it as a clean success. Raising lets the
    per-file isolation in main.process_output_directory record it as the real
    failure it is (EXTRACTOR_CONTRACT.md section 5) while still not aborting
    the remaining artifacts.
    """
    records = []
    artifact_name = file_path.stem
    with open(file_path, mode="r", encoding="utf-8", errors="ignore", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=delimiter)
        for row in reader:
            ts_key = _find_timestamp_key(row.keys())
            ts_candidate = row.get(ts_key) if ts_key else None
            records.append(
                build_normalized_record(
                    source_artifact=artifact_name,
                    timestamp=ts_candidate,
                    data=dict(row),
                )
            )
    return records


def _parse_sqlite_artifact(file_path: Path) -> list:
    """Streams each table in 1000-row batches (per README's documented
    limitation) to avoid loading a large iLEAPP SQLite export fully into
    memory. Skips iLEAPP's own bookkeeping tables (see is_excluded_table).

    Raises on a malformed database rather than returning a partial list - same
    reasoning as _parse_tabular_artifact.
    """
    records = []
    artifact_name = file_path.stem
    conn = sqlite3.connect(file_path)
    try:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        table_names = [row["name"] for row in cursor.fetchall()]

        for table_name in table_names:
            if is_excluded_table(table_name):
                continue
            cursor.execute(f"SELECT * FROM [{table_name}]")
            while True:
                rows = cursor.fetchmany(1000)
                if not rows:
                    break
                for row in rows:
                    row_dict = dict(row)
                    ts_key = _find_timestamp_key(row_dict.keys())
                    ts_candidate = row_dict.get(ts_key) if ts_key else None
                    records.append(
                        build_normalized_record(
                            source_artifact=f"{artifact_name}:{table_name}",
                            timestamp=ts_candidate,
                            data={
                                str(k): (v.hex() if isinstance(v, bytes) else v)
                                for k, v in row_dict.items()
                            },
                        )
                    )
    finally:
        # Closed even on failure; the exception itself propagates so the caller
        # records a real failure rather than a silently short read.
        conn.close()
    return records


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python normalizer.py <path_to_ileapp_output_directory>")
        sys.exit(1)

    target_dir = sys.argv[1]
    results = parse_ileapp_outputs(target_dir)

    if results:
        print("\n--- Sample Normalized Record ---")
        print(json.dumps(results[0], indent=2))
