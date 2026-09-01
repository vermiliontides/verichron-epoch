#!/bin/bash
#
# FLAGGED FOR DELETION -- currently broken, and tests the wrong pipeline
# even if fixed.
#
# References scripts/synthetic_backup_pipeline/full_pipeline.py, which
# does not exist -- the file is at scripts/full_pipeline.py (no
# subdirectory). This script has not run successfully in its current
# form.
#
# Even if that path were fixed, full_pipeline.py drives the old
# synthetic-demo generate/encrypt/parse flow, not the real pipeline
# (idevicebackup2 -> mvt-runner -> orchestrator). A smoke test for the
# real pipeline would need to drive `pnpm --filter @verichron/orchestrator
# investigate` against real or mvt-runner-decrypted output instead.
#
# Recommend: delete, or rewrite from scratch against the real pipeline.
set -e

echo "============================================================"
echo "SMOKE TEST: Orchestrator + Real Extractors"
echo "============================================================"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# 1. Ensure DB is running
echo "✓ Checking PostgreSQL..."
docker compose -f infra/docker-compose.yml up -d postgres
sleep 2

# 2. Generate synthetic backup for testing
echo "✓ Generating synthetic backup..."
uv run scripts/synthetic_backup_pipeline/full_pipeline.py > /dev/null 2>&1

BACKUP_PATH="$REPO_ROOT/backups/decrypted/00008140-00145CA91E83801C"
RESULTS_PATH="$REPO_ROOT/backups/results_test"
mkdir -p "$RESULTS_PATH"

echo "  Backup: $BACKUP_PATH"
echo "  Results: $RESULTS_PATH"

# 3. Run orchestrator
echo "✓ Running orchestrator..."
cd apps/orchestrator
pnpm install > /dev/null 2>&1
pnpm build > /dev/null 2>&1

DB_URL="postgresql://forensics:forensics_dev_only@localhost:5432/forensics"

npx tsx src/main.ts \
  --backup-path "$BACKUP_PATH" \
  --results-path "$RESULTS_PATH" \
  --db-url "$DB_URL" \
  --db-host localhost \
  --db-port 5432 \
  --db-user forensics
  --db-password forensics_dev_only
  --db-name forensics

# 4. Verify results
echo ""
echo "✓ Checking results..."
if [ -f "$RESULTS_PATH"/*.json ]; then
  echo "  Found extracted JSON files:"
  ls -lh "$RESULTS_PATH"/*.json | awk '{print "    " $9 " (" $5 ")"}'
fi

# 5. Query DB
echo ""
echo "✓ Querying orchestrator DB..."
PGPASSWORD=forensics_dev_only psql -h localhost -U forensics -d forensics -c \
  "SELECT pipeline_run_id, status, stages_completed FROM pipeline_runs ORDER BY created_at DESC LIMIT 3;"

echo ""
echo "============================================================"
echo "✓ SMOKE TEST PASSED"
echo "============================================================"
