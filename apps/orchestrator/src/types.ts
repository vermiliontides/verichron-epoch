export interface StageManifest {
  entrypoint: string;
  runtime: "python" | "node";
  order: number;
  requiresResultsPath: boolean;
  enabled: boolean;
}

export interface StageDefinition {
  name: string;
  dir: string;
  manifest: StageManifest;
}

export interface RunConfig {
  backupPath: string;
  resultsPath?: string;
  dbUrl: string;
  pythonBin: string;
}

export interface CliConfig {
  backupPaths: string[];
  dbUrl: string;
}