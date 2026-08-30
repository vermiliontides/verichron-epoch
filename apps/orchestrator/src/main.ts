/**
 * apps/orchestrator/src/main.ts
 *
 * Conductor for a full investigation run. Creates a pipeline_run PER BACKUP,
 * invokes each extractor as an isolated subprocess stage, records per-stage
 * status, and — critically — NEVER lets one stage's (or one backup's)
 * failure abort the others.
 *
 * This file intentionally does not know how to parse any source format.
 * That's the extractors' job (see /extractors/*, /contracts/EXTRACTOR_CONTRACT.md).
 * This file only knows how to run a stage, record what happened, and move on.
 *
 * Multi-backup note: mvt-runner (../mvt-runner) is the upstream tool that
 * decrypts a directory of raw iPhone backups into
 * <workspace>/decrypted/<name>/, one directory per backup, prompting
 * interactively for each backup's password as it goes. By the time this
 * orchestrator runs, that's already done — every backup it processes here
 * is decrypted and sitting on disk. There is no interactivity to reconcile
 * at this layer; the only real gap was that this file used to assume a
 * single --backup-path. It now accepts N backups and runs a full,
 * independent pipeline against each — one failing backup (or one failing
 * stage within a backup) never blocks the others.
 *
 * --results-path note: every stage is now also given a best-effort
 * --results-path (<workspace>/results/<name>/, mvt-runner's sibling
 * directory to decrypted/<name>/), derived from --backup-path. This is a
 * no-op for extractors that don't need it (safari/sms/network parse the
 * decrypted backup, not mvt-ios's output — see EXTRACTOR_CONTRACT.md's
 * Option A rationale) and required for extractors/mvt_iocs, which reads
 * mvt-ios's own alerts.json/timeline.csv as primary evidence. If a
 * results/ dir can't be derived (e.g. an explicit non-workspace backup
 * path with no 'decrypted' segment), it's simply omitted — extractors
 * that need it fail with their own clear error rather than the
 * orchestrator guessing.
 *
 * Python interpreter resolution: every Python stage below is a subprocess.
 * We resolve <repo-root>/.venv/bin/python once at startup rather than
 * spawning bare "python3" per stage. A bare "python3" on PATH is not
 * guaranteed to be the project's virtualenv —
 * on a dev machine with both a system Python and a project venv, every
 * stage would fail with ModuleNotFoundError: psycopg2, and nothing about
 * that error would point back at "wrong interpreter" as the cause.
 *
 * Stage discovery: stages are NOT hardcoded here. Each stage is a directory
 * under apps/extractors/ (plus the single apps/reporting/ directory) that
 * contains a stage.json matching packages/contracts/stage-manifest.schema.json.
 * A stage's name is always its directory's basename, never a field inside
 * the manifest -- this makes "the code's stage list disagrees with what's
 * on disk" (the class of bug this file used to have: it pointed at a
 * packages-py/ directory that no longer existed, and its hardcoded stage
 * names didn't match several extractor directory names) structurally
 * impossible instead of something to remember to keep in sync. Adding a
 * new extractor is: create the directory, add stage.json, done -- no edit
 * to this file. See discoverStages() below.
 */
 
import { spawn } from "node:child_process";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveResultsPath } from "@verichron/contracts";
 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
 
// This file lives at apps/orchestrator/src/main.ts, so repo root is three
// levels up to reach the monorepo root.
const REPO_ROOT = path.resolve(__dirname, "../../..");
const EXTRACTORS_DIR = path.join(REPO_ROOT, "apps", "extractors");
const REPORTING_DIR = path.join(REPO_ROOT, "apps", "reporting");

interface StageManifest {
  entrypoint: string;
  runtime: "python" | "node";
  order: number;
  requiresResultsPath: boolean;
  enabled: boolean;
}

interface StageDefinition {
  name: string;
  dir: string;
  manifest: StageManifest;
}

function isStageManifest(value: unknown): value is StageManifest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.entrypoint === "string" &&
    (v.runtime === "python" || v.runtime === "node") &&
    typeof v.order === "number" &&
    typeof v.requiresResultsPath === "boolean" &&
    typeof v.enabled === "boolean"
  );
}

