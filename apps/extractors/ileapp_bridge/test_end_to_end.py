"""End to end: a synthetic backup through the real iLEAPP and into the ledger (VER-16).

VER-16's symptom was iLEAPP discovering zero plugins and producing no output.
The cause was the environment: iLEAPP's dependencies were not installed, so
every plugin failed to import. They now live in iLEAPP's own pinned
environment, tools/ileapp (EPOCH-458). This test runs the real iLEAPP from that
environment, as the bridge does, against a synthetic backup in the real
iTunes/Finder layout, and requires that results reach the database.

It needs tools/ileapp (`mise run setup`). Locally it is skipped without it; in
CI it fails, because a regression test that silently skips is no test at all.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

from db_writer import IngestContext
from ileapp_bridge.bridge import ILEAPP_PYTHON, run_ileapp_extraction
from ileapp_bridge.main import process_artifact_file
from ileapp_bridge.normalizer import list_supported_artifacts
from testing.pg_real import BACKENDS, open_db

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))
from synthetic_backup_generator import RealisticBackupGenerator  # noqa: E402

RUN_ID = "cccccccc-0000-0000-0000-000000000000"
EVIDENCE_ID = "cccc0000-0000-0000-0000-00000000000c"
DERIVATIVE_ID = "cccc0000-0000-0000-0000-0000000000dc"


@pytest.fixture(params=BACKENDS)
def db(request):
    yield from open_db(request.param, (RUN_ID,), {EVIDENCE_ID: DERIVATIVE_ID})


@pytest.fixture(scope="module")
def ileapp_run(tmp_path_factory):
    """One real iLEAPP run over a synthetic backup, shared by both backends:
    (the output directory, the generator that made the backup)."""
    if not ILEAPP_PYTHON.exists():
        message = f"iLEAPP's environment is missing ({ILEAPP_PYTHON}); run `mise run setup`"
        if os.environ.get("CI"):
            pytest.fail(message)
        pytest.skip(message)

    root = tmp_path_factory.mktemp("ileapp_e2e")
    generator = RealisticBackupGenerator(root / "backups")
    generator.generate()
    generator.create_manifests()
    generator.create_info_plist()
    generator.create_status_plist()

    result = run_ileapp_extraction(str(generator.backup_dir), str(root / "out"))
    assert result["status"] == "success", result.get("error")
    return root / "out", generator


def _ingest_all(db, output) -> int:
    ctx = IngestContext(evidence_id=EVIDENCE_ID, derivative_id=DERIVATIVE_ID, run_id=RUN_ID, parser_version=1)
    written = 0
    for artifact in list_supported_artifacts(output):
        result = process_artifact_file(db, ctx, artifact)
        assert result.failed == 0, result.failures
        written += result.succeeded
    return written


def _stored_records(db) -> list[tuple[dict, object]]:
    """(fields, event_time) of every stored ileapp_record, from either backend."""
    cur = db.cursor()
    cur.execute("SELECT fields, event_time FROM forensic_records WHERE source_type = 'ileapp_record'")
    rows = cur.fetchall()
    return [(json.loads(f) if isinstance(f, str) else f, t) for f, t in rows]


def _as_utc(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    return value.astimezone(timezone.utc)


def test_ileapp_produces_ingestable_results_from_a_backup(db, ileapp_run):
    output, _ = ileapp_run
    artifacts = list_supported_artifacts(output)
    assert artifacts, "iLEAPP produced no artifact the bridge can ingest"
    for artifact in artifacts:
        relative = artifact.relative_to(output).parts
        assert "data" not in relative[1:2] and "media" not in relative[1:2], (
            f"{artifact} is iLEAPP's copy of the input, not a result"
        )
    assert _ingest_all(db, output) > 0, "no ileapp_record rows were written"


def test_generated_device_activity_reaches_the_records(db, ileapp_run):
    """Backup metadata alone must not satisfy the end-to-end test: a Safari visit
    the generator planted has to come back out of iLEAPP and into the records."""
    output, generator = ileapp_run
    _ingest_all(db, output)
    url, title, _ = generator.safari_visits[0]

    matches = [fields for fields, _ in _stored_records(db) if url in (fields or {}).values()]
    assert matches, f"the generated Safari visit to {url} is not in the stored records"
    assert any(title in fields.values() for fields in matches)


@pytest.mark.xfail(
    strict=True,
    reason="EPOCH-461: the bridge does not recognize iLEAPP's 'Visit Timestamp' column; it will read "
    "iLEAPP's declared datetime column instead. Remove this marker when EPOCH-461 lands.",
)
def test_generated_visit_keeps_its_time(db, ileapp_run):
    output, generator = ileapp_run
    _ingest_all(db, output)
    url, _, unix_seconds = generator.safari_visits[0]

    times = [_as_utc(t) for fields, t in _stored_records(db) if url in (fields or {}).values()]
    assert datetime.fromtimestamp(unix_seconds, timezone.utc) in times
