import type {
  PipelineRunRow,
  StageStatusRow,
  ForensicRecordRow,
  CorrelationPivotRow,
  CorrelatedContextRow,
} from '@verichron/db-reader';
import type { Backup } from '@verichron/contracts';
import type {
  BackupProgress,
  DeviceInfo,
  ToolAcquisitionAction,
  ToolAcquisitionCommand,
  ToolAcquisitionResult,
  ToolAvailabilityStatus,
} from './tools';
 
export type ReportResult =
  | { status: 'ok'; content: string; path: string }
  | { status: 'not-found'; path: string }
  | { status: 'no-results-path' };
 
export interface StartPipelineOptions {
  workspace?: string;
  forceDecrypt?: boolean;
  refreshIOCs?: boolean;
  only?: string[];
}
 
export interface MvtLogEntry {
  stream: 'stdout' | 'stderr';
  line: string;
}
 
export interface MvtFinishedResult {
  success: boolean;
  exitCode?: number | null;
  error?: string;
  workspace?: string;
  backups?: Array<{ label: string; success: boolean; decrypted: boolean }>;
  analysis?: Array<{
    backupPath: string;
    status: 'succeeded' | 'failed' | 'skipped';
    runId?: string;
    stages?: Array<{ stage: string; success: boolean }>;
    error?: string;
  }>;
}
 
declare global {
  interface Window {
    epoch: {
      platform: string;
      selectBackupDirectory: () => Promise<string | null>;
      selectDeviceBackupDestination: () => Promise<string | null>;
      discoverBackups: (source: string) => Promise<Backup[]>;
      startPipeline: (source: string, options?: StartPipelineOptions) => Promise<{ started: boolean; workspace: string }>;
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
      // Stage 3 (orchestrator) -- see main.ts's epoch:startAnalysis handler.
      // Reuses MvtLogEntry/MvtFinishedResult since the shape is identical;
      // no need for a second pair of structurally-equal types.
      startAnalysis: (workspace: string) => Promise<{ started: boolean }>;
      onOrchestratorLog: (callback: (entry: MvtLogEntry) => void) => () => void;
      onOrchestratorFinished: (callback: (result: MvtFinishedResult) => void) => () => void;
      listDeviceBackupSources: () => Promise<Array<{ id: string; label: string }>>;
      checkDeviceBackupToolAvailable: (sourceId: string) => Promise<ToolAvailabilityStatus>;
      listConnectedDevices: (sourceId: string) => Promise<DeviceInfo[]>;
      getToolAcquisitionActions: (sourceId: string) => Promise<ToolAcquisitionAction[]>;
      pullDeviceBackup: (sourceId: string, device: DeviceInfo, destDir: string) => Promise<string>;
      runToolAcquisitionSteps: (
        steps: ToolAcquisitionCommand[],
        installPrefix: string
      ) => Promise<ToolAcquisitionResult>;
      runHomebrewInstall: (formulas: string[]) => Promise<{ success: boolean }>;
      onDeviceBackupProgress: (callback: (progress: BackupProgress) => void) => () => void;
      onToolAcquisitionStepStarted: (callback: (label: string) => void) => () => void;
      onToolAcquisitionOutput: (callback: (entry: { step: string; line: string }) => void) => () => void;
      onToolAcquisitionFinished: (callback: (result: ToolAcquisitionResult) => void) => () => void;
    };
  }
}
 
export {};