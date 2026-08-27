#!/usr/bin/env python3
"""
Integration tests for the iLEAPP extractor.

Covers:
  - Normalizer parsing (CSV/TSV/SQLite), including batch streaming
  - Event-time column mapping and the columns that must NOT be mapped
  - Exclusion of iLEAPP's own bookkeeping tables
  - NormalizedRecord schema validation
  - Idempotent file hashing
  - Failure surfacing (malformed input raises rather than short-reading)

Run with `pytest packages-py`. Import paths come from `packages-py/conftest.py`.

Previously this module carried its own `main()` runner that called each test in
a try/except and tallied results. That reimplemented pytest — already a
declared dependency in requirements.txt — but without parametrization, fixtures,
assertion introspection, or a non-zero exit that CI could key on unless invoked
directly as a script, which nothing did. The tests were real; the harness meant
nothing ran them. They are plain pytest functions now.
"""

from __future__ import annotations

import sqlite3

import pytest

from db_writer import compute_file_hash
from ileapp_bridge.main import normalize_record
from ileapp_bridge.normalizer import (
    EXCLUDED_TABLE_PREFIXES,
    _find_timestamp_key,
    is_excluded_table,
    list_supported_artifacts,
    normalize_timestamp,
    parse_artifact_file,
    parse_ileapp_outputs,
    report_timestamp_coverage,
    unmapped_artifacts,
)
from normalized_record import NormalizedRecord, SourceType


# --------------------------------------------------------------------------
# Parsing
# --------------------------------------------------------------------------


def test_parses_csv_artifact(tmp_path):
    csv_file = tmp_path / "history.csv"
    csv_file.write_text(
        "url,visit_count,timestamp\n"
        "https://example.com,5,2024-01-15T10:30:00Z\n"
        "https://test.com,3,2024-01-15T10:35:00Z\n"
    )

    records = parse_artifact_file(csv_file)

    assert len(records) == 2
    assert records[0]["engine"] == "iLEAPP"
    assert records[0]["source_artifact"] == "history"
    assert records[0]["data"]["url"] == "https://example.com"
    assert records[0]["timestamp"] == "2024-01-15T10:30:00+00:00"


def test_parses_sqlite_artifact(tmp_path):
    db_file = tmp_path / "sms.db"
    conn = sqlite3.connect(db_file)
    conn.execute(
        "CREATE TABLE messages (id INTEGER PRIMARY KEY, phone TEXT, message TEXT, timestamp TEXT)"
    )
    conn.execute("INSERT INTO messages VALUES (1, '+1234567890', 'hello', '2024-01-15T10:30:00Z')")
    conn.execute("INSERT INTO messages VALUES (2, '+1987654321', 'world', '2024-01-15T10:35:00Z')")
    conn.commit()
    conn.close()

    records = parse_artifact_file(db_file)

    assert len(records) == 2
    assert records[0]["source_artifact"] == "sms:messages"
    assert records[0]["data"]["phone"] == "+1234567890"


def test_parses_mixed_artifact_types_in_a_directory(tmp_path):
    (tmp_path / "safari.csv").write_text("url,timestamp\nhttps://example.com,2024-01-15T10:30:00Z\n")
    (tmp_path / "network.tsv").write_text("iface\tbytes\ttimestamp\neth0\t1000\t2024-01-15T10:30:00Z\n")

    assert len(list_supported_artifacts(tmp_path)) == 2
    assert len(parse_ileapp_outputs(str(tmp_path))) == 2


def test_streams_large_sqlite_table_past_the_batch_size(tmp_path):
    """2500 rows exercises the 1000-row fetchmany loop across three batches."""
    db_file = tmp_path / "large.db"
    conn = sqlite3.connect(db_file)
    conn.execute("CREATE TABLE events (id INTEGER PRIMARY KEY, data TEXT, timestamp TEXT)")
    conn.executemany(
        "INSERT INTO events VALUES (?, ?, ?)",
        [(i, f"event_{i}", "2024-01-15T10:30:00Z") for i in range(2500)],
    )
    conn.commit()
    conn.close()

    assert len(parse_artifact_file(db_file)) == 2500


def test_binary_blobs_are_hex_encoded_not_dropped(tmp_path):
    db_file = tmp_path / "blobs.db"
    conn = sqlite3.connect(db_file)
    conn.execute("CREATE TABLE payloads (id INTEGER, blob BLOB, timestamp TEXT)")
    conn.execute("INSERT INTO payloads VALUES (1, ?, '2024-01-15T10:30:00Z')", (b"\x00\xff\x10",))
    conn.commit()
    conn.close()

    records = parse_artifact_file(db_file)

    assert records[0]["data"]["blob"] == "00ff10"


