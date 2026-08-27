"""Postgres write helpers for Python callers -- the mirror of
packages/db/dbWriter.ts, deliberately semantically identical to it rather
than merely similar.
 
This file was missing entirely (see the migration notes for this repo).
Reconstructed from dbWriter.ts, which documents itself as this file's
TypeScript counterpart and carries the full rationale for the atomicity
guarantees below -- that reasoning isn't repeated here, only the resulting
contract.
 
Why `ingest()` is a context manager here, a callback in TypeScript
------------------------------------------------------------------
Same guarantees, different language idiom. `ingest()` owns the transaction
boundary: it opens the ledger row, hands the caller an IngestUnit, and only
marks the file complete (and commits) if the `with` block exits normally.
Any exception inside the block rolls back everything, ledger row included,
so the next run retries the file from scratch -- there is no way for a
caller to commit a ledger row without having committed that file's records
in the same transaction.
 
    with ingest(conn, run_id, path, source_type=SourceType.X.value) as unit:
        if unit.already_ingested:
            return  # a prior run already finished this file
        unit.set_raw_payload(parsed)
        unit.write(records)
 
`write_record` / `write_records` are exported for use inside a unit and do
not manage a transaction themselves -- the enclosing `ingest()` owns it.
"""
 
from __future__ import annotations
 
import hashlib
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator
 
from psycopg2.extras import Json
 
from normalized_record import NormalizedRecord
 
DEFAULT_DB_URL = "postgresql://forensics:forensics_dev_only@localhost:5432/forensics"
 
 
def compute_file_hash(file_path: Path | str, chunk_size: int = 1024 * 1024) -> str:
    """sha256 of file contents -- the idempotency key for ingested_files.
 
    Streamed in fixed-size chunks rather than read in one call, since this
    hashes SMS attachments and gcloud log exports that can be large enough
    to matter.
    """
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            hasher.update(chunk)
    return hasher.hexdigest()
 
 
class IngestUnit:
    """One file's worth of work, inside one transaction. Nothing here
    commits or rolls back -- that's ingest()'s job."""
 
    def __init__(
        self,
        conn: Any,
        run_id: str,
        file_path: str,
        file_hash: str,
        already_ingested: bool,
    ) -> None:
        self._conn = conn
        self._run_id = run_id
        self.file_path = file_path
        self.file_hash = file_hash
        # True only when a *previous* run marked this file COMPLETE.
        self.already_ingested = already_ingested
        self.records_written = 0
 
    def write(self, records: list[NormalizedRecord]) -> int:
        """Write validated records for this file. Callable more than once."""
        self._guard()
        written = write_records(self._conn, self._run_id, self.file_hash, records)
        self.records_written += written
        return written
 
    def write_one(self, record: NormalizedRecord) -> None:
        self._guard()
        write_record(self._conn, self._run_id, self.file_hash, record)
        self.records_written += 1
 
    def set_raw_payload(self, payload: dict[str, Any]) -> None:
        """Attach the parsed payload to the ledger row, in this same
        transaction. For extractors that can only build the payload after
        parsing (see mvt_iocs, which parses alerts.json before it has a
        payload to attach)."""
        self._guard()
        with self._conn.cursor() as cur:
            cur.execute(
                "UPDATE ingested_files SET raw_payload = %s WHERE file_hash = %s",
                (Json(payload), self.file_hash),
            )
 
    def _guard(self) -> None:
        if self.already_ingested:
            raise RuntimeError(
                f"{self.file_path}: this file is already fully ingested (file_hash "
                f"{self.file_hash[:12]}). Check `already_ingested` and return before "
                "writing; writing here would duplicate records that are already "
                "committed, because the dedup key is the file hash and this file "
                "has one."
            )
 
 
