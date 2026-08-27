"""
extractors/db_writer.py
 
Shared Postgres write helpers every Python extractor imports. This is the
concrete thing that makes the extractor contract's idempotency and
validation requirements load-bearing instead of aspirational — an
extractor author doesn't hand-write ingest/write SQL and hope it matches
the contract, they call these functions.
 
Owns exactly what the two shared tables need:
  - ingest()      -> a transaction that covers the ingested_files row AND the
                     forensic_records rows for one file, or neither
  - write_record() / write_records() -> validated insert into forensic_records
 
Deliberately does NOT own:
  - source-format parsing (each extractor's own code)
  - the `fields` sub-shape (each extractor owns and documents its own, per
    EXTRACTOR_CONTRACT.md #4)
 
Why `ingest()` is a context manager and not the old `ingest_file()`
-------------------------------------------------------------------
The previous API was two independent calls, each of which committed:
 
    file_hash, already = ingest_file(conn, ...)   # committed here
    if already: return
    records = parse(...)                          # <-- anything failing here
    write_records(conn, run_id, file_hash, records)   # committed here
 
and dedup was keyed on the ledger row merely existing:
 
    SELECT 1 FROM ingested_files WHERE file_hash = %s
    if found: skip this file entirely
 
Those two facts combine into permanent silent data loss. If anything went
wrong between the two commits, the ledger claimed the file was ingested while
none of its records existed, and every later run skipped it — reporting
success — forever. In a chain-of-custody tool, evidence disappeared and
nothing said so.
 
That was not a rare interruption case. All three extractors hit it on their
ordinary error paths: crash/main.py `continue`s when parse_ips_file fails,
mvt_iocs `return`s when alerts.json won't parse, ileapp_bridge `return`s when
every record in an artifact fails to normalize — each after ingest_file() had
already committed the ledger row.
 
The fix is structural rather than a rule to follow. `ingest()` owns the
transaction: the ledger row, the raw payload, the records, and the completion
flag all commit together or roll back together. There is no exposed call that
commits a ledger row on its own, so a caller cannot reconstruct the old
sequence by accident. `write_record`/`write_records` no longer commit at all
(they are also used inside a unit), which is what the caller-owns-the-boundary
change asks for and incidentally stops `write_record` from paying a commit per
row.
 
A future TypeScript extractor uses packages-ts/db-writer/dbWriter.ts, which
mirrors this file's semantics with a callback in place of the context
manager. It used to live under packages-ts/orchestrator/src/ alongside a
now-deleted, never-imported IngestionOrchestrator class; moving it kept the
one real thing in that directory and dropped the dead one, rather than
implying the orchestrator itself depends on it (it never did — see
main-orchestrator/main.ts, which writes nothing to Postgres directly and
only spawns the Python extractors that do).
"""
 
from __future__ import annotations
 
import hashlib
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator
 
import psycopg2
import psycopg2.extras
 
# Resolve packages-py directory
_EXTRACTORS_DIR = Path(__file__).resolve().parent
_PACKAGES_PY = _EXTRACTORS_DIR.parent
sys.path.insert(0, str(_PACKAGES_PY / "contracts"))
 
