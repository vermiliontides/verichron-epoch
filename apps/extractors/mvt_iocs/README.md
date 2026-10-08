# mvt_iocs stage

Turns mvt-ios's own analysis output into facts. Order 70; it reads the **mvt
results** derivative (`requiresResultsPath: true`). It follows the
[stage contract](../../../packages/contracts/EXTRACTOR_CONTRACT.md).

mvt's verdicts are primary evidence here, not a second-hand parse. An alert *is*
mvt's judgment that something matched an indicator or a built-in heuristic, and
there's no more authoritative source to prefer.

| Input | Source type | One record per | Payload |
|---|---|---|---|
| `alerts.json` | `mvt_ioc_detection` | alert, timed or not | `full` |
| `timeline.csv` + `backup_info.json` | `timestamp_anomaly` | timeline event dated more than one day after the backup was taken | `summary` |

## `mvt_ioc_detection` fields

Top-level columns are `event_time`, `process_name`, `pid` and `bundle_id`, from
the alert's event. `fields` holds:

```json
{
  "level": "critical",
  "source_module": "ProfileEvents",
  "message": "...",
  "matched_indicator": { "value": "...", "type": "...", "name": "...", "stix2_file_name": "..." },
  "original_event": { "...": "..." }
}
```

`matched_indicator` is `null` for mvt's built-in heuristics (no STIX2 match).
Both kinds are stored. Untimed alerts are kept; they just can't take part in
the report's correlation window.

## `timestamp_anomaly`

No single mvt module checks a timestamp against when the backup was taken, so
this stage does. The backup date comes from `backup_info.json`'s `Last Backup Date`. An
event more than a day past it (the grace period absorbs clock and timezone
differences) is recorded with its plugin, description and offset from the
backup date.

Plugins whose events are legitimately in the future, like Calendar
(`FORWARD_LOOKING_PLUGINS`), are excluded.

## Test

The atomicity cases are in `scripts/test_extractor_ingest_atomicity.py`.

**Known issues:**

| Issue | Ticket |
|---|---|
| Bad rows in a file still let the rest commit | EPOCH-417 |
| The matched indicator shows as "[object Object]" in the app; no fixtures from real mvt output | EPOCH-446 |
| A missing `--results-path` is guessed from `--backup-path` | EPOCH-446 |