# --------------------------------------------------------------------------
# Event-time mapping (regression: substring matching picked wrong columns)
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("columns", "expected"),
    [
        # A timezone name is not a time. This was the original bug: "TimeZone"
        # contains "time", appeared first, and won.
        (["TimeZone", "Visit Time", "URL"], "Visit Time"),
        # Row-modification time is not event time.
        (["updated_date", "timestamp", "note"], "timestamp"),
        (["LastModifiedDate", "StartTime"], "StartTime"),
        (["date_added", "date"], "date"),
        # Priority is by semantic explicitness, not column order.
        (["date", "timestamp"], "timestamp"),
        (["Message Date", "date_sent"], "Message Date"),
        # Nothing temporal -> None, never a guess.
        (["created_by", "name"], None),
        (["Duration", "Elapsed Time"], None),
        (["tz", "utc_offset"], None),
        (["ROWID", "bundle_id", "wifi_in", "wifi_out"], None),
    ],
)
def test_event_time_column_selection(columns, expected):
    assert _find_timestamp_key(columns) == expected


def test_column_selection_is_independent_of_column_order():
    """Same columns in any order must yield the same event-time column.

    iLEAPP column order is not stable across artifacts or versions, so an
    order-dependent choice means the same artifact can be timestamped from a
    different field between runs.
    """
    columns = ["TimeZone", "updated_date", "timestamp", "date"]
    assert _find_timestamp_key(columns) == "timestamp"
    assert _find_timestamp_key(list(reversed(columns))) == "timestamp"


def test_timezone_column_does_not_become_the_event_time(tmp_path):
    """End-to-end guard for the regression, at the parse level."""
    csv_file = tmp_path / "wifi.csv"
    csv_file.write_text("TimeZone,ssid,Visit Time\nAmerica/Chicago,home,2024-01-15T10:30:00Z\n")

    records = parse_artifact_file(csv_file)

    assert records[0]["timestamp"] == "2024-01-15T10:30:00+00:00"


def test_artifact_with_no_timestamp_column_is_reported_not_hidden(tmp_path, capsys):
    (tmp_path / "installed_apps.csv").write_text("bundle_id,name\ncom.example.app,Example\n")
    (tmp_path / "history.csv").write_text("url,timestamp\nhttps://a.test,2024-01-15T10:30:00Z\n")

    records = parse_ileapp_outputs(str(tmp_path))

    assert unmapped_artifacts(records) == ["installed_apps"]
    assert "installed_apps" in capsys.readouterr().err


def test_timestamp_coverage_report_is_silent_when_all_mapped(tmp_path, capsys):
    (tmp_path / "history.csv").write_text("url,timestamp\nhttps://a.test,2024-01-15T10:30:00Z\n")

    records = parse_ileapp_outputs(str(tmp_path))
    capsys.readouterr()

    assert report_timestamp_coverage(records) == []
    assert capsys.readouterr().err == ""


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2024-01-15T10:30:00Z", "2024-01-15T10:30:00+00:00"),
        ("2024-01-15T10:30:00", "2024-01-15T10:30:00+00:00"),
        ("", None),
        (None, None),
        ("not a timestamp", None),
        ("TimeZone", None),
        (1705314600, "2024-01-15T10:30:00+00:00"),
        (1705314600000, "2024-01-15T10:30:00+00:00"),  # milliseconds
    ],
)
def test_timestamp_normalization_never_fabricates_a_value(raw, expected):
    """An unparseable timestamp must become None, not `now`.

    A fabricated wall-clock timestamp lands inside whatever correlation window
    is currently being examined and reads as corroborating evidence.
    """
    assert normalize_timestamp(raw) == expected


# --------------------------------------------------------------------------
# Bookkeeping-table exclusion
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("table", "excluded"),
    [
        ("_lava_artifacts", True),
        ("_lava_data", True),
        ("_LAVA_artifacts", True),  # case-insensitive
        ("_artifact_search_patterns", True),
        ("sqlite_sequence", True),
        ("sqlite_master", True),
        ("Safari History", False),
        ("messages", False),
        ("artifacts", False),  # no leading underscore: a real artifact table
    ],
)
def test_bookkeeping_table_exclusion_policy(table, excluded):
    assert is_excluded_table(table) is excluded


