/**
 * Public entry point for `@verichron/db-reader`.
 *
 * Query-side counterpart to `@verichron/db-writer` -- see dbReader.ts for
 * why this is a separate package rather than more exports on db-writer.
 *
 * Two open questions are flagged inline in dbReader.ts and must be resolved
 * before this package's results are trusted in a demo: the stage-status
 * table name (`stage_runs` vs `pipeline_stage_status`), and the forensic
 * records stage filter column (`stage_run_id` vs `run_id`). Both were
 * carried over unchanged from the original inline queries in
 * apps/epoch/src/main.ts rather than silently "corrected," since neither
 * has been confirmed against the actual migrations yet.
 */

export {
  getPipelineRuns,
  getStageStatus,
  getForensicRecords,
} from './dbReader.js';
export type { PipelineRunRow, StageStatusRow, ForensicRecordRow } from './dbReader.js';
