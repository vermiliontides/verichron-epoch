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
  ToolAvailabilityStatus,
} from '../tools/device-backup/types';
 
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
}
 
declare global {
  interface Window {
    epoch: {
      platform: string;
      selectBackupDirectory: () => Promise<string | null>;
      selectDeviceBackupDestination: () => Promise<string | null>;
      discoverBackups: (source: string) => Promise<Backup[]>;
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
      listDeviceBackupSources: () => Promise<Array<{ id: string; label: string }>>;
      checkDeviceBackupToolAvailable: (sourceId: string) => Promise<ToolAvailabilityStatus>;
      listConnectedDevices: (sourceId: string) => Promise<DeviceInfo[]>;
      getToolAcquisitionActions: (sourceId: string) => Promise<ToolAcquisitionAction[]>;
      pullDeviceBackup: (sourceId: string, device: DeviceInfo, destDir: string) => Promise<string>;
      runToolAcquisitionSteps: (
        steps: ToolAcquisitionCommand[],
        installPrefix: string
      ) => Promise<{ success: boolean; failedStep?: string }>;
      onDeviceBackupProgress: (callback: (progress: BackupProgress) => void) => () => void;
      onToolAcquisitionStepStarted: (callback: (label: string) => void) => () => void;
      onToolAcquisitionOutput: (callback: (entry: { step: string; line: string }) => void) => () => void;
      onToolAcquisitionFinished: (callback: (result: { success: boolean; failedStep?: string }) => void) => () => void;
    };
  }
}
 
export {};