from normalized_record import NormalizedRecord  # noqa: E402
 
 
def compute_file_hash(path: str | Path) -> str:
    """sha256 of file contents — the idempotency key for ingested_files.
    Streamed in chunks so this doesn't load a large SMS attachment or
    gcloud log export fully into memory just to hash it."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()
 
 
class IngestUnit:
    """One file's worth of work, inside one transaction.
 
    Handed to the caller by `ingest()`. The caller checks
    `already_ingested`, then writes records and (optionally) the raw payload.
    Nothing here commits; `ingest()` commits once on clean exit.
    """
 
    def __init__(self, conn, run_id: str, file_path: Path, file_hash: str, already_ingested: bool):
        self._conn = conn
        self._run_id = run_id
        self.file_path = file_path
        self.file_hash = file_hash
        self.already_ingested = already_ingested
        self.records_written = 0
 
    def write(self, records: list[NormalizedRecord]) -> int:
        """Write validated records for this file. Callable more than once;
        counts accumulate into the ledger's record_count."""
        self._guard()
        written = write_records(self._conn, self._run_id, self.file_hash, records)
        self.records_written += written
        return written
 
    def write_one(self, record: NormalizedRecord) -> None:
        """Single-record form, for extractors that produce one record per file
        (crash reports). No longer more expensive than batching per commit,
        since neither commits."""
        self._guard()
        write_record(self._conn, self._run_id, self.file_hash, record)
        self.records_written += 1
 
    def set_raw_payload(self, payload: dict[str, Any]) -> None:
        """Attach the parsed payload to the ledger row.
 
        Extractors that can only build the payload after parsing (crash,
        mvt_iocs) used to insert `{}`, commit, parse, then UPDATE and commit
        again — a second window in which the ledger was wrong. Inside a unit
        this is just part of the same transaction.
        """
        self._guard()
        with self._conn.cursor() as cur:
            cur.execute(
                "UPDATE ingested_files SET raw_payload = %s WHERE file_hash = %s",
                (psycopg2.extras.Json(payload), self.file_hash),
            )
 
    def _guard(self) -> None:
        if self.already_ingested:
            raise RuntimeError(
                f"{self.file_path.name}: this file is already fully ingested "
                f"(file_hash {self.file_hash[:12]}). Check `already_ingested` and return "
                "before writing; writing here would duplicate records that are already "
                "committed, because the dedup key is the file hash and this file has one."
            )
 
 
@contextmanager
def ingest(
    conn,
    run_id: str,
    file_path: str | Path,
    source_type: str,
    raw_payload: dict[str, Any] | None = None,
) -> Iterator[IngestUnit]:
    """
    Atomic ingest of one file: ledger row + records + completion flag, or nothing.
 
    Usage::
 
        with ingest(conn, run_id, path, source_type=..., raw_payload=summary) as unit:
            if unit.already_ingested:
                pass            # dedup — prior run finished this file
            else:
                unit.write(records)
 
    Guarantees:
 
    - On clean exit the ledger row is marked complete with its record count and
      everything commits together.
    - On any exception the whole unit rolls back, including the ledger row, so
      the file has no trace in the ledger and the NEXT run retries it. That is
      the property the old two-commit API lacked.
    - `already_ingested` is True only when a previous run marked the file
      complete — never merely because a row exists.
    - An abandoned unit from an earlier crash (row present, not complete) is
      reclaimed: its orphaned records are deleted and it is re-ingested under
      the current run_id. Without this, rows stranded by the old code, or by a
      hard kill of the new code, would be retried but their partial records
      double-counted.
 
    Concurrency: the upsert below locks the ledger row for the duration of the
    transaction, so two extractors racing on the same file serialize instead of
    both deciding to write. The previous SELECT-then-INSERT was a read outside
    any lock; its `ON CONFLICT DO NOTHING` avoided a crash on the race but left
    both callers believing they should write records.
    """
    file_path = Path(file_path)
    file_hash = compute_file_hash(file_path)
 
    try:
        with conn.cursor() as cur:
            # Fast path for the common case on a re-run: the file is already
            # complete, so there is nothing to lock and nothing to write.
            #
            # This read is deliberately unlocked, which is safe because
            # ingest_complete is monotonic -- it goes FALSE -> TRUE exactly
            # once and never back, so a TRUE observed here cannot be
            # invalidated by a concurrent transaction. A FALSE might be stale,
            # which is why FALSE falls through to the locking upsert below
            # rather than being acted on.
            #
            # Without this, re-running against a large backup would issue a
            # no-op UPDATE per already-finished file, producing a dead tuple
            # and a row lock per file for no reason.
            cur.execute(
                "SELECT ingest_complete FROM ingested_files WHERE file_hash = %s",
                (file_hash,),
            )
            row = cur.fetchone()
            already_ingested = bool(row is not None and row[0])
 
        if already_ingested:
            # Nothing was modified, so there is nothing to commit. Hand the
            # caller a unit that refuses writes and stop.
            yield IngestUnit(conn, run_id, file_path, file_hash, already_ingested=True)
            # psycopg2 opened an implicit transaction for the SELECT above and
            # will hold it until something ends it. Re-running against a large
            # backup takes this branch once per already-ingested file, so
            # without this the connection sits idle-in-transaction for the whole
            # sweep -- pinning the xmin horizon and blocking autovacuum on these
            # tables. rollback() rather than commit() because there is nothing
            # to keep.
            conn.rollback()
            return
 
        with conn.cursor() as cur:
            # Upsert-and-lock. Returns the row's completion state either way.
            # For a row that is already complete every column keeps its
            # original value: a finished ingest is immutable audit data and
            # must not be re-stamped with a later run's id or path.
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
                (
                    file_hash,
                    run_id,
                    str(file_path),
                    file_path.name,
                    source_type,
                    psycopg2.extras.Json(raw_payload if raw_payload is not None else {}),
                ),
            )
            already_ingested = bool(cur.fetchone()[0])
 
            if not already_ingested:
                # Reclaim an abandoned unit. A no-op for a row we just
                # inserted; for a stranded one it clears partial records so
                # this run's write is the only contribution.
                cur.execute("DELETE FROM forensic_records WHERE file_hash = %s", (file_hash,))
 
        unit = IngestUnit(conn, run_id, file_path, file_hash, already_ingested)
        yield unit
 
        if already_ingested:
            # Another process completed this file between the unlocked read
            # above and the upsert. Nothing was written and nothing should be;
            # release the row lock rather than holding it until the caller's
            # next commit, which may be many files later.
            conn.rollback()
        else:
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
 
    except BaseException:
        # BaseException, not Exception: a KeyboardInterrupt or SystemExit
        # between the ledger row and the records is precisely the interruption
        # this function exists to survive, and `except Exception` would let it
        # through with the transaction open.
        conn.rollback()
        raise
 
 
