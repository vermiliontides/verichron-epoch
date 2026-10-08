# ileapp_bridge stage

Turns [iLEAPP](https://github.com/abrignoni/iLEAPP)'s output files (CSV, TSV,
SQLite) into `ileapp_record` facts. It reads the **iLEAPP output** derivative
(`"reads": "ileapp_output"`); order 20. It follows the
[stage contract](../../../packages/contracts/EXTRACTOR_CONTRACT.md).

The processor runs iLEAPP, not this stage (EPOCH-416): it leaves one report per
backup at `<workspace>/ileapp/<label>/`, marked with `.ileapp_ok`, and the
orchestrator registers it and passes its directory as `--derivative-path`.
This stage reads that directory and nothing else.

> **Runs end to end, with known issues.** `test_end_to_end.py` runs the real
> iLEAPP from its pinned environment, `tools/ileapp` (VER-16), against a
> synthetic backup, with the processor's arguments, and ingests the result. The
> known issues below are ticketed and ordered under VER-24.

## How it works

1. `normalizer.py` finds the CSV, TSV and SQLite outputs in the report and reads
   their rows, skipping `data/` and `media/`, which hold iLEAPP's copies of the
   input. It picks each row's time column by name and normalizes it to UTC, or
   null.
2. `main.py` maps each row to a record. It uses one `ingest()` unit per output
   file, with a `summary` payload (file metadata and a sample of rows).

## `fields`

- `engine`: always `"iLEAPP"`
- `source_artifact`: the file name, or `<db>:<table>`
- every column of the source row, with binary values hex-encoded

The shape varies with the iLEAPP module that produced it.

## Test

```bash
uv run pytest apps/extractors/ileapp_bridge
```

**Known issues:**

| Issue | Ticket |
|---|---|
| Rows that fail to map are dropped while the rest of the file commits; `name` and `id` columns are mis-mapped | EPOCH-417 |
| SQLite outputs are opened read-write; NUL and NaN values break inserts; rows are held in memory | EPOCH-418 |
| Numeric timestamps are assumed to be Unix time | EPOCH-419 |
| iLEAPP exits 0 even when it terminates early or a plugin fails, so the processor marks its output complete; it should read iLEAPP's per-module status | EPOCH-457 |
