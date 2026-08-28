declare global {
  interface Window {
    epoch: {
      getPipelineRuns: () => Promise<any[]>;
      getStageStatus: (runId: string) => Promise<any[]>;
      getForensicRecords: (stageRunId: string) => Promise<any[]>;
    };
  }
}

export {};
