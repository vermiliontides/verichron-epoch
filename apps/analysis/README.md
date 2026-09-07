# apps/analysis

LLM-assisted triage over mvt-ios's own check-backup output, plus an
optional differential check between two backup snapshots of the same
device. Runs as orchestrator stage `automated_forensics` (order 80 --
after `mvt_iocs`, before `reporting`), or standalone.

## What it does

For each `results/<backup>/*.json` file mvt-ios produced, the file is
chunked and each chunk sent to a local Ollama model with a prompt asking
it to flag indicators of compromise, unrecognized background daemons, or
suspicious network traffic. Verdicts (`safe` / `flagged` / `failed`) are
checkpointed per chunk in a SQLite DB, so an interrupted run resumes
without re-analyzing anything already judged `safe` or `flagged`.

Flagged rows get written to Postgres as `forensic_records` with
`source_type = llm_flagged_anomaly`, one per source file, using the same
`ingest()` dedup pattern every other extractor in this pipeline uses
(keyed by file content hash, independent of the SQLite chunk checkpoint
-- see below).

## Requirements

- A running Ollama instance reachable at `http://localhost:11434`
  (checked before any chunk work starts -- the script exits rather than
  checkpointing chunks as `failed` just because Ollama is down).
- The model pulled locally. Default is `llama3:8b-instruct-q4_K_M`
  (tuned for 6GB VRAM cards -- GTX 1060 / 1660 Ti / RTX 3060 Laptop);
  override with `--model`.
- Postgres reachable at `--db-url`.

## CLI

```
automated_forensics.py --run-id ID --db-url URL --results-path DIR
  [--diff-baseline DIR] [--model NAME] [--max-concurrent N] [--remodel]
```

- `--results-path` (required) -- the `results/<backup>/` directory to
  analyze. Orchestrator passes this automatically.
- `--run-id` / `--db-url` (required) -- same as every other stage.
- `--diff-baseline` (optional) -- an earlier `results/<backup>/`
  snapshot of the *same* device. If given, flags files present in the
  baseline but missing now, or that shrank by more than half -- a
  wipe/tamper signature no single-backup check can see. Skipped
  entirely if omitted, not an error.
- `--model` / `--max-concurrent` -- as described above.
- `--remodel` -- if a prior run analyzed some chunks under a different
  model, this re-queues them under the current `--model` instead of
  leaving a report with mixed, unlabeled provenance. Without it, stale
  chunks are left alone and a warning is logged.

## Output

Everything lands under `results-path/automated_forensics/`:

- `forensic_checkpoint.sqlite3` -- per-chunk status, safe to inspect
  directly with `sqlite3`.
- `comprehensive_forensic_report.md` -- human-readable report, rewritten
  after every file so progress is never lost mid-run.

Plus whatever landed in Postgres (`forensic_records`,
`source_type = llm_flagged_anomaly`).

## Current behavior worth knowing

- **Postgres ingestion is a separate pass from LLM analysis.** After all
  files are checkpointed, the script loops over every *complete* file
  (not just ones analyzed in this invocation) and ingests it. This means
  a file whose chunks all finished in an earlier run, but whose Postgres
  write never landed (say, Postgres was down at the time), gets ingested
  on the next run with zero LLM calls repeated -- `ingest()`'s dedup key
  is the file's content hash, entirely separate from the SQLite chunk
  checkpoint.
- **Flagged rows are stored as-is, not parsed.** Each finding is the
  model's own markdown-table-row text, kept verbatim in
  `fields.raw_finding`. No `process_name`/`pid`/`event_time` extraction
  is attempted -- the model's output is prose-shaped, not a stable
  schema, and parsing it into typed columns would be presenting a guess
  as structured fact. If specific fields turn out to matter for
  Records/Reports filtering later, that's a real follow-up, not
  something silently assumed here.
- **The differential check is two-backup-only and manual.** There's no
  UI concept yet of "compare this backup against an earlier one of the
  same device" -- `--diff-baseline` has to be supplied by hand (or by a
  future caller that knows to look up a prior backup for the same
  device). Orchestrator doesn't pass it automatically.
- **A stage failure here means Postgres ingestion failed**, not that
  some chunks are still `pending`/`failed` in SQLite. An interrupted
  Ollama run leaves an incomplete report and exits 0 from orchestrator's
  point of view; re-running the stage picks up where it left off. This
  matches "resume, don't restart" as the intended recovery path, not an
  error condition orchestrator should retry-with-backoff on.

## Not done

- No UI trigger for this stage specifically, or for picking a
  `--diff-baseline` -- it runs whenever `orchestrator investigate` runs,
  with no baseline, same as every other stage.
- `forensics_benchmark.py` in this same directory is untouched by any of
  this -- not reviewed, not wired, not part of the orchestrator stage.
