/**
 * Postgres read helpers for TypeScript callers -- the query-side counterpart
 * to packages/db-writer/dbWriter.ts.
 *
 * Why this is a separate package rather than more exports on db-writer
 * ----------------------------------------------------------------------
 * db-writer's own header comment stakes out a deliberately narrow scope: it
 * owns the atomic ingest boundary for ingested_files/forensic_records, and
 * nothing else. apps/orchestrator already reads pipeline_runs /
 * pipeline_stage_status directly with raw `pg` rather than going through
 * db-writer, and db-writer's comment calls that "the correct boundary for
 * that table pair." Folding read helpers into db-writer would blur exactly
 * the line that comment was written to protect -- someone debugging a slow
 * dashboard query six months from now could reasonably start adding raw SQL
 * next to `ingest()` and nobody would notice the atomicity guarantee's
 * chokepoint had quietly grown a side door.
 *
 * This package is the query side instead: no BEGIN/COMMIT, no dedup keys, no
 * invariants to protect. Just SELECTs, given an already-open client. Every
 * function here takes a `Db` the same way db-writer's do -- this package does
 * not own a Pool, does not read DB_* env vars, and does not know how its
 * caller manages connections. apps/epoch's main process owns the Pool today;
 * a future NestJS service would own a different pool with the exact same
 * query functions underneath.
 */

import type { Client, PoolClient } from 'pg';

type Db = Client | PoolClient;

/**
 * KNOWN OPEN QUESTION -- confirm before relying on this.
 *
 * apps/epoch's original inline query (before this package existed) selected
 * from a table named `stage_runs`. db-writer's own header comment and the
 * project's documented 4-table schema (pipeline_runs, pipeline_stage_status,
 * ingested_files, forensic_records) both reference `pipeline_stage_status`
 * instead. These may be the same table under an inconsistent name, two
 * genuinely different tables, or `stage_runs` may be a stale/incorrect name
 * left over from before a rename. This constant exists so that whichever one
 * is correct, fixing it is a one-line change here rather than a grep across
 * every caller.
 */
const STAGE_STATUS_TABLE = 'stage_runs'; // TODO: confirm vs. pipeline_stage_status

/**
 * SECOND OPEN QUESTION, separate from the table-name one above.
 *
 * The original inline query filtered forensic_records by `stage_run_id`.
 * But db-writer's writeRecord/writeRecords insert forensic_records with a
 * `run_id` column -- there is no `stage_run_id` in the insert list dbWriter.ts
 * defines. Either forensic_records has more columns than the writer touches
 * (plausible -- a migration could add stage_run_id later and the writer
 * simply never populates it, which would make every row NULL there and this
 * filter always return zero rows), or this filter should be `run_id`, or
 * `stage_run_id` doesn't exist on this table at all and the original query
 * was already broken. Confirm against packages/db/migrations before trusting
 * this function's results.
 */
const FORENSIC_RECORDS_STAGE_FILTER_COLUMN = 'stage_run_id'; // TODO: confirm vs. run_id

export interface PipelineRunRow {
  [column: string]: unknown;
}

export interface StageStatusRow {
  [column: string]: unknown;
}

export interface ForensicRecordRow {
  file_hash: string;
  run_id: string;
  incident_id: string | null;
  source_type: string;
  event_time: string | null;
  bug_type: string | null;
  process_name: string | null;
  pid: number | null;
  bundle_id: string | null;
  fields: Record<string, unknown>;
  [column: string]: unknown;
}

/**
 * Most recent pipeline runs, newest first.
 *
 * Row shape is intentionally untyped (`[column: string]: unknown`) rather
 * than enumerated -- pipeline_runs' columns aren't yet mirrored in
 * @verichron/contracts (see the open packages/contracts gap). Once that's
 * resolved this should return a typed row from contracts instead of
 * PipelineRunRow, the same way writeRecord/writeRecords validate against
 * NormalizedRecord on the write side.
 */
export async function getPipelineRuns(client: Db, limit = 100): Promise<PipelineRunRow[]> {
  const result = await client.query<PipelineRunRow>(
    `SELECT * FROM pipeline_runs
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Stage-level status rows for one pipeline run, in stage order.
 *
 * See STAGE_STATUS_TABLE above -- table name is unconfirmed.
 */
export async function getStageStatus(client: Db, runId: string): Promise<StageStatusRow[]> {
  const result = await client.query<StageStatusRow>(
    `SELECT * FROM ${STAGE_STATUS_TABLE}
      WHERE pipeline_run_id = $1
      ORDER BY stage_order ASC`,
    [runId]
  );
  return result.rows;
}

/**
 * Forensic records produced by one stage run, oldest first, capped at 500.
 *
 * The 500 cap matches the original inline query in apps/epoch/main.ts. This
 * is a UI-facing read, not an export/report path -- if a caller needs the
 * full set for a stage run, this function is the wrong tool; it should get a
 * paginated or streaming variant instead of a raised limit, since a single
 * backup's forensic_records for a busy stage run can be very large.
 */
export async function getForensicRecords(
  client: Db,
  stageRunId: string,
  limit = 500
): Promise<ForensicRecordRow[]> {
  const result = await client.query<ForensicRecordRow>(
    `SELECT * FROM forensic_records
      WHERE ${FORENSIC_RECORDS_STAGE_FILTER_COLUMN} = $1
      ORDER BY extracted_at ASC
      LIMIT $2`,
    [stageRunId, limit]
  );
  return result.rows;
}
