import type { PipelineRunRow, StageStatusRow, ForensicRecordRow } from '@verichron/db-reader';

declare global {
  interface Window {
    epoch: {
      getPipelineRuns: () => Promise<PipelineRunRow[]>;
      getStageStatus: (runId: string) => Promise<StageStatusRow[]>;
      getForensicRecords: (runId: string, sourceType?: string) => Promise<ForensicRecordRow[]>;
    };
  }
}

export {};
