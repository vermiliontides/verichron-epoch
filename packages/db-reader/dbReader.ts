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
 *
 * Every table/column name below was checked against
 * packages/db/migrations/0001_init.sql and 0002_ingest_completion.sql
 * directly, not carried over from apps/epoch's original inline queries.
 * That check turned up three mismatches in the original code, all fixed
 * here:
 *   - pipeline_runs has no `created_at` column -- only `started_at` /
 *     `finished_at`. getPipelineRuns now orders by `started_at`.
 *   - The table is `pipeline_stage_status`, not `stage_runs`, its FK column
 *     is `run_id` not `pipeline_run_id`, and there is no `stage_order`
 *     column at all -- see CANONICAL_STAGE_ORDER below for how ordering is
 *     done instead.
 *   - forensic_records has `run_id`, not `stage_run_id` -- there is no
 *     stage-level FK on this table, only a run-level one. getForensicRecords
 *     now takes `runId` and an optional `sourceType` narrowing filter
 *     instead of a nonexistent stage-run id. Its original `ORDER BY
 *     extracted_at` also doesn't exist; ordering is now by `event_time`,
 *     the column the schema comment identifies as the actual cross-domain
 *     correlation axis, falling back to `id` (insertion order) for rows
 *     where event_time is NULL.
 */

import type { Client, Pool, PoolClient } from 'pg';

type Db = Client | PoolClient | Pool;

export interface PipelineRunRow {
  run_id: string;
  backup_source: string;
  started_at: string;
  finished_at: string | null;
}

