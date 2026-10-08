# Reporting stage (`apps/reporting`)

The last pipeline stage (order 1000). It renders the investigation report,
`investigation_report.md`, for the run's evidence:

| Section | Contents |
|---|---|
| Run completeness | Each stage's status |
| Provenance | The derivatives this run read, and where the facts shown came from |
| IOC detections and correlated activity | Everything within the correlation window around each detection |
| Per-source-type sections | Crash reports today |

Facts are read by evidence through `current_forensic_records`, so the report and
the desktop app agree (R27). A run with no registered evidence gets a report that
says so, never an empty one that reads as "nothing found".

## Run

It runs as part of the pipeline, writing to `<results-path>/investigation_report.md`.
To run it by hand:

```bash
uv run python apps/reporting/generate_report.py --run-id <run> --db-url <url> [--results-path <dir>] [--output <file>]
```

Its tests are in `scripts/test_evidence_reads.py`; they run against real
PostgreSQL.

**Known issues:**

| Issue | Ticket |
|---|---|
| Fact types without a section are left out silently | EPOCH-448 |
| No section for iLEAPP records | EPOCH-434 |
| The correlation window is defined here and in the reader | EPOCH-425 |
