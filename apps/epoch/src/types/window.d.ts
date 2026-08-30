import type {
  PipelineRunRow,
  StageStatusRow,
  ForensicRecordRow,
  CorrelationPivotRow,
  CorrelatedContextRow,
} from '@verichron/db-reader';

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
      getReport: (backupSource: string) => Promise<any>;
      openReport: (backupSource: string) => Promise<boolean>;
      // New methods for WorkspaceView
      selectBackupDirectory: () => Promise<string | null>;
      startPipeline: (targetPath: string) => Promise<{ status: string; target: string }>;
    };
  }
}

export {};