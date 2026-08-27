# extractors/crash

Parses iOS `.ips` crash and analytics-telemetry files (SpringBoard crashes,
watchdog kills, Siri/analytics reports — anything the OS writes as `.ips`)
out of a decrypted backup and writes one `forensic_records` row per file.

Ported from the original `deep_ips_report.py` prototype; the parsing logic
(`parse_ips_file`, `extract_rich_telemetry`) is carried over close to
unchanged — it was already solid. What changed is where state and output
go: the prototype's own `crash_state.db` SQLite table is gone, replaced by
the shared `ingested_files` table (Postgres, keyed on `file_hash`, via
`extractors/db_writer.py`); its own Markdown rendering is gone too — that's
`reporting/generate_report.py`'s job now, reading `forensic_records`.

## Expected input shape

`--backup-path` is searched recursively for `*.ips` files
(`Path(backup_path).rglob("*.ips")`). No assumption is made about where
under the decrypted backup they live — mvt-ios's `decrypt-backup`
reconstructs the original relative paths, so this just walks the whole tree.

## `fields` sub-shape

Everything without a dedicated top-level column on `forensic_records`:

```json
{
  "filename": "...",
  "os_version": "...",
  "hardware_model": "...",
  "cpu_type": "...",
  "bundle_version": "...",
  "parent_proc": "...",
  "parent_pid": 1,
  "proc_launch": "...",
  "proc_path": "...",
  "proc_role": "...",
  "time_awake_since_boot": 5000,
  "exception": { "type": "...", "signal": "...", "code": "...", "subcode": "..." },
  "termination": { "namespace": "...", "code": 6, "by": "..." },
  "faulting_thread": 0,
  "is_simulated": false,
  "is_non_fatal": false,
  "asi": ["..."],
  "vm_region_info": "..."
}
```

Top-level columns populated: `incident_id`, `source_type` (always
`crash_report`), `event_time` (parsed from `captureTime`/`date`; null if
unparseable — a few timestamp formats are tried, see `parse_crash_time`),
`bug_type`, `process_name`, `pid`, `bundle_id`.

## Partial-failure behavior

Per-file, not all-or-nothing. A malformed/unparseable `.ips` file is
skipped and logged to stderr; every other file in the backup still gets
parsed and written. This is safe specifically because failure here can't
produce a *misleading* row — a file either parses into a complete record or
contributes nothing at all, there's no partial-record state in between. The
extractor exits non-zero if any file failed (so the orchestrator marks the
stage `failed` and the report surfaces it), but everything that did parse
is still in `forensic_records` — re-running after a fix only reprocesses
what previously failed, since successfully-ingested files are skipped via
`ingested_files.file_hash`.

## Known gap carried over from the prototype

`extract_rich_telemetry`'s field mapping (e.g. `bug_type`, `hardware_model`)
was reverse-engineered against real `.ips` samples during prototyping, not
against Apple's format spec (there isn't a public one). If a newer iOS
version's `.ips` shape drifts, fields may come back null rather than
raising — spot-check a raw `.ips` file by hand if a report section looks
sparse for files you know contain more.
