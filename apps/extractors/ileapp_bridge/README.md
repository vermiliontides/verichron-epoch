# iLEAPP Bridge Extractor

Consumes iLEAPP extraction outputs (CSV, TSV, and SQLite databases) and writes them into the shared `forensic_records` Postgres table using the normalized extractor contract.

## Input Shape

The extractor expects a decrypted iOS backup or filesystem extraction directory containing the original device data. iLEAPP is invoked to extract and parse this data, and the outputs (typically in `<output>/*.csv`, `<output>/*.tsv`, and `<output>/*.db`) are normalized and persisted.

## Source Type

All records produced by this extractor have `source_type: "ileapp_record"`.

## Fields Sub-Shape

Each record in `fields` contains:

- `engine` — always `"iLEAPP"` (string)
- `source_artifact` — filename or `{db_name}:{table_name}` identifier of the source artifact (string)
- All columns from the iLEAPP output as key-value pairs, with binary values hex-encoded

The sub-shape is dynamic and determined by the specific iLEAPP modules that ran. Common fields include timestamps, process names, bundle IDs, and module-specific forensic data (e.g., internet history, SMS attachments, network usage).

Example (Safari history):

```json
{
  "fields": {
    "engine": "iLEAPP",
    "source_artifact": "Safari_history_db:history_table",
    "url": "https://example.com",
    "visit_count": 5,
    "last_visit_time": "2024-01-15 10:30:00",
    "...": "..."
  }
}
```

## Partial-Failure Behavior

**Partial success is preserved; failures do not abort the run:**

- If iLEAPP extraction itself fails (e.g., backup is malformed or iLEAPP crashes), the stage exits non-zero. The orchestrator records the failure and continues with the next stage.
- If a single iLEAPP output file (CSV/TSV/DB) has parsing issues, the file is skipped with an error logged to stderr. Other files continue.
- If a single record within a file is malformed, that record is dropped with an error logged to stderr. Other records from the same file continue.

This design allows partial extraction (e.g., successfully parsing 95 out of 100 tables) to still produce usable results, while ensuring the report remains transparent about what failed.

## Idempotency

The extractor uses file content hashing (sha256) to deduplicate `ingested_files` entries. Re-running the extractor against the same backup with the same iLEAPP version will skip re-parsing and re-writing records for files that have already been successfully ingested, making re-runs cheap and safe.

## Environment

- **Python version**: 3.9+
- **Dependencies**: psycopg2, pydantic, ileapp
- **iLEAPP availability**: The extractor expects `ileapp` to be installed as a Python module. If the bundled submodule at `./iLEAPP` exists, it is added to the sys.path automatically.

## CLI Contract

See `contracts/EXTRACTOR_CONTRACT.md` for the full extractor contract. This stage accepts:

```
python3 main.py \
  --run-id <uuid> \
  --backup-path <path/to/decrypted/backup> \
  --db-url postgresql://... \
  [--output <staging/dir>] \
  [--clean] \
  [--results-path <unused>]
```

Exit code `0` means success; any non-zero code signals failure (details in stderr).

## Known Limitations

- **Data size**: iLEAPP output files can be large (100k+ rows). The normalizer streams large SQLite tables in 1000-row batches to avoid memory blowup.
- **Timestamp inference**: Timestamp columns are inferred by keyword matching (looking for "time", "date", "timestamp", "created" in column names). Artifacts without recognizable timestamp columns will have `event_time: null` in the record, which is valid but limits correlation window participation.
- **Binary data**: Binary columns (e.g., blob fields from SQLite) are hex-encoded as strings in the normalized record, preserving them but not attempting to re-parse them. The raw payload (summary metadata) is still available in `ingested_files.raw_payload` for later deep inspection if needed.
