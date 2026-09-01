#!/usr/bin/env bash
#
# Bootstrap developer environment for the repo.
#
# When/why: run once after cloning, or any time dependencies change and
# `.venv`/node_modules need to catch up. Sets up everything needed to run
# the Python extractors/orchestrator/tests and the Electron app (Epoch)
# from a clean checkout.
#
# What it does:
#   - Installs the forensic-output pre-commit guard (see SECURITY.md)
#   - Creates/updates the repo-root .venv via `uv sync` (NOT pip -- this
#     is a single uv workspace; see pyproject.toml's [tool.uv.workspace].
#     `uv sync` resolves every member package plus third-party deps from
#     uv.lock in one pass, including the local editable packages
#     (verichron-contracts, verichron-db, the extractor apps, etc.) --
#     pip install -r requirements.txt never installed those at all, and
#     requirements.txt itself was a second, hand-maintained dependency
#     list that had already drifted out of sync with the real one more
#     than once. See git history for both.)
#   - Runs pnpm install for the Node/pnpm workspace (apps/epoch and friends)
#   - Syncs and updates git submodules (apps/extractors/ileapp_bridge/iLEAPP)
#
# Usage:
#   ./scripts/bootstrap-dev.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "[bootstrap] Repo root: $REPO_ROOT"

# 0) Pre-commit guard FIRST — before any step that could produce output worth
#    accidentally committing. See SECURITY.md for why this is not optional.
if [ -d .githooks ]; then
  echo "[bootstrap] Installing forensic-output pre-commit guard (core.hooksPath=.githooks)"
  chmod +x .githooks/* 2>/dev/null || true
  git config core.hooksPath .githooks
else
  echo "[bootstrap] WARNING: .githooks/ missing — commits are NOT guarded against forensic output" >&2
fi

# 1) Python: single uv workspace, one lockfile, one venv for everything.
if ! command -v uv >/dev/null 2>&1; then
  echo "[bootstrap] uv not found — install it (https://docs.astral.sh/uv/) and re-run this script"
  exit 1
fi
echo "[bootstrap] Syncing Python workspace via uv (creates/updates .venv)"
uv sync

# 2) Node workspace install
if command -v pnpm >/dev/null 2>&1; then
  echo "[bootstrap] Installing pnpm workspace dependencies"
  pnpm install
else
  echo "[bootstrap] pnpm not found — please install pnpm and re-run the script"
  exit 1
fi

# 3) Sync and initialize submodules
if [ -f .gitmodules ]; then
  echo "[bootstrap] Syncing and initializing git submodules"
  git submodule sync --recursive
  git submodule update --init --recursive
else
  echo "[bootstrap] No .gitmodules file found — skipping submodule init"
fi

echo "[bootstrap] Bootstrap complete. Next steps:"
echo "  - Start Postgres (infra/docker-compose.yml) and run migrations: python3 packages/db/migrate.py --db-url <DB_URL>"
echo "  - Optionally build TypeScript packages: pnpm --recursive build"
echo "  - Run smoke checks or orchestrator as needed."

exit 0