async function loadStageFromDir(dir: string, name: string): Promise<StageDefinition | null> {
  const manifestPath = path.join(dir, "stage.json");
  let raw: string;
  try {
    raw = await fsp.readFile(manifestPath, "utf-8");
  } catch {
    console.warn(`[orchestrator] ${dir} has no stage.json — skipping, not treated as a stage.`);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`[orchestrator] ${manifestPath} is not valid JSON: ${(err as Error).message}`);
  }
  if (!isStageManifest(parsed)) {
    throw new Error(
      `[orchestrator] ${manifestPath} does not match stage-manifest.schema.json ` +
        `(need entrypoint: string, runtime: "python"|"node", order: number, ` +
        `requiresResultsPath: boolean, enabled: boolean).`
    );
  }

  const entrypointPath = path.join(dir, parsed.entrypoint);
  const entrypointExists = await fsp.access(entrypointPath).then(() => true).catch(() => false);
  if (!entrypointExists) {
    throw new Error(`[orchestrator] ${manifestPath} declares entrypoint "${parsed.entrypoint}" but ${entrypointPath} does not exist.`);
  }

  return { name, dir, manifest: parsed };
}

/**
 * Discovers every enabled stage from disk: each subdirectory of
 * apps/extractors/ with a stage.json, plus apps/reporting/ itself.
 * Fails fast (before any stage runs) on: an invalid manifest, a missing
 * entrypoint file, two enabled stages sharing an `order` value, or an
 * extractor stage whose `order` is not strictly less than the reporting
 * stage's -- reporting is expected to run last since it aggregates what
 * every extractor stage wrote.
 */
async function discoverStages(): Promise<StageDefinition[]> {
  const extractorEntries = await fsp.readdir(EXTRACTORS_DIR, { withFileTypes: true });
  const candidateDirs = extractorEntries
    .filter((e) => e.isDirectory())
    .map((e) => ({ dir: path.join(EXTRACTORS_DIR, e.name), name: e.name }));
  candidateDirs.push({ dir: REPORTING_DIR, name: path.basename(REPORTING_DIR) });

  const loaded = await Promise.all(candidateDirs.map((c) => loadStageFromDir(c.dir, c.name)));
  const stages = loaded.filter((s): s is StageDefinition => s !== null && s.manifest.enabled);

  const orderCounts = new Map<number, string[]>();
  for (const s of stages) {
    orderCounts.set(s.manifest.order, [...(orderCounts.get(s.manifest.order) ?? []), s.name]);
  }
  for (const [order, names] of orderCounts) {
    if (names.length > 1) {
      throw new Error(`[orchestrator] stages ${names.join(", ")} all declare order ${order} — orders must be unique among enabled stages.`);
    }
  }

  const reportStage = stages.find((s) => s.dir === REPORTING_DIR);
  const maxExtractorOrder = Math.max(
    0,
    ...stages.filter((s) => s.dir !== REPORTING_DIR).map((s) => s.manifest.order)
  );
  if (reportStage && reportStage.manifest.order <= maxExtractorOrder) {
    throw new Error(
      `[orchestrator] apps/reporting/stage.json declares order ${reportStage.manifest.order}, ` +
        `which is not after every extractor stage (max ${maxExtractorOrder}). Reporting must run last.`
    );
  }

  stages.sort((a, b) => a.manifest.order - b.manifest.order);
  console.log(`[orchestrator] discovered ${stages.length} enabled stage(s): ${stages.map((s) => `${s.name}(${s.manifest.order})`).join(", ")}`);
  return stages;
}

interface RunConfig {
  backupPath: string;
  resultsPath?: string;
  dbUrl: string;
  pythonBin: string;
}
 
async function resolvePythonBin(): Promise<string> {
  const venvPython = path.join(REPO_ROOT, ".venv", "bin", "python");
  try {
    await fsp.access(venvPython);
    console.log(`[orchestrator] using venv interpreter: ${venvPython}`);
    return venvPython;
  } catch {
    console.warn(
      `[orchestrator] no virtualenv found at ${venvPython} — falling back to "python3" on PATH.`
    );
    return "python3";
  }
}
 
