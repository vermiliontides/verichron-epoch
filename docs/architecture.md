# Architecture

This page explains what each part of Verichron Epoch does and how evidence moves
through it. Identity and provenance are explained in
[evidence-model.md](evidence-model.md); the rules referenced as `R<n>` are in
[rules.md](rules.md).

## The pipeline

```mermaid
flowchart LR
  A[Encrypted backup] --> B[processor]
  B -->|evidence/ sidecar + manifest| W[(Workspace)]
  B -->|decrypted/ + results/ with markers| W
  W --> C[orchestrator]
  C -->|register evidence| D[(PostgreSQL)]
  C -->|spawn in order| S[stages]
  S -->|facts via ingest()| D
  D --> R[report]
  D --> E[desktop app]
```

Evidence moves through five steps: **acquire → process → extract (ETL) →
analyze → report**. The orchestrator coordinates the last three.

1. **Acquire.** The desktop app pulls an encrypted backup from a connected
   device (or the examiner supplies one).
2. **Process (`processor`).** For each backup it:
   - hashes every file into a canonical manifest, which gives the evidence its
     identity (`content_root`);
   - decrypts it with `mvt-ios`, then repairs malformed SQLite databases;
   - runs `mvt-ios check-backup` against a hashed copy of the IOC set.

   Each output is a **derivative**: a separate product of the evidence, which
   itself is never altered. Each carries a marker recording what produced it.
3. **Extract (ETL, `apps/extractors/*`).** The orchestrator verifies the
   evidence and markers, registers the evidence, its device and derivatives, and
   decides whether a run is needed. It then runs the stages in `stage.json` order
   as subprocesses, passing each one its identity. Each extraction stage reads
   one derivative, normalizes it, and loads facts through the one writer,
   `ingest()`, one atomic unit per source file.
4. **Analyze (`apps/analysis`).** The LLM stage proposes leads from the facts;
   leads are never evidence.
5. **Report (`apps/reporting`, the desktop app).** The report and the app read
   facts through database views, so both languages apply the same selection
   rules (R27).

## Components

Each concern has exactly one owner (R2).

| Component | Owns | Does not |
|---|---|---|
| `apps/epoch` | Device pull, starting runs, showing runs, records, IOCs and reports | Decide run state or write facts |
| `apps/processor` | Hashing evidence, decrypt, repair, IOC set, `mvt-ios` invocation, completion markers | Touch the database |
| `apps/orchestrator` | Evidence registration, run creation, stage order, run and stage state | Parse evidence |
| Stages (`apps/extractors/*`, `apps/analysis`, `apps/reporting`) | Turning one derivative's files into facts, or rendering the report | Choose their own identity (R16) or commit transactions (R15) |
| `packages/etl-db-writer` | `ingest()`, the ledger, migrations | Parse anything (R15) |
| `packages/etl-db-reader` | Named, read-only questions for the app (R24) | Write |
| `packages/contracts` | Schemas, record types, marker formats, path helpers | Policy (R3) |

Languages split by role: TypeScript runs the control plane (app, processor,
orchestrator); Python parses, writes facts and renders the report. They meet
only at process boundaries (a stage is a subprocess) and in the database.

## The workspace

The processor creates one workspace per batch of backups. Each backup is a
*label* (its directory name).

```
<workspace>/
  evidence/<label>/sidecar.json            identity: content_root, file count, source path
  evidence/<label>/manifests/<root>.sha256 canonical manifest, content-addressed, never overwritten
  evidence/<label>/fingerprints.json       stat cache that makes re-hashing cheap
  decrypted/<label>/                       decrypted backup + .mvt_decrypted_ok marker
  results/<label>/                         mvt-ios output + .mvt_check_ok marker
  logs/<label>.log                         check-backup output
  summary.json, summary.md                 the processor's run summary
```

Today the orchestrator and app find these directories by layout. A workspace
manifest replaces that (R18, EPOCH-427).

## The database

| Group | Tables and views | Purpose |
|---|---|---|
| Evidence | `devices`, `evidence_items`, `evidence_locations`, `evidence_derivatives`, `evidence_events` | What the evidence is, where it was seen, what was derived from it, and an append-only custody log |
| Runs | `pipeline_runs`, `pipeline_stage_status`, view `run_completeness` | Audit of each pipeline invocation; completeness is derived in one place (R23) |
| Facts | `ingested_files`, `forensic_records`, views `current_forensic_records`, `forensic_records_history` | The ledger of processed source files and the facts they produced |

Migrations live in `packages/etl-db-writer/migrations` and are applied by
`migrate.py` (see [development.md](development.md)).

## Stages

A stage is a directory with a `stage.json` the orchestrator discovers at startup.
The contract is in
[EXTRACTOR_CONTRACT.md](../packages/contracts/EXTRACTOR_CONTRACT.md).

| Stage | Order | Reads | Writes |
|---|---|---|---|
| `crash` | 10 | decrypted backup | `crash_report` |
| `ileapp_bridge` | 20 | decrypted backup, via iLEAPP | `ileapp_record` |
| `mvt_iocs` | 70 | mvt results | `mvt_ioc_detection`, `timestamp_anomaly` |
| `analysis` | 80 | mvt results, via a local LLM | `llm_flagged_anomaly` (leads) |
| `reporting` | 1000 | the database | the investigation report |

## Builds

The first release is a **Lab build**: air-gapped, with IOC sets and tools
imported from media and recorded (EPOCH-438, EPOCH-439). A Personal build comes
later from the same core. Lab and Personal are separate builds, not a runtime
switch ([decisions](decisions.md#product-and-builds)).

## Changes already decided

These are settled but not yet built; this page will change when they land.

| Change | Ticket |
|---|---|
| iLEAPP output becomes its own registered derivative | EPOCH-416 |
| The app reads typed events from the processor and the orchestrator instead of scraping logs | EPOCH-443, EPOCH-445 |
| A workspace manifest replaces path inference | EPOCH-427 |
| Secrets travel by environment, never on the command line | EPOCH-423 |
| The TypeScript fact writer is removed; Python is the only writer | EPOCH-452 |
