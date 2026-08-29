/**
 * Postgres write helpers for TypeScript callers — the mirror of
 * packages/db/db_writer.py, and deliberately semantically identical
 * to it rather than merely similar.
 *
 * Why `ingest()` takes a callback instead of exposing `ingestFile()`
 * -----------------------------------------------------------------
 * This file previously offered `ingestFile()` / `writeRecord()` / `writeRecords()`
 * as independent calls, exactly like the Python module did, and inherited the
 * same defect: the `ingested_files` ledger row was written before the file's
 * `forensic_records`, dedup was keyed on that row merely existing
 *
 *     SELECT 1 FROM ingested_files WHERE file_hash = $1 LIMIT 1
 *     -> alreadyIngested: true, caller skips the file entirely
 *
 * and nothing tied the two writes into one transaction. Any failure in between
 * left a ledger row claiming a file was ingested while none of its records
 * existed. Every later run then skipped it, reported success, and the evidence
 * was permanently absent from a chain-of-custody database with no error
 * anywhere.
 *
 * The TypeScript version had it worse in one respect: it issued no BEGIN at
 * all, so under node-postgres's default autocommit every statement committed
 * on its own. There was not even a transaction to lose.
 *
 * `ingest()` now owns the boundary. It BEGINs, hands the caller a unit, and
 * COMMITs only after marking the ledger row complete with its record count —
 * or ROLLBACKs everything, ledger row included, so the next run retries the
 * file. No exported function commits a ledger row on its own, so the old
 * sequence cannot be reassembled by a caller.
 *
 * `writeRecord`/`writeRecords` are still exported for use inside a unit and no
 * longer manage transactions themselves.
 */
import type { Client, PoolClient } from 'pg';
import type { NormalizedRecord as NormalizedRecordShape } from '@verichron/contracts';
export declare const DEFAULT_DB_URL = "postgresql://forensics:forensics_dev_only@localhost:5432/forensics";
type Db = Client | PoolClient;
/**
 * sha256 of file contents — the idempotency key for ingested_files.
 *
 * Streamed rather than `readFile`d: this hashes SMS attachments and gcloud log
 * exports, and the previous implementation buffered the entire file into memory
 * just to hash it, which the Python side had already avoided. Node also caps a
 * single Buffer well below the size of a full backup artifact, so the old
 * version would throw outright on a large enough file.
 */
export declare function computeFileHash(filePath: string): Promise<string>;
export interface IngestParams {
    runId: string;
    filePath: string;
    sourceType: string;
    /** Attach now if known; otherwise call `unit.setRawPayload()` after parsing. */
    rawPayload?: Record<string, unknown>;
}
/**
 * One file's worth of work, inside one transaction. Nothing here commits.
 */
export declare class IngestUnit {
    private readonly client;
    private readonly runId;
    readonly filePath: string;
    readonly fileHash: string;
    /** True only when a previous run marked this file COMPLETE. */
    readonly alreadyIngested: boolean;
    recordsWritten: number;
    constructor(client: Db, runId: string, filePath: string, fileHash: string, 
    /** True only when a previous run marked this file COMPLETE. */
    alreadyIngested: boolean);
    /** Write validated records for this file. Callable more than once. */
    write(records: NormalizedRecordShape[]): Promise<number>;
    writeOne(record: NormalizedRecordShape): Promise<void>;
    /**
     * Attach the parsed payload to the ledger row, in this same transaction.
     * For extractors that can only build the payload after parsing.
     */
    setRawPayload(payload: Record<string, unknown>): Promise<void>;
    private guard;
}
export interface IngestOutcome<T> {
    fileHash: string;
    alreadyIngested: boolean;
    recordsWritten: number;
    /** Whatever the body returned. */
    value: T;
}
/**
 * Atomic ingest of one file: ledger row + records + completion flag, or nothing.
 *
 * ```ts
 * await ingest(client, { runId, filePath, sourceType }, async (unit) => {
 *   if (unit.alreadyIngested) return;
 *   await unit.write(records);
 * });
 * ```
 *
 * Guarantees, matching db_writer.py exactly:
 *
 * - On clean return the ledger row is marked complete with its record count and
 *   the whole unit commits together.
 * - On a thrown error everything rolls back, ledger row included, so the file
 *   has no trace in the ledger and the next run retries it.
 * - `alreadyIngested` is true only when a previous run marked the file complete
 *   — never merely because a row exists.
 * - An abandoned unit (row present, not complete) is reclaimed: orphaned records
 *   are deleted and it is re-ingested under the current run, so a retry cannot
 *   double-count a partial write.
 */
export declare function ingest<T>(client: Db, params: IngestParams, body: (unit: IngestUnit) => Promise<T>): Promise<IngestOutcome<T>>;
/**
 * Insert one validated NormalizedRecord into forensic_records.
 *
 * Does NOT manage a transaction — the caller owns the boundary, normally by
 * being inside an `ingest()` unit.
 */
export declare function writeRecord(client: Db, runId: string, fileHash: string, record: NormalizedRecordShape): Promise<void>;
export declare const MAX_RECORDS_PER_STATEMENT: number;
export declare function writeRecords(client: Db, runId: string, fileHash: string, records: NormalizedRecordShape[]): Promise<number>;
/**
 * Ledger rows that were started and never finished.
 *
 * Expected to be empty. Non-empty means a hard kill mid-unit, or rows the 0002
 * migration could not classify — files predating the atomicity fix that have no
 * records, which may be legitimately empty or may be ones the old code lost.
 * Either way the next run retries them; this exists so an operator can see them
 * rather than infer them, since the failure mode being fixed never announced
 * itself.
 */
export declare function incompleteIngests(client: Db): Promise<{
    fileHash: string;
    filePath: string;
}[]>;
export {};