def test_ileapp_internal_tables_are_not_ingested_as_evidence(tmp_path):
    """iLEAPP's search-pattern tables describe the tool, not the device.

    Ingesting them put rows whose whole payload was a glob pattern into
    forensic_records, alongside real evidence, in the same table the
    correlation window queries.
    """
    db_file = tmp_path / "artifacts.db"
    conn = sqlite3.connect(db_file)
    conn.execute("CREATE TABLE _lava_artifacts (module_name TEXT, artifact_name TEXT)")
    conn.execute("INSERT INTO _lava_artifacts VALUES ('lastBuild', 'Last Build Info')")
    conn.execute("CREATE TABLE _artifact_search_patterns (module_name TEXT, regex TEXT)")
    conn.execute("INSERT INTO _artifact_search_patterns VALUES ('lastBuild', '*/LastBuildInfo.plist')")
    conn.execute("CREATE TABLE visits (url TEXT, timestamp TEXT)")
    conn.execute("INSERT INTO visits VALUES ('https://example.com', '2024-01-15T10:30:00Z')")
    conn.commit()
    conn.close()

    records = parse_artifact_file(db_file)

    assert len(records) == 1
    assert records[0]["source_artifact"] == "artifacts:visits"
    assert all("regex" not in record["data"] for record in records)


def test_exclusion_prefixes_are_declared_not_inlined():
    """Guards against the policy drifting back into an inline LIKE clause."""
    assert "_lava" in EXCLUDED_TABLE_PREFIXES
    assert "_artifact" in EXCLUDED_TABLE_PREFIXES
    assert "sqlite_" in EXCLUDED_TABLE_PREFIXES


# --------------------------------------------------------------------------
# Failure surfacing
# --------------------------------------------------------------------------


def test_corrupt_sqlite_raises_instead_of_returning_partial_rows(tmp_path):
    """A short read must not be indistinguishable from a short file.

    The parser used to catch everything, print, and return whatever it had, so
    the caller counted a truncated database as a clean success.
    """
    db_file = tmp_path / "corrupt.db"
    db_file.write_bytes(b"SQLite format 3\x00" + b"\x00" * 200)

    with pytest.raises(sqlite3.DatabaseError):
        parse_artifact_file(db_file)


def test_missing_artifact_file_raises(tmp_path):
    with pytest.raises(OSError):
        parse_artifact_file(tmp_path / "does_not_exist.csv")


def test_missing_output_directory_raises():
    with pytest.raises(FileNotFoundError):
        list_supported_artifacts("/nonexistent/ileapp/output")


def test_rows_with_missing_timestamps_still_normalize(tmp_path):
    """A null event_time is valid; it must not drop the row."""
    csv_file = tmp_path / "mixed.csv"
    csv_file.write_text(
        "id,timestamp,data\n"
        "1,2024-01-15T10:30:00Z,good\n"
        "2,,missing_timestamp\n"
        "3,2024-01-15T10:35:00Z,also_good\n"
    )

    records = parse_artifact_file(csv_file)
    normalized = [normalize_record(record) for record in records]

    assert len(normalized) == 3
    assert normalized[1].event_time is None


# --------------------------------------------------------------------------
# Contract conformance
# --------------------------------------------------------------------------


def test_normalized_record_conforms_to_the_shared_envelope(tmp_path):
    csv_file = tmp_path / "test.csv"
    csv_file.write_text("id,data,timestamp\n1,sample,2024-01-15T10:30:00Z\n")

    normalized = normalize_record(parse_artifact_file(csv_file)[0])

    assert isinstance(normalized, NormalizedRecord)
    assert normalized.source_type == SourceType.ILEAPP_RECORD
    assert normalized.event_time is not None
    assert normalized.fields["engine"] == "iLEAPP"
    assert normalized.fields["source_artifact"] == "test"


def test_ileapp_record_is_a_declared_source_type():
    """Guards the enum drift that made this extractor's own rows unwritable.

    The canonical contracts/normalized-record.schema.json omitted
    `ileapp_record` while both language mirrors declared it, so JSON-schema
    validation rejected every row this extractor produced.
    """
    assert SourceType.ILEAPP_RECORD.value == "ileapp_record"


# --------------------------------------------------------------------------
# Idempotency
# --------------------------------------------------------------------------


def test_file_hash_is_deterministic_and_content_sensitive(tmp_path):
    test_file = tmp_path / "data.csv"
    test_file.write_text("id,value\n1,test\n")

    first = compute_file_hash(test_file)

    assert first == compute_file_hash(test_file)
    assert len(first) == 64

    test_file.write_text("id,value\n1,modified\n")
    assert compute_file_hash(test_file) != first
