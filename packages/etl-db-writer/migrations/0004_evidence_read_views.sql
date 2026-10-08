-- 0004_evidence_read_views.sql  (EPOCH-403)
--
-- The read-side selection rules, defined once in the database so the Python
-- report and the TypeScript reader cannot disagree about them (R27).
--
--   current_forensic_records  The default read. Records from COMPLETED units
--                             only, and for each (evidence_id, file_hash,
--                             source_type) only the highest completed
--                             parser_version (R8's "latest" rule).
--   forensic_records_history  The opt-in full history: records from every
--                             completed unit, every parser_version.
--
-- Both exclude records of incomplete units. Those are partial writes from a
-- unit that never committed its completion (a hard kill mid-ingest); showing
-- them would present half a file as if it were the whole of it.
--
-- A completed parser_version 2 hides version 1. An in-progress or abandoned
-- version 2 does not: "latest" means latest *complete*, so a reader never
-- loses a file's facts because a newer parse is half-done.
--
-- Both views expose parser_version and file_hash from the unit so callers
-- can label where a record came from without another join.

CREATE VIEW forensic_records_history AS
SELECT f.id,
       f.ingest_id,
       f.evidence_id,
       i.derivative_id,
       i.file_hash,
       i.parser_version,
       f.incident_id,
       f.source_type,
       f.event_time,
       f.bug_type,
       f.process_name,
       f.pid,
       f.bundle_id,
       f.fields
FROM forensic_records f
JOIN ingested_files i ON i.ingest_id = f.ingest_id
WHERE i.ingest_complete;

CREATE VIEW current_forensic_records AS
SELECT h.*
FROM forensic_records_history h
JOIN ingested_files i ON i.ingest_id = h.ingest_id
WHERE NOT EXISTS (
    SELECT 1
    FROM ingested_files newer
    WHERE newer.evidence_id = i.evidence_id
      AND newer.file_hash = i.file_hash
      AND newer.source_type = i.source_type
      AND newer.parser_version > i.parser_version
      AND newer.ingest_complete
);

COMMENT ON VIEW current_forensic_records IS
    'Default evidence read: completed units only, latest completed parser_version per (evidence_id, file_hash, source_type). R8, R27.';
COMMENT ON VIEW forensic_records_history IS
    'Opt-in history read: every completed unit, every parser_version. R8.';

-- The correlation pivot read: one evidence item's few mvt_ioc_detection /
-- timestamp_anomaly rows, in time order. (The context read uses 0003's
-- idx_forensic_evidence_time.)
CREATE INDEX idx_forensic_evidence_source_time
    ON forensic_records (evidence_id, source_type, event_time);
