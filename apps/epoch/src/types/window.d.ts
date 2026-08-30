import type {
  PipelineRunRow,
  StageStatusRow,
  ForensicRecordRow,
  CorrelationPivotRow,
  CorrelatedContextRow,
} from '@verichron/db-reader';

export type ReportResult =
  | { status: 'ok'; content: string; path: string }
  | { status: 'not-found'; path: string }
  | { status: 'no-results-path' };

declare global {
  interface Window {
    epoch: {
      getPipelineRuns: () => Promise<PipelineRunRow[]>;
      getStageStatus: (runId: string) => Promise<StageStatusRow[]>;
      getForensicRecords: (runId: string, sourceType?: string) => Promise<ForensicRecordRow[]>;
      getCorrelationPivots: (runId: string) => Promise<CorrelationPivotRow[]>;
      getCorrelatedContext: (
        runId: string,
        eventTime: string,
        excludeId: number,
        windowMinutes?: number
      ) => Promise<CorrelatedContextRow[]>;
      getReport: (backupSource: string) => Promise<ReportResult>;
      openReport: (backupSource: string) => Promise<boolean>;
    };
  }
}

export {};
 