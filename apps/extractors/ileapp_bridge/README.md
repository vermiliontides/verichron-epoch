# ileapp_bridge stage

Turns [iLEAPP](https://github.com/abrignoni/iLEAPP)'s results into
`ileapp_record` facts. It reads the **iLEAPP output** derivative
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

It reads exactly two files of the report (EPOCH-461): `_lava_artifacts.db`,
iLEAPP's structured results with one table per artifact, and `_lava_data.lava`,
the manifest describing each table. The TSV/CSV exports and HTML report are
presentation formats built from the same data, and `data/` and `media/` are
iLEAPP's copies of the input, so none of them is read.

1. `lava.py` checks the manifest (schema version 2, `processing_status`
   `Complete`) and that its artifact tables and the database's are the same
   set. Either failing stops the stage.
2. For each artifact it reads the table, read-only and immutable, so the
   derivative's bytes never change. The row count must equal the manifest's
   `record_count`, and every column must have a header in its `column_map`;
   otherwise that artifact fails and the rest continue.
3. `main.py` files each artifact as one `ingest()` unit, so all of its rows
   commit or none do. The unit's identity is a sha256 over the table's name,
   columns, declared types and rows, recorded as
   `_lava_artifacts.db#<table>`; the same table from a re-run of iLEAPP is a
   dedup hit. The payload is a `summary`: the artifact, its counts and a sample
   of rows.

**Time.** iLEAPP's plugins convert their sources' time formats themselves and
declare the result `datetime`, stored as Unix UTC seconds. `event_time` is the
artifact's **first declared** `datetime` column. An artifact with none is
untimed; a value that isn't Unix seconds gives `event_time = null`, keeps its
raw value in `fields`, and is counted in the stage's notes (R11). No column is
chosen or parsed by name.

## `fields`

- every column of the row, under **iLEAPP's original header** (e.g. `Visit
  Timestamp`, `URL`), binary values hex-encoded;
- `engine`: always `"iLEAPP"`;
- `source_artifact`, `module`, `category`: the artifact as the manifest names it;
- `source_path`: the input file the artifact was read from, relative to the
  evidence.

A header equal to one of these five keys fails its artifact rather than being
overwritten. The shape otherwise varies with the iLEAPP module.

## Test

```bash
uv run pytest apps/extractors/ileapp_bridge
```

**Known issues:**

| Issue | Ticket |
|---|---|
| NUL characters and NaN values break inserts; an artifact's rows are held in memory | EPOCH-418 |
| Whether a plausibility window is reported over iLEAPP's declared times | EPOCH-419 |
| iLEAPP exits 0 even when it terminates early or a plugin fails, so the processor marks its output complete; it should read iLEAPP's per-module status | EPOCH-457 |