export type StageStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface StageStatusRow {
  run_id: string;
  stage_name: string;
  status: StageStatus;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface ForensicRecordRow {
  id: number;
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
}

/**
 * Most recent pipeline runs, newest first.
 */
export async function getPipelineRuns(client: Db, limit = 100): Promise<PipelineRunRow[]> {
  const result = await client.query<PipelineRunRow>(
    `SELECT * FROM pipeline_runs
      ORDER BY started_at DESC
      LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Canonical pipeline stage sequence, per the CREATE TABLE comment in
 * 0001_init.sql. The schema has no stage_order column -- stage sequence is
 * currently only encoded here, in application code. If this list drifts
 * from the orchestrator's actual stage sequence, or a stage is added on one
 * side and not the other, this is the file to update; there is nowhere else
 * it's defined. A `stage_order SMALLINT` column on pipeline_stage_status
 * would make this schema-enforced instead of convention-enforced -- worth
 * revisiting if this list needs to change more than once.
 */
export const CANONICAL_STAGE_ORDER = ['crash', 'safari', 'sms', 'network', 'gcloud', 'report'] as const;

/**
 * Stage-level status rows for one pipeline run, sorted into canonical
 * pipeline order rather than execution order -- so a report view always
 * shows all configured stages in the same sequence regardless of which
 * ones have actually started yet. Stages not present in
 * CANONICAL_STAGE_ORDER sort after all known stages, in the order Postgres
 * returned them, rather than being dropped -- an unrecognized stage_name is
 * a signal this list is stale, not a reason to hide the row.
 */
export async function getStageStatus(client: Db, runId: string): Promise<StageStatusRow[]> {
  const result = await client.query<StageStatusRow>(
    `SELECT * FROM pipeline_stage_status
      WHERE run_id = $1`,
    [runId]
  );

  return result.rows.sort((a, b) => {
    const orderA = CANONICAL_STAGE_ORDER.indexOf(a.stage_name as (typeof CANONICAL_STAGE_ORDER)[number]);
    const orderB = CANONICAL_STAGE_ORDER.indexOf(b.stage_name as (typeof CANONICAL_STAGE_ORDER)[number]);
    const rankA = orderA === -1 ? CANONICAL_STAGE_ORDER.length : orderA;
    const rankB = orderB === -1 ? CANONICAL_STAGE_ORDER.length : orderB;
    return rankA - rankB;
  });
}

/**
 * Forensic records for one pipeline run, oldest event first, capped at 500.
 *
 * forensic_records has no stage-level FK -- only run_id. `sourceType` is an
 * optional narrowing filter for callers that want just one extractor's
 * records (source_type is set per-extractor, e.g. the crash extractor's
 * output), which approximates "this stage's records" without pretending a
 * stage-run relationship exists in the schema.
 *
 * The 500 cap matches the original inline query in apps/epoch/main.ts. This
 * is a UI-facing read, not an export/report path -- if a caller needs the
 * full set for a run, this function is the wrong tool; it should get a
 * paginated or streaming variant instead of a raised limit, since a single
 * backup's forensic_records for a busy run can be very large.
 */
export async function getForensicRecords(
  client: Db,
  runId: string,
  options: { sourceType?: string; limit?: number } = {}
): Promise<ForensicRecordRow[]> {
  const { sourceType, limit = 500 } = options;

  if (sourceType) {
    const result = await client.query<ForensicRecordRow>(
      `SELECT * FROM forensic_records
        WHERE run_id = $1 AND source_type = $2
        ORDER BY event_time ASC NULLS LAST, id ASC
        LIMIT $3`,
      [runId, sourceType, limit]
    );
    return result.rows;
  }

  const result = await client.query<ForensicRecordRow>(
    `SELECT * FROM forensic_records
      WHERE run_id = $1
      ORDER BY event_time ASC NULLS LAST, id ASC
      LIMIT $2`,
    [runId, limit]
  );
  return result.rows;
}

/**
 * Correlation pivots + context, mirroring apps/reporting/generate_report.py's
 * fetch_correlation_pivots / fetch_correlated_context exactly -- same source
 * types, same window, same query shape. Two functions, not one, matching the
 * Python file's own split: pivots is cheap (one query, all of them, since a
 * run's mvt_ioc_detection + timestamp_anomaly count is small), context is
 * per-pivot and only worth fetching when a caller actually wants to expand
 * one -- fetching context for every pivot up front doesn't scale the same
 * way pivots does.
 */

export interface CorrelationPivotRow {
  id: number;
  source_type: string;
  event_time: string | null;
  fields: Record<string, unknown>;
}

export interface CorrelatedContextRow {
  id: number;
  source_type: string;
  event_time: string | null;
  process_name: string | null;
  bundle_id: string | null;
  fields: Record<string, unknown>;
}

/** Minutes on either side of a pivot's event_time to pull as context. Matches
 * generate_report.py's CORRELATION_WINDOW (a fixed default, not yet a CLI
 * flag there either -- see that file's own comment on why a sensible fixed
 * default shipped first). */
export const CORRELATION_WINDOW_MINUTES = 15;

/**
 * Every mvt_ioc_detection / timestamp_anomaly row for a run -- the pivot
 * points a correlation view builds a window around. Rows with a null
 * event_time (e.g. an untimed alert) come back too; there's nothing to
 * correlate them against, so a caller should render those separately rather
 * than pass them to getCorrelatedContext.
 */
export async function getCorrelationPivots(client: Db, runId: string): Promise<CorrelationPivotRow[]> {
  const result = await client.query<CorrelationPivotRow>(
    `SELECT id, source_type, event_time, fields
       FROM forensic_records
      WHERE run_id = $1 AND source_type IN ('mvt_ioc_detection', 'timestamp_anomaly')
      ORDER BY event_time ASC NULLS LAST`,
    [runId]
  );
  return result.rows;
}

/**
 * Everything else in forensic_records for this run within the correlation
 * window of one pivot's event_time, across every source_type -- the entire
 * point per generate_report.py's own comment: crash today, every other
 * domain automatically once its extractor lands, no change needed here when
 * that happens. `excludeId` keeps the pivot itself out of its own context.
 */
export async function getCorrelatedContext(
  client: Db,
  runId: string,
  eventTime: string,
  excludeId: number,
  windowMinutes: number = CORRELATION_WINDOW_MINUTES
): Promise<CorrelatedContextRow[]> {
  const center = new Date(eventTime);
  const lo = new Date(center.getTime() - windowMinutes * 60_000).toISOString();
  const hi = new Date(center.getTime() + windowMinutes * 60_000).toISOString();

  const result = await client.query<CorrelatedContextRow>(
    `SELECT id, source_type, event_time, process_name, bundle_id, fields
       FROM forensic_records
      WHERE run_id = $1 AND event_time BETWEEN $2 AND $3 AND id != $4
      ORDER BY event_time ASC`,
    [runId, lo, hi, excludeId]
  );
  return result.rows;
}