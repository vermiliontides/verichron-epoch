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
 
export interface StartPipelineOptions {
  workspace?: string;
  forceDecrypt?: boolean;
  refreshIOCs?: boolean;
}
 
export interface MvtLogEntry {
  stream: 'stdout' | 'stderr';
  line: string;
}
 
export interface MvtFinishedResult {
  success: boolean;
  exitCode?: number | null;
  error?: string;
}
 
declare global {
  interface Window {
    epoch: {
      selectBackupDirectory: () => Promise<string | null>;
      startPipeline: (source: string, options?: StartPipelineOptions) => Promise<{ started: boolean }>;
      submitMvtPassword: (password: string) => Promise<void>;
      onMvtLog: (callback: (entry: MvtLogEntry) => void) => () => void;
      onMvtPasswordRequired: (callback: (backupName: string) => void) => () => void;
      onMvtFinished: (callback: (result: MvtFinishedResult) => void) => () => void;
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