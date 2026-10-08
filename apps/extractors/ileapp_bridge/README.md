# ileapp_bridge stage

Runs [iLEAPP](https://github.com/abrignoni/iLEAPP) over the **decrypted backup**
and turns its output files (CSV, TSV, SQLite) into `ileapp_record` facts. Order
20; it follows the [stage contract](../../../packages/contracts/EXTRACTOR_CONTRACT.md).

> **Runs end to end, with known issues.** iLEAPP discovers its plugins and
> produces results from its own pinned environment, `tools/ileapp`, built by
> `mise run setup` (VER-16); `test_end_to_end.py` runs it against a synthetic
> backup. The known issues below are ticketed and ordered under VER-24.

## How it works

1. `bridge.py` checks for `Manifest.db` or `Info.plist`. It picks iLEAPP's input
   type (`itunes` for a backup, `fs` for an extracted filesystem) and runs
   `iLEAPP/ileapp.py` **as a subprocess** with iLEAPP's own pinned interpreter,
   `tools/ileapp/.venv/bin/python`. iLEAPP's dependencies live there, not in the
   workspace venv, because they conflict with mvt's.
2. `normalizer.py` finds the CSV, TSV and SQLite outputs and reads their rows,
   skipping `data/` and `media/`, which hold iLEAPP's copies of the input. It
   picks each row's time column by name and normalizes it to UTC, or null.
3. `main.py` maps each row to a record. It uses one `ingest()` unit per output
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
| Output goes to a shared, cwd-relative `./ileapp_raw_output`, and every earlier run's output is ingested too | EPOCH-416 |
| Rows that fail to map are dropped while the rest of the file commits; `name` and `id` columns are mis-mapped | EPOCH-417 |
| SQLite outputs are opened read-write; NUL and NaN values break inserts; rows are held in memory | EPOCH-418 |
| Numeric timestamps are assumed to be Unix time | EPOCH-419 |
| iLEAPP exits 0 even when it terminates early or a plugin fails, so the bridge reports success; it should read iLEAPP's per-module status | EPOCH-457 |
