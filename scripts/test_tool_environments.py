"""The external tools' pinned environments stay in step with what they need (EPOCH-458).

mvt and iLEAPP each run from their own uv project under tools/, not from the
workspace venv, because their exact dependency pins conflict. These tests catch
the drift that arrangement allows:

* tools/ileapp must declare every requirement in the iLEAPP submodule's
  requirements.txt, so moving the submodule pin cannot silently drop one;
* tools/mvt must pin mvt exactly, because its version is recorded with every
  derivative (EPOCH-406);
* neither tool may leak back into the workspace's dependencies.
"""

from __future__ import annotations

import re
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ILEAPP_REQUIREMENTS = REPO_ROOT / "apps" / "extractors" / "ileapp_bridge" / "iLEAPP" / "requirements.txt"


def _name(requirement: str) -> str:
    """The PEP 503 normalized project name of a requirement string."""
    match = re.match(r"\s*([A-Za-z0-9][A-Za-z0-9._-]*)", requirement)
    assert match, f"unparseable requirement: {requirement!r}"
    return re.sub(r"[-_.]+", "-", match.group(1)).lower()


def _dependencies(pyproject: Path) -> list[str]:
    return tomllib.loads(pyproject.read_text())["project"]["dependencies"]


def _ileapp_requirement_names() -> set[str]:
    names = set()
    for line in ILEAPP_REQUIREMENTS.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        # Windows-only wheel files referenced by relative path inside the submodule.
        if not line or line.startswith("whl_files/"):
            continue
        names.add(_name(line))
    return names


def test_ileapp_environment_declares_every_submodule_requirement():
    if not ILEAPP_REQUIREMENTS.exists():
        raise AssertionError(
            f"{ILEAPP_REQUIREMENTS} is missing; initialize the iLEAPP submodule (`mise run setup`)"
        )
    declared = {_name(d) for d in _dependencies(REPO_ROOT / "tools" / "ileapp" / "pyproject.toml")}
    missing = _ileapp_requirement_names() - declared
    assert not missing, f"tools/ileapp/pyproject.toml is missing iLEAPP requirements: {sorted(missing)}"


def test_mvt_environment_pins_mvt_exactly():
    deps = _dependencies(REPO_ROOT / "tools" / "mvt" / "pyproject.toml")
    mvt = [d for d in deps if _name(d) == "mvt"]
    assert len(mvt) == 1 and re.fullmatch(r"mvt==[0-9][0-9.]*", mvt[0].replace(" ", "")), (
        f"tools/mvt must pin mvt with ==, found {mvt}"
    )


def test_tools_are_not_workspace_dependencies():
    lock = (REPO_ROOT / "uv.lock").read_text()
    for name in ("mvt", "pyliblzfse", "astc-decomp-faster"):
        assert f'\nname = "{name}"\n' not in lock, (
            f"{name} is in the workspace lockfile; it belongs in its tools/ environment"
        )
