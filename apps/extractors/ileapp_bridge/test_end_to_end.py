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

import os
import sys
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
def ileapp_output(tmp_path_factory):
    """One real iLEAPP run over a synthetic backup, shared by both backends."""
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
    return root / "out"


def test_ileapp_produces_ingestable_results_from_a_backup(db, ileapp_output):
    artifacts = list_supported_artifacts(ileapp_output)
    assert artifacts, "iLEAPP produced no artifact the bridge can ingest"
    for artifact in artifacts:
        relative = artifact.relative_to(ileapp_output).parts
        assert "data" not in relative[1:2] and "media" not in relative[1:2], (
            f"{artifact} is iLEAPP's copy of the input, not a result"
        )

    ctx = IngestContext(evidence_id=EVIDENCE_ID, derivative_id=DERIVATIVE_ID, run_id=RUN_ID, parser_version=1)
    written = 0
    for artifact in artifacts:
        result = process_artifact_file(db, ctx, artifact)
        assert result.failed == 0, result.failures
        written += result.succeeded
    assert written > 0, "no ileapp_record rows were written"