def write_record(conn, run_id: str, file_hash: str, record: NormalizedRecord) -> None:
    """
    Insert one validated NormalizedRecord into forensic_records.
 
    Takes a NormalizedRecord *instance*, not a dict — that's the enforcement
    point. There's no code path here that accepts an un-validated row; the
    Pydantic model has to construct successfully before this function can
    even be called. This is the class of bug the original crash-report
    extractor had (a field silently drifting from what the report expected)
    pushed as early as it can go — construction time, not report-render time.
 
    Does NOT commit. The caller owns the transaction boundary, normally by
    being inside an `ingest()` unit. This function used to commit per call,
    which made a row-by-row extractor pay a commit per row and, worse, made
    a file's records durable independently of its ledger row.
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
                psycopg2.extras.Json(record.fields),
            ),
        )
 
 
def write_records(
    conn, run_id: str, file_hash: str, records: list[NormalizedRecord]
) -> int:
    """
    Bulk form — same validation guarantee as write_record, one round trip for
    the whole batch instead of one per row. Extractors processing a
    high-volume source (gcloud logs, SMS attachments) should call this rather
    than looping write_record, or every row pays its own network round trip.
 
    Does NOT commit; see write_record.
 
    Returns the number of records written.
    """
    if not records:
        return 0
 
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO forensic_records
                (file_hash, run_id, incident_id, source_type, event_time,
                 bug_type, process_name, pid, bundle_id, fields)
            VALUES %s
            """,
            [
                (
                    file_hash,
                    run_id,
                    r.incident_id,
                    r.source_type.value,
                    r.event_time,
                    r.bug_type,
                    r.process_name,
                    r.pid,
                    r.bundle_id,
                    psycopg2.extras.Json(r.fields),
                )
                for r in records
            ],
        )
    return len(records)
 
 
def incomplete_ingests(conn) -> list[tuple[str, str]]:
    """Ledger rows that were started and never finished: (file_hash, file_path).
 
    Expected to be empty in a healthy database. Non-empty means either a hard
    kill mid-unit, or rows the 0002 migration could not classify — files that
    predate this fix and have no records, which may be genuinely empty or may
    be the ones the old code lost. Either way the next run retries them; this
    exists so an operator can see them rather than infer them.
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