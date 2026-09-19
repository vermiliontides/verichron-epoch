"""
pytest configuration local to packages/contracts.

`test_contract_sync.py` imports `adapter` and `normalized_record` as bare
module names (matching how extractors elsewhere in the repo import them), so
this directory needs to be on `sys.path` before collection runs. Previously
this shim lived one level up, at a shared `packages-py/conftest.py`, and
existed largely to work around `packages-py` (hyphen) not being importable as
a package. That constraint doesn't apply here -- `packages/contracts` is a
legal package path -- but the bare-module import style is kept for now so
`adapter.py` and `normalized_record.py` don't have to change their own
internal imports. If this package is later given a proper
`pyproject.toml` / `pip install -e .`, this file goes away along with the
bare imports it supports.
"""

from __future__ import annotations

import sys
from pathlib import Path

_THIS_DIR = str(Path(__file__).resolve().parent)

if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)
