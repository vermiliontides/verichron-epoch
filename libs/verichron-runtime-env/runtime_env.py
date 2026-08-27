"""Shared Python runtime guard for repo-local virtualenv usage.
 
Lives under libs/ rather than inside any single application (packages/db,
an extractor, etc.) because it doesn't parse forensic artifacts or execute a
workflow -- it enforces a system-level guardrail (.venv existence) that
applies to any Python process in the monorepo, migrate.py and extractors
alike. Locking it inside one package would mean either duplicating it or
having unrelated applications reach into each other's directories.
"""
 
from __future__ import annotations
 
import sys
from pathlib import Path
 
 
def repo_root() -> Path:
    # This file lives at libs/runtime-env/runtime_env.py -- two directories
    # below the monorepo root, hence three .parent calls. If this file moves
    # again, update the parent count to match its new depth.
    return Path(__file__).resolve().parent.parent.parent
 
 
def ensure_repo_venv() -> Path:
    """Require a repo-root .venv before any Python pipeline command runs.
 
    The project expects a local virtual environment in the repository root so all
    Python tooling resolves the same dependencies and the same interpreter. If the
    venv is missing, the script exits with a clear setup message instead of the
    much less useful ModuleNotFoundError that comes from using the wrong Python.
    """
    root = repo_root()
    venv_python = root / ".venv" / "bin" / "python"
    if not venv_python.exists():
        raise RuntimeError(
            "This repo requires a local Python virtual environment at "
            f"{root / '.venv'}. Create it before running any Python tooling: "
            "uv sync (from the repo root), which builds .venv and installs "
            "every workspace member (libs/runtime-env, libs/etl-run, "
            "packages/db, packages/contracts, apps/extractors/*) in one step."
        )
    return venv_python
 
 
def fatal_if_missing_venv() -> None:
    """Common entrypoint guard used by Python scripts and extractors."""
    try:
        ensure_repo_venv()
    except Exception as exc:  # pragma: no cover - CLI guard behavior
        print(f"[env] {exc}", file=sys.stderr)
        raise