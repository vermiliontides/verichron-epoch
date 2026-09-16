import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { Client } from "pg";
import { parseCliConfig, resolvePythonBin } from "./cli.js";
import { discoverStages } from "./discovery.js";
import { hasSucceededRun } from "./db.js";
import { runPipelineForBackup } from "./pipeline.js";

async function main() {
  const cfg = await parseCliConfig();
  const pythonBin = await resolvePythonBin();
  const stages = await discoverStages();
  
  if (stages.length === 0) {
    console.error("[orchestrator] no enabled stages discovered under apps/extractors/ or apps/reporting/ — nothing to run.");
    process.exit(1);
  }

  if (cfg.backupPaths.length === 0) {
    console.error("[orchestrator] no successfully decrypted backups were found in the workspace.");
    process.exitCode = 1;
    return;
  }

  const client = new Client({ connectionString: cfg.dbUrl });
  await client.connect();

  let failedBackups = 0;
  const analysisResults: Array<{
    backupPath: string;
    status: "succeeded" | "failed" | "skipped";
    runId?: string;
    stages?: { stage: string; success: boolean }[];
    error?: string;
  }> = [];

  for (const backupPath of cfg.backupPaths) {
    if (await hasSucceededRun(client, backupPath)) {
      analysisResults.push({ backupPath, status: "skipped" });
      continue;
    }
    try {
      const result = await runPipelineForBackup(client, backupPath, cfg.dbUrl, pythonBin, stages);
      
      if (!result.success) failedBackups += 1;
      
      analysisResults.push({
        backupPath,
        status: result.success ? "succeeded" : "failed",
        runId: result.runId,
        stages: result.results,
        error: result.error, // Captures pre-flight validation failures
      });
    } catch (err) {
      console.error(`[orchestrator] failure for ${backupPath}:`, err);
      failedBackups += 1;
      analysisResults.push({
        backupPath,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
 
  await client.end();
  const workspacePath = path.dirname(path.dirname(cfg.backupPaths[0]));
  await fsp.writeFile(path.join(workspacePath, "analysis-summary.json"), JSON.stringify({ results: analysisResults }, null, 2));
  
  if (failedBackups > 0) process.exitCode = 1;
}
 
main().catch((err) => {
  console.error("[orchestrator] fatal error:", err);
  process.exit(1);
});