export const reportsApi = {
  getReport: (backupSource: string) => window.epoch.getReport(backupSource),
  openReport: (backupSource: string) => window.epoch.openReport(backupSource),
};