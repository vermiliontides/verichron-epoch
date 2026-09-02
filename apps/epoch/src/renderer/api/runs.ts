export const runsApi = {
  getPipelineRuns: () => window.epoch.getPipelineRuns(),
  getStageStatus: (runId: string) => window.epoch.getStageStatus(runId),
  getForensicRecords: (runId: string, sourceType?: string) => window.epoch.getForensicRecords(runId, sourceType),
  getCorrelatedContext: (runId: string, eventTime: string, excludeId: number, windowMinutes?: number) => 
    window.epoch.getCorrelatedContext(runId, eventTime, excludeId, windowMinutes),
};