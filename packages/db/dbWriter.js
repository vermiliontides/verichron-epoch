"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_RECORDS_PER_STATEMENT = exports.IngestUnit = exports.DEFAULT_DB_URL = void 0;
exports.computeFileHash = computeFileHash;
exports.ingest = ingest;
exports.writeRecord = writeRecord;
exports.writeRecords = writeRecords;
exports.incompleteIngests = incompleteIngests;
const crypto = __importStar(require("node:crypto"));
const node_fs_1 = require("node:fs");
const contracts_1 = require("@verichron/contracts");
exports.DEFAULT_DB_URL = 'postgresql://forensics:forensics_dev_only@localhost:5432/forensics';
/**
 * sha256 of file contents — the idempotency key for ingested_files.
 *
 * Streamed rather than `readFile`d: this hashes SMS attachments and gcloud log
 * exports, and the previous implementation buffered the entire file into memory
 * just to hash it, which the Python side had already avoided. Node also caps a
 * single Buffer well below the size of a full backup artifact, so the old
 * version would throw outright on a large enough file.
 */
async function computeFileHash(filePath) {
    const hash = crypto.createHash('sha256');
    const stream = (0, node_fs_1.createReadStream)(filePath, { highWaterMark: 1024 * 1024 });
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}
/**
 * One file's worth of work, inside one transaction. Nothing here commits.
 */
class IngestUnit {
    client;
    runId;
    filePath;
    fileHash;
    alreadyIngested;
    recordsWritten = 0;
    constructor(client, runId, filePath, fileHash, 
    /** True only when a previous run marked this file COMPLETE. */
    alreadyIngested) {
        this.client = client;
        this.runId = runId;
        this.filePath = filePath;
        this.fileHash = fileHash;
        this.alreadyIngested = alreadyIngested;
    }
    /** Write validated records for this file. Callable more than once. */
    async write(records) {
        this.guard();
        const written = await writeRecords(this.client, this.runId, this.fileHash, records);
        this.recordsWritten += written;
        return written;
    }
    async writeOne(record) {
        this.guard();
        await writeRecord(this.client, this.runId, this.fileHash, record);
        this.recordsWritten += 1;
    }
    /**
     * Attach the parsed payload to the ledger row, in this same transaction.
     * For extractors that can only build the payload after parsing.
     */
    async setRawPayload(payload) {
        this.guard();
        await this.client.query('UPDATE ingested_files SET raw_payload = $1 WHERE file_hash = $2', [
            payload,
            this.fileHash,
        ]);
    }
    guard() {
        if (this.alreadyIngested) {
            throw new Error(`${this.filePath}: this file is already fully ingested (file_hash ` +
                `${this.fileHash.slice(0, 12)}). Check \`alreadyIngested\` and return before ` +
                `writing; writing here would duplicate records that are already committed, ` +
                `because the dedup key is the file hash and this file has one.`);
        }
    }
}
exports.IngestUnit = IngestUnit;
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
async function ingest(client, params, body) {
    const { runId, filePath, sourceType, rawPayload } = params;
    const fileHash = await computeFileHash(filePath);
    // Fast path for a re-run: the file is already complete, so there is nothing
    // to lock, write, commit or roll back. This read is intentionally outside a
    // transaction, which is safe because ingest_complete is monotonic — it goes
    // false -> true exactly once and never back, so a true observed here cannot
    // be invalidated by a concurrent transaction. A false may be stale, which is
    // why it falls through to the locking upsert rather than being acted on.
    const preflight = await client.query('SELECT ingest_complete FROM ingested_files WHERE file_hash = $1', [fileHash]);
    if (preflight.rows[0]?.ingest_complete) {
        // No BEGIN was issued, and node-postgres autocommits, so unlike the Python
        // version there is no implicit transaction left open by that SELECT and
        // nothing to release here.
        const unit = new IngestUnit(client, runId, filePath, fileHash, true);
        return { fileHash, alreadyIngested: true, recordsWritten: 0, value: await body(unit) };
    }
    await client.query('BEGIN');
    try {
        // Upsert-and-lock. Returns the row's completion state either way. A row
        // that is already complete keeps every original value: a finished ingest is
        // immutable audit data and must not be re-stamped with a later run's id.
        const claimed = await client.query(`INSERT INTO ingested_files
         (file_hash, run_id, file_path, file_name, source_type, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6)
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
       RETURNING ingest_complete`, [
            fileHash,
            runId,
            filePath,
            filePath.split(/[\\/]/).pop() ?? filePath,
            sourceType,
            rawPayload ?? {},
        ]);
        const alreadyIngested = claimed.rows[0]?.ingest_complete === true;
        if (!alreadyIngested) {
            // Reclaim an abandoned unit. A no-op for a row just inserted; for a
            // stranded one it clears partial records so this run's write is the only
            // contribution.
            await client.query('DELETE FROM forensic_records WHERE file_hash = $1', [fileHash]);
        }
        const unit = new IngestUnit(client, runId, filePath, fileHash, alreadyIngested);
        const value = await body(unit);
        if (alreadyIngested) {
            // Another process completed this file between the preflight read and the
            // upsert. Nothing was written and nothing should be; release the row lock.
            await client.query('ROLLBACK');
            return { fileHash, alreadyIngested: true, recordsWritten: 0, value };
        }
        await client.query(`UPDATE ingested_files
          SET ingest_complete = TRUE,
              record_count    = $1,
              completed_at    = now()
        WHERE file_hash = $2`, [unit.recordsWritten, fileHash]);
        await client.query('COMMIT');
        return { fileHash, alreadyIngested: false, recordsWritten: unit.recordsWritten, value };
    }
    catch (error) {
        try {
            await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            // Surface the original failure, not the rollback's. A rollback that fails
            // usually means the connection is already gone, in which case the server
            // aborts the transaction anyway and the atomicity guarantee still holds.
            console.error('[dbWriter] ROLLBACK failed after an ingest error:', rollbackError);
        }
        throw error;
    }
}
/**
 * Insert one validated NormalizedRecord into forensic_records.
 *
 * Does NOT manage a transaction — the caller owns the boundary, normally by
 * being inside an `ingest()` unit.
 */