async function hasSucceededRun(client: Client, backupPath: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT pr.run_id
     FROM pipeline_runs pr
     WHERE pr.backup_source = $1
       AND pr.finished_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pipeline_stage_status pss
         WHERE pss.run_id = pr.run_id AND pss.status = 'failed'
       )
     LIMIT 1`,
    [backupPath]
  );
  return rows.length > 0;
}
 
async function createRun(client: Client, backupPath: string, stages: StageDefinition[]): Promise<string> {
  const runId = randomUUID();
  await client.query(
    `INSERT INTO pipeline_runs (run_id, backup_source) VALUES ($1, $2)`,
    [runId, backupPath]
  );
  for (const stage of stages) {
    await client.query(
      `INSERT INTO pipeline_stage_status (run_id, stage_name, status) VALUES ($1, $2, 'pending')`,
      [runId, stage.name]
    );
  }
  return runId;
}
 
async function markStage(
  client: Client,
  runId: string,
  stageName: string,
  status: "running" | "succeeded" | "failed",
  errorMessage?: string
): Promise<void> {
  const timestampCol = status === "running" ? "started_at" : "finished_at";
  await client.query(
    `UPDATE pipeline_stage_status
     SET status = $1, error_message = $2, ${timestampCol} = now()
     WHERE run_id = $3 AND stage_name = $4`,
    [status, errorMessage ?? null, runId, stageName]
  );
}
 
function runStage(
  stage: StageDefinition,
  config: RunConfig,
  runId: string
): Promise<{ success: boolean; stderr: string }> {
  if (stage.manifest.requiresResultsPath && !config.resultsPath) {
    // Fail before spawning: a confusing missing-argument/file-not-found error
    // from the subprocess is worse than catching it here, per this stage's
    // own manifest declaring it needs results/<name>/ and none was derivable.
    return Promise.resolve({
      success: false,
      stderr: `stage "${stage.name}" requires --results-path but none could be derived from --backup-path`,
    });
  }

  return new Promise((resolve) => {
    const extraArgs = ["--run-id", runId, "--backup-path", config.backupPath, "--db-url", config.dbUrl];
    if (config.resultsPath) {
      extraArgs.push("--results-path", config.resultsPath);
    }
    const entrypointPath = path.join(stage.dir, stage.manifest.entrypoint);
    const bin = stage.manifest.runtime === "python" ? config.pythonBin : process.execPath;
    const child = spawn(bin, [entrypointPath, ...extraArgs], {
      stdio: ["ignore", "pipe", "pipe"],
    });
 
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
 
    child.on("error", (err) => {
      resolve({ success: false, stderr: err.message });
    });
 
    child.on("close", (code) => {
      resolve({ success: code === 0, stderr: stderr.trim() });
    });
  });
}
 
interface CliConfig {
  backupPaths: string[];
  dbUrl: string;
}
 
function printUsage() {
  console.error(`Usage:
  pnpm --filter @verichron/orchestrator investigate -- --workspace <mvt-runner-workspace-dir>`);
}
 
async function parseCliConfig(): Promise<CliConfig> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      workspace: { type: "string" },
    },
    allowPositionals: true,
  });
 
  const dbUrl = process.env.DATABASE_URL ?? "postgresql://forensics:forensics_dev_only@localhost:5432/forensics";
 
  if (values.workspace) {
    const decryptedDir = path.join(values.workspace, "decrypted");
    let entries;
    try {
      entries = await fsp.readdir(decryptedDir, { withFileTypes: true });
    } catch (err) {
      console.error(`[orchestrator] could not read ${decryptedDir}`);
      process.exit(1);
    }
    const candidates = entries.filter((e) => e.isDirectory());
    const backupPaths: string[] = [];
    for (const entry of candidates) {
      const dir = path.join(decryptedDir, entry.name);
      const markerExists = await fsp
        .access(path.join(dir, ".mvt_decrypted_ok"))
        .then(() => true)
        .catch(() => false);
      if (markerExists) backupPaths.push(dir);
    }
    backupPaths.sort();
    return { backupPaths, dbUrl };
  }
 
  if (positionals.length === 0) {
    printUsage();
    process.exit(1);
  }
  return { backupPaths: positionals, dbUrl };
}
 
async function runPipelineForBackup(
  client: Client,
  backupPath: string,
  dbUrl: string,
  pythonBin: string,
  stages: StageDefinition[]
): Promise<{ runId: string; results: { stage: string; success: boolean }[] }> {
  const runId = await createRun(client, backupPath, stages);
  const resultsPath = deriveResultsPath(backupPath);
  const results: { stage: string; success: boolean }[] = [];
 
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
  return { runId, results };
}
 
async function main() {
  const cfg = await parseCliConfig();
  const pythonBin = await resolvePythonBin();
  const stages = await discoverStages();
  if (stages.length === 0) {
    console.error("[orchestrator] no enabled stages discovered under apps/extractors/ or apps/reporting/ — nothing to run.");
    process.exit(1);
  }

  const client = new Client({ connectionString: cfg.dbUrl });
  await client.connect();
 
  for (const backupPath of cfg.backupPaths) {
    if (await hasSucceededRun(client, backupPath)) continue;
    try {
      await runPipelineForBackup(client, backupPath, cfg.dbUrl, pythonBin, stages);
    } catch (err) {
      console.error(`[orchestrator] failure for ${backupPath}:`, err);
    }
  }
 
  await client.end();
}
 
main().catch((err) => {
  console.error("[orchestrator] fatal error:", err);
  process.exit(1);
});