@contextmanager
def ingest(
    conn: Any,
    run_id: str,
    file_path: Path | str,
    *,
    source_type: str,
    raw_payload: dict[str, Any] | None = None,
) -> Iterator[IngestUnit]:
    """Atomic ingest of one file: ledger row + records + completion flag,
    or nothing.
 
    Guarantees, matching dbWriter.ts exactly:
 
    - On a clean exit from the `with` block, the ledger row is marked
      complete with its record count and the whole unit commits together.
    - On an exception, everything rolls back, ledger row included, so the
      file has no trace in the ledger and the next run retries it.
    - `already_ingested` is True only when a previous run marked the file
      complete -- never merely because a row exists.
    - An abandoned unit (row present, not complete -- e.g. a hard kill
      mid-run) is reclaimed: orphaned records are deleted and the file is
      re-ingested under the current run, so a retry cannot double-count a
      partial write.
    """
    file_path = str(file_path)
    file_hash = compute_file_hash(file_path)
    file_name = Path(file_path).name
 
    with conn.cursor() as cur:
        cur.execute(
            "SELECT ingest_complete FROM ingested_files WHERE file_hash = %s",
            (file_hash,),
        )
        row = cur.fetchone()
 
    if row is not None and row[0]:
        # Already fully ingested by a prior run -- nothing to lock, write,
        # commit, or roll back.
        unit = IngestUnit(conn, run_id, file_path, file_hash, True)
        yield unit
        return
 
    with conn.cursor() as cur:
        # Upsert-and-claim. Returns the row's completion state either way. A
        # row that is already complete keeps every original value: a
        # finished ingest is immutable audit data and must not be
        # re-stamped with a later run's id.
        cur.execute(
            """
            INSERT INTO ingested_files
                (file_hash, run_id, file_path, file_name, source_type, raw_payload)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (file_hash) DO UPDATE SET
                run_id      = CASE WHEN ingested_files.ingest_complete
                                   THEN ingested_files.run_id      ELSE EXCLUDED.run_id      END,
                file_path   = CASE WHEN ingested_files.ingest_complete
                                   THEN ingested_files.file_path   ELSE EXCLUDED.file_path   END,
                file_name   = CASE WHEN ingested_files.ingest_complete
                                   THEN ingested_files.file_name   ELSE EXCLUDED.file_name   END,
                source_type = CASE WHEN ingested_files.ingest_complete
                                   THEN ingested_files.source_type ELSE EXCLUDED.source_type END,
                raw_payload = CASE WHEN ingested_files.ingest_complete
                                   THEN ingested_files.raw_payload ELSE EXCLUDED.raw_payload END,
                ingested_at = CASE WHEN ingested_files.ingest_complete
                                   THEN ingested_files.ingested_at ELSE now()                END
            RETURNING ingest_complete
            """,
            (file_hash, run_id, file_path, file_name, source_type, Json(raw_payload or {})),
        )
        already_ingested = bool(cur.fetchone()[0])
 
        if not already_ingested:
            # Reclaim an abandoned unit. A no-op for a row just inserted;
            # for a stranded one it clears partial records so this run's
            # write is the only contribution.
            cur.execute(
                "DELETE FROM forensic_records WHERE file_hash = %s",
                (file_hash,),
            )
 
    unit = IngestUnit(conn, run_id, file_path, file_hash, already_ingested)
 
    try:
        yield unit
    except BaseException:
        conn.rollback()
        raise
 
    if already_ingested:
        # Another process completed this file between the preflight read
        # and the upsert. Nothing was written and nothing should be;
        # release the row lock.
        conn.rollback()
        return
 
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE ingested_files
               SET ingest_complete = TRUE,
                   record_count    = %s,
                   completed_at    = now()
             WHERE file_hash = %s
            """,
            (unit.records_written, file_hash),
        )
    conn.commit()
 
 
def write_record(conn: Any, run_id: str, file_hash: str, record: NormalizedRecord) -> None:
    """Insert one validated NormalizedRecord into forensic_records.
 
    Does NOT manage a transaction -- the caller owns the boundary, normally
    by being inside an ingest() unit.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO forensic_records
                (file_hash, run_id, incident_id, source_type, event_time,
                 bug_type, process_name, pid, bundle_id, fields)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                file_hash,
                run_id,
                record.incident_id,
                record.source_type.value,
                record.event_time,
                record.bug_type,
                record.process_name,
                record.pid,
                record.bundle_id,
                Json(record.fields),
            ),
        )
 
 
# Postgres caps bind parameters at 65535 per statement; chunk so one large
# file (e.g. a gcloud log export) can't build a statement that fails outright.
MAX_PARAMS_PER_STATEMENT = 65535
COLUMNS_PER_RECORD = 10
MAX_RECORDS_PER_STATEMENT = MAX_PARAMS_PER_STATEMENT // COLUMNS_PER_RECORD
 
 
def write_records(conn: Any, run_id: str, file_hash: str, records: list[NormalizedRecord]) -> int:
    """Bulk form of write_record. Does NOT manage a transaction."""
    if not records:
        return 0
 
    with conn.cursor() as cur:
        for offset in range(0, len(records), MAX_RECORDS_PER_STATEMENT):
            chunk = records[offset : offset + MAX_RECORDS_PER_STATEMENT]
            values_sql = ", ".join(["(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"] * len(chunk))
            params: list[Any] = []
            for record in chunk:
                params.extend(
                    [
                        file_hash,
                        run_id,
                        record.incident_id,
                        record.source_type.value,
                        record.event_time,
                        record.bug_type,
                        record.process_name,
                        record.pid,
                        record.bundle_id,
                        Json(record.fields),
                    ]
                )
            cur.execute(
                f"""
                INSERT INTO forensic_records
                    (file_hash, run_id, incident_id, source_type, event_time,
                     bug_type, process_name, pid, bundle_id, fields)
                VALUES {values_sql}
                """,
                params,
            )
 
    return len(records)
 
 
def incomplete_ingests(conn: Any) -> list[tuple[str, str]]:
    """Ledger rows that were started and never finished.

    Expected to be empty. Non-empty means a hard kill mid-unit. Either way
    the next run retries them; this exists so an operator can see them
    rather than infer them.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT file_hash, file_path
              FROM ingested_files
             WHERE NOT ingest_complete
             ORDER BY ingested_at
            """
        )
        return [(row[0], row[1]) for row in cur.fetchall()]
