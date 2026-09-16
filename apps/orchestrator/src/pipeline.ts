import { spawn } from "node:child_process";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { Client } from "pg";
import { StageDefinition, RunConfig } from "./types.js";
import { createRun, markStage, markRunFailed } from "./db.js";
import { deriveResultsPath } from "@verichron/contracts";

async function validateBackupPath(backupPath: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!backupPath || backupPath.startsWith('-')) {
    return { ok: false, reason: `not a valid path (looks like a CLI flag): "${backupPath}"` };
  }
  const stat = await fsp.stat(backupPath).catch(() => null);
  if (!stat?.isDirectory()) {
    return { ok: false, reason: `does not exist or is not a directory: "${backupPath}"` };
  }
  const hasManifest = await fsp.access(path.join(backupPath, 'Manifest.db')).then(() => true).catch(() => false)
    || await fsp.access(path.join(backupPath, 'Info.plist')).then(() => true).catch(() => false);
  if (!hasManifest) {
    return { ok: false, reason: `missing Manifest.db/Info.plist — not a decrypted backup root` };
  }
  return { ok: true };
}

function runStage(stage: StageDefinition, config: RunConfig, runId: string): Promise<{ success: boolean; stderr: string }> {
  if (stage.manifest.requiresResultsPath && !config.resultsPath) {
    return Promise.resolve({
      success: false,
      stderr: `stage "${stage.name}" requires --results-path but none could be derived from --backup-path`,
    });
  }

  return new Promise((resolve) => {
    const extraArgs = ["--run-id", runId, "--backup-path", config.backupPath, "--db-url", config.dbUrl];
    if (config.resultsPath) extraArgs.push("--results-path", config.resultsPath);
    
    const entrypointPath = path.join(stage.dir, stage.manifest.entrypoint);
    const bin = stage.manifest.runtime === "python" ? config.pythonBin : process.execPath;
    
    const child = spawn(bin, [entrypointPath, ...extraArgs], { stdio: ["ignore", "pipe", "pipe"] });
 
    let stderr = "";
    child.stdout?.pipe(process.stdout);
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => resolve({ success: false, stderr: err.message }));
    child.on("close", (code) => resolve({ success: code === 0, stderr: stderr.trim() }));
  });
}
 
export async function runPipelineForBackup(
  client: Client,
  backupPath: string,
  dbUrl: string,
  pythonBin: string,
  stages: StageDefinition[]
): Promise<{ runId?: string; results?: { stage: string; success: boolean }[]; success: boolean; error?: string }> {
  
  // PR 2 Guard: Validate before touching the database
  const validation = await validateBackupPath(backupPath);
  if (!validation.ok) {
    return { success: false, error: validation.reason };
  }

  const runId = await createRun(client, backupPath, stages);
  const resultsPath = deriveResultsPath(backupPath);
  const results: { stage: string; success: boolean }[] = [];

  try {
    for (const stage of stages) {
      await markStage(client, runId, stage.name, "running");
      const { success, stderr } = await runStage(stage, { backupPath, resultsPath, dbUrl, pythonBin }, runId);

      if (success) {
        await markStage(client, runId, stage.name, "succeeded");
      } else {
        await markStage(client, runId, stage.name, "failed", stderr || "unknown error");
      }
      results.push({ stage: stage.name, success });
    }
 
    await client.query(`UPDATE pipeline_runs SET finished_at = now() WHERE run_id = $1`, [runId]);
    return { runId, results, success: results.every((result) => result.success) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markRunFailed(client, runId, message);
    throw err;
  }
}