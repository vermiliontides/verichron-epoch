# Verichron Orchestrator (`@verichron/orchestrator`)

The orchestrator is the **Control Plane** conductor for Verichron Epoch forensic investigation runs. It manages execution lifecycles, dynamically discovers pipeline stages from disk, provisions isolated subprocesses, and tracks execution states directly in PostgreSQL—all while ensuring that the failure of a single stage or backup never halts the broader pipeline.

---

## Core Architectural Responsibilities

* **Control Plane Isolation:** Manages high-level pipeline status and execution state machine tracking (`pipeline_runs`, `pipeline_stage_status`) via direct, lightweight `pg` queries, completely decoupled from heavy ETL batch-writing packages.


* **Dynamic Stage Discovery:** Automatically scans disk locations (`apps/extractors/*`, `apps/analysis/`, `apps/reporting/`) for `stage.json` manifests, enforcing execution order and schema compliance dynamically without hardcoded step lists.


* **Pre-Flight Path Integrity Guard:** Validates backup directories prior to database insertion, rejecting malformed literals, missing manifests (`Manifest.db` / `Info.plist`), or CLI flag misinterpretations before wasting system resources.
* **Fault-Isolated Multi-Backup Execution:** Accepts $N$ decrypted backups, processing each independently so that a failure in one device or extractor stage remains strictly contained.


* **Intelligent Environment Resolution:** Resolves project-local virtual environments (`<repo-root>/.venv/bin/python`) once at startup to guarantee dependency safety across Python-based extractors.



---

## Module Architecture

To maintain high scalability and strict separation of concerns, the orchestrator codebase is modularized under `apps/orchestrator/src/`:

* **`main.ts`**: The lean application entry point and execution loop coordinator.


* **`cli.ts`**: Handles command-line argument parsing (`parseArgs`), environment configuration (`DATABASE_URL`), and raw `argv` diagnostics.
* **`pipeline.ts`**: Manages subprocess execution (`spawn`), results-path derivation via `@verichron/contracts`, and pre-flight path validation safeguards.


* **`discovery.ts`**: Handles filesystem traversal, manifest validation against `stage.json` schemas, and uniqueness checks for execution order.
* **`db.ts`**: Manages atomic PostgreSQL state transitions (`pending`, `running`, `succeeded`, `failed`) and run creation.


* **`types.ts`**: Centralizes TypeScript interfaces (`StageManifest`, `StageDefinition`, `RunConfig`, `CliConfig`).

---

## Usage & Execution

The orchestrator is executed as a monorepo workspace task via `pnpm`.

### Standard Investigation Run

To run the orchestrator against a decrypted mvt-runner workspace:

```bash
pnpm --filter @verichron/orchestrator investigate -- --workspace <mvt-runner-workspace-dir>

```

### Operational Guarantee

1. **Pre-Flight Validation:** The pipeline checks that target directories exist and contain valid forensic metadata flags. Invalid entries log descriptive failures to the analysis summary without writing partial records to PostgreSQL.
2. **Execution Logging:** Per-stage logs stream live to standard output while capturing `stderr` safely for diagnostic inspection.
3. **Summary Export:** Upon completion, a comprehensive execution report is compiled and written to `analysis-summary.json` in the parent workspace directory.