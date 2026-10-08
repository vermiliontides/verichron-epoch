# ileapp_bridge stage

Runs [iLEAPP](https://github.com/abrignoni/iLEAPP) over the **decrypted backup**
and turns its output files (CSV, TSV, SQLite) into `ileapp_record` facts. Order
20; it follows the [stage contract](../../../packages/contracts/EXTRACTOR_CONTRACT.md).

> **Not working end to end yet.** iLEAPP's plugin loader has been finding no
> plugins (VER-16, EPOCH-309). `mise run setup` checks out the `iLEAPP/`
> submodule and builds its environment. The fixes below are ticketed and ordered
> under VER-24.

## How it works

1. `bridge.py` checks for `Manifest.db` or `Info.plist`. It picks iLEAPP's input
   type (`itunes` for a backup, `fs` for an extracted filesystem) and runs
   `iLEAPP/ileapp.py` **as a subprocess** with iLEAPP's own pinned interpreter,
   `tools/ileapp/.venv/bin/python`. iLEAPP's dependencies live there, not in the
   workspace venv, because they conflict with mvt's.
2. `normalizer.py` finds the CSV, TSV and SQLite outputs and reads their rows. It
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

**Known issues** (from the iLEAPP review):

| Issue | Ticket |
|---|---|
| Output goes to a shared, cwd-relative `./ileapp_raw_output`, and every earlier run's output is ingested too | EPOCH-416 |
| Rows that fail to map are dropped while the rest of the file commits; `name` and `id` columns are mis-mapped | EPOCH-417 |
| SQLite outputs are opened read-write; NUL and NaN values break inserts; rows are held in memory | EPOCH-418 |
| Numeric timestamps are assumed to be Unix time | EPOCH-419 |
