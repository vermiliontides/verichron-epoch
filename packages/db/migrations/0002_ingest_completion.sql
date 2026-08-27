-- 0002_ingest_completion.sql
--
-- Makes the ingest ledger record whether an ingest actually FINISHED, not just
-- that it started.
--
-- The bug this closes:
--
-- 0001_init.sql made file_hash the idempotency key, and the writers treated the
-- mere existence of an ingested_files row as "this file is done":
--
--     SELECT 1 FROM ingested_files WHERE file_hash = %s
--     if found: caller skips parsing entirely
--
-- But the row was committed BEFORE the file's forensic_records were written, in
-- a separate transaction. Anything that stopped the process in between -- a
-- parse error on the normal error path, SIGKILL, a Postgres restart, an OOM --
-- left a file_hash present with zero records. Every later run then saw the row,
-- reported the file as already ingested, counted it as a success, and never
-- wrote its records. The evidence was permanently and silently absent from a
-- chain-of-custody database, and no stage ever reported a failure.
--
-- The schema could not express the difference between "ingested this file and it
-- legitimately contained zero records" and "started ingesting this file and
-- died". These columns are that distinction:
--
--   ingest_complete  the records are committed. Only TRUE means skip.
--   record_count     how many forensic_records this file produced. 0 is a
--                    valid, meaningful answer once ingest_complete is TRUE.
--   completed_at     when the unit closed, for audit alongside ingested_at.
--
-- Backfill policy, which is deliberately conservative:
--
--   rows that already have forensic_records  -> complete, count from the table
--   rows with zero forensic_records          -> left INCOMPLETE
--
-- The second case cannot be resolved from the database alone: a row with no
-- records is either a legitimately empty file or a file lost to exactly the bug
-- above, and there is no way to tell which. Leaving those rows incomplete means
-- the next run re-parses them. Re-parsing a genuinely empty file is a cheap
-- no-op; wrongly marking a lost file complete would make the loss permanent and
-- unrecoverable. So the conservative default is to retry.

ALTER TABLE ingested_files
    ADD COLUMN ingest_complete BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN record_count    INTEGER,
    ADD COLUMN completed_at    TIMESTAMPTZ;

COMMENT ON COLUMN ingested_files.ingest_complete IS
    'TRUE only after this file''s forensic_records were committed in the same transaction that set this flag. The dedup skip is gated on this, never on row existence -- see 0002_ingest_completion.sql.';
COMMENT ON COLUMN ingested_files.record_count IS
    'Number of forensic_records written for this file. NULL while incomplete. 0 is valid and distinct from NULL: it means the file was fully processed and genuinely had nothing to record.';

-- Backfill: any pre-existing row that has records demonstrably completed.
UPDATE ingested_files AS f
SET ingest_complete = TRUE,
    record_count    = counts.n,
    completed_at    = f.ingested_at
FROM (
    SELECT file_hash, COUNT(*) AS n
    FROM forensic_records
    GROUP BY file_hash
) AS counts
WHERE f.file_hash = counts.file_hash;

-- Consistency guarantee going forward: a row cannot claim completion without
-- saying how many records it produced, and cannot carry a count while still
-- incomplete. This is what stops a future writer from setting one field and
-- not the other and re-introducing an ambiguous ledger.
ALTER TABLE ingested_files
    ADD CONSTRAINT ingested_files_completion_consistent
    CHECK (
        (ingest_complete AND record_count IS NOT NULL AND completed_at IS NOT NULL)
        OR
        (NOT ingest_complete AND record_count IS NULL AND completed_at IS NULL)
    );

-- Lets a re-run find abandoned units cheaply instead of scanning the ledger.
-- Partial index: the incomplete set is expected to be near-empty in a healthy
-- database, so this stays tiny while the common lookup stays indexed.
CREATE INDEX idx_ingested_files_incomplete
    ON ingested_files (file_hash)
    WHERE NOT ingest_complete;