async function writeRecord(client, runId, fileHash, record) {
    const validated = contracts_1.NormalizedRecord.parse(record);
    await client.query(`INSERT INTO forensic_records
      (file_hash, run_id, incident_id, source_type, event_time,
       bug_type, process_name, pid, bundle_id, fields)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
        fileHash,
        runId,
        validated.incident_id ?? null,
        validated.source_type,
        validated.event_time ?? null,
        validated.bug_type ?? null,
        validated.process_name ?? null,
        validated.pid ?? null,
        validated.bundle_id ?? null,
        validated.fields,
    ]);
}
/**
 * Bulk form of writeRecord. Does NOT manage a transaction.
 *
 * Chunked, because the previous version built a single statement with ten
 * placeholders per record. Postgres caps bind parameters at 65535, so any batch
 * over 6553 records failed outright — reachable with one ordinary gcloud log
 * export, and the kind of failure that, before `ingest()`, would have left a
 * committed ledger row and no records.
 */
const MAX_PARAMS_PER_STATEMENT = 65535;
const COLUMNS_PER_RECORD = 10;
exports.MAX_RECORDS_PER_STATEMENT = Math.floor(MAX_PARAMS_PER_STATEMENT / COLUMNS_PER_RECORD);
async function writeRecords(client, runId, fileHash, records) {
    if (records.length === 0) {
        return 0;
    }
    for (let offset = 0; offset < records.length; offset += exports.MAX_RECORDS_PER_STATEMENT) {
        const chunk = records.slice(offset, offset + exports.MAX_RECORDS_PER_STATEMENT);
        const values = [];
        const params = [];
        chunk.forEach((record, index) => {
            const validated = contracts_1.NormalizedRecord.parse(record);
            const base = index * COLUMNS_PER_RECORD;
            values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`);
            params.push(fileHash, runId, validated.incident_id ?? null, validated.source_type, validated.event_time ?? null, validated.bug_type ?? null, validated.process_name ?? null, validated.pid ?? null, validated.bundle_id ?? null, validated.fields);
        });
        await client.query(`INSERT INTO forensic_records
        (file_hash, run_id, incident_id, source_type, event_time,
         bug_type, process_name, pid, bundle_id, fields)
       VALUES ${values.join(', ')}`, params);
    }
    return records.length;
}
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
async function incompleteIngests(client) {
    const result = await client.query(`SELECT file_hash, file_path
       FROM ingested_files
      WHERE NOT ingest_complete
      ORDER BY ingested_at`);
    return result.rows.map((row) => ({ fileHash: row.file_hash, filePath: row.file_path }));
}
