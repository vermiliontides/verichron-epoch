export interface StageManifest {
  entrypoint: string;
  runtime: "python" | "node";
  order: number;
  requiresResultsPath: boolean;
  /** Declared by every stage that writes facts; passed as --parser-version (EPOCH-404). */
  parserVersion?: number;
  enabled: boolean;
}

export interface StageDefinition {
  name: string;
  dir: string;
  manifest: StageManifest;
}

/** Enabled stages run; disabled ones are recorded on each run as 'skipped'. */
export interface StageSet {
  enabled: StageDefinition[];
  disabled: StageDefinition[];
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