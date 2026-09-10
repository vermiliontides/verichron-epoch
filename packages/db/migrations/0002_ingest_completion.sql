-- 0002_ingest_completion.sql
--
-- Makes the ingest ledger record whether an ingest actually FINISHED, not just
-- that it started.

ALTER TABLE ingested_files
    ADD COLUMN IF NOT EXISTS ingest_complete BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS record_count    INTEGER,
    ADD COLUMN IF NOT EXISTS completed_at    TIMESTAMPTZ;

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

-- Consistency guarantee going forward: handled idempotently via a DO block 
-- since standard PostgreSQL ALTER TABLE does not support ADD CONSTRAINT IF NOT EXISTS.
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'ingested_files_completion_consistent'
    ) THEN
        ALTER TABLE ingested_files
            ADD CONSTRAINT ingested_files_completion_consistent
            CHECK (
                (ingest_complete AND record_count IS NOT NULL AND completed_at IS NOT NULL)
                OR
                (NOT ingest_complete AND record_count IS NULL AND completed_at IS NULL)
            );
    END IF;
END $$;

-- Lets a re-run find abandoned units cheaply instead of scanning the ledger.
CREATE INDEX IF NOT EXISTS idx_ingested_files_incomplete
    ON ingested_files (file_hash)
    WHERE NOT ingest_complete;