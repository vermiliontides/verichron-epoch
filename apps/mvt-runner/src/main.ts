#!/usr/bin/env node
/**
 * mvt-runner: idempotent wrapper around mvt-ios for analyzing a directory of
 * idevicebackup2-produced encrypted iPhone backups.
 *
 * Pipeline per backup (each backup root under --source containing
 * Manifest.db or Info.plist, discovered up to a bounded depth):
 *
 *   1. hash    - sha256 every file in the backup, write manifest, skip if done
 *   2. decrypt - mvt-ios decrypt-backup into workspace/decrypted/<name>, skip if done
 *   3. repair  - scan decrypted/<name> for malformed SQLite DBs (by magic bytes +
 *                PRAGMA quick_check) and run sqlite3 .recover on any that fail,
 *                preserving the corrupt original as <file>.corrupt-<timestamp>.
 *                Skip if already done for this decrypted output.
 *   4. check   - mvt-ios check-backup into workspace/results/<name>, skip if done
 *
 * Force flags are split so they don't conflate independent concerns:
 *   --force          re-run check-backup only (e.g. after refreshing IOCs).
 *                    Does NOT touch decrypt or repair state.
 *   --force-decrypt  re-run decrypt-backup. Since that produces fresh
 *                    plaintext, repair and check-backup are cascaded
 *                    automatically for that backup in the same run, whether
 *                    or not --force is also given.
 *
 * IOC indicators are refreshed if older than --ioc-max-age (default 168h).
 * After processing, an aggregate summary.md is written scanning every
 * check-backup log for lines that look like indicator matches.
 *
 * This is a personal-analysis tool, not a chain-of-custody / forensic
 * evidence tool: hashing exists only to detect if a source backup changed
 * between runs, not to establish evidentiary integrity. Likewise, repair
 * intentionally mutates the working copy in workspace/decrypted/ (never the
 * original source backup) and keeps the pre-repair file alongside it, so
 * the original decrypted-but-corrupt bytes are never silently discarded.
 *
 * Build:  npm install && npm run build
 * Usage:  node dist/main.js --source ./backups --workspace ./mvt-workspace
 *   or, without a build step: npx tsx main.ts --source ... --workspace ...
 */

import { parseArgs } from "node:util";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { spawn } from "node:child_process";

interface Config {
  source: string;
  workspace: string;
  mvtBin: string;
  sqliteBin: string;
  force: boolean;
  forceDecrypt: boolean;
  refreshIOCs: boolean;
  iocMaxAgeMs: number;
  only: string;
  samePass: boolean;
}

async function main() {
  const cfg = parseFlags();
  try {
    await run(cfg);
  } catch (err) {
    console.error("error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

function parseFlags(): Config {
  const home = os.homedir();

  const { values } = parseArgs({
    options: {
      source: { type: "string", default: "" },
      workspace: { type: "string", default: path.join(home, "mvt-workspace") },
      "mvt-bin": { type: "string", default: path.join(home, "mvt", ".venv", "bin", "mvt-ios") },
      "sqlite-bin": { type: "string", default: "sqlite3" },
      force: { type: "boolean", default: false },
      "force-decrypt": { type: "boolean", default: false },
      "refresh-iocs": { type: "boolean", default: false },
      "ioc-max-age": { type: "string", default: "168h" },
      only: { type: "string", default: "" },
      "different-passwords": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  if (!values.source) {
    console.error("error: --source is required");
    printUsage();
    process.exit(2);
  }

  let iocMaxAgeMs = 168 * 60 * 60 * 1000; // default: 168h, mirrored below
  try {
    iocMaxAgeMs = parseDuration(values["ioc-max-age"] as string);
  } catch (err) {
    console.error(`error: invalid --ioc-max-age: ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  }

  return {
    source: values.source as string,
    workspace: values.workspace as string,
    mvtBin: values["mvt-bin"] as string,
    sqliteBin: values["sqlite-bin"] as string,
    force: values.force as boolean,
    forceDecrypt: values["force-decrypt"] as boolean,
    refreshIOCs: values["refresh-iocs"] as boolean,
    iocMaxAgeMs,
    only: values.only as string,
    samePass: !(values["different-passwords"] as boolean),
  };
}

function printUsage() {
  console.error(`Usage: mvt-runner --source <dir> [options]

Options:
  --source <dir>          directory containing backup subdirectories (required)
  --workspace <dir>        workspace directory for hashes/decrypted/results (default: ./mvt-workspace)
  --mvt-bin <path>         path to mvt-ios binary (default: <repo-root>/.venv/bin/mvt-ios or your active mvt venv)
  --sqlite-bin <path>      path to sqlite3 binary used for repairing malformed DBs (default: "sqlite3" on PATH)
  --force                  re-run check-backup even if already done (does NOT touch decrypt/repair state)
  --force-decrypt          re-run decrypt-backup, repair, and check-backup even if already done
  --refresh-iocs           force re-download of IOC indicators
  --ioc-max-age <dur>      re-download IOCs if older than this, e.g. "168h" (default: 168h)
  --only <names>           comma-separated list of backup dir names to process (default: all found)
  --different-passwords    prompt separately for each backup instead of reusing one password
  --help                   show this help`);
}

// parseDuration accepts Go-style duration strings using h/m/s (and d for
// convenience), e.g. "168h", "24h", "30m", "10d".
function parseDuration(s: string): number {
  const re = /^(\d+(?:\.\d+)?)(d|h|m|s)$/;
  const match = re.exec(s.trim());
  if (!match) {
    throw new Error(`could not parse duration "${s}" (expected e.g. "168h", "30m", "10d")`);
  }
  const value = parseFloat(match[1]);
  const unit = match[2];
  const unitMs: Record<string, number> = {
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
    s: 1000,
  };
  return value * unitMs[unit];
}

async function run(cfg: Config): Promise<void> {
  if (!(await pathExists(cfg.mvtBin))) {
    throw new Error(`mvt-ios not found at ${cfg.mvtBin} (pass --mvt-bin to override)`);
  }

  const dirs = ["hashes", "decrypted", "results", "logs"];
  for (const d of dirs) {
    await fsp.mkdir(path.join(cfg.workspace, d), { recursive: true });
  }

  try {
    await ensureIOCs(cfg);
  } catch (err) {
    throw new Error(`iocs: ${err instanceof Error ? err.message : err}`);
  }

  let backups: Backup[];
  try {
    backups = await discoverBackups(cfg.source, cfg.only);
  } catch (err) {
    throw new Error(`discovering backups: ${err instanceof Error ? err.message : err}`);
  }
  if (backups.length === 0) {
    throw new Error(
      `no backup directories found under ${cfg.source} (looked for Manifest.db / Info.plist up to ${BACKUP_SEARCH_MAX_DEPTH} levels deep)`
    );
  }

  console.log(`found ${backups.length} backup(s):`);
  for (const b of backups) {
    console.log(`  - ${b.label}  (${b.path})`);
  }
  console.log();

  let cachedPassword = "";
  let haveCached = false;
  const repairFailuresByBackup = new Map<string, string[]>();

  for (const backup of backups) {
    const name = backup.label;
    const src = backup.path;
    console.log(`=== ${name} ===`);

    try {
      await hashBackup(cfg, name, src);
    } catch (err) {
      console.error(`  [hash] error: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const decDir = path.join(cfg.workspace, "decrypted", name);
    const decMarker = path.join(decDir, ".mvt_decrypted_ok");
    let decryptRan = false;
    if (!cfg.forceDecrypt && (await pathExists(decMarker))) {
      console.log("  [decrypt] already done, skipping");
    } else {
      let pw: string;
      if (cfg.samePass && haveCached) {
        pw = cachedPassword;
      } else {
        try {
          pw = await promptPassword(`  password for ${name}: `);
        } catch (err) {
          console.error(`  [decrypt] error reading password: ${err instanceof Error ? err.message : err}`);
          continue;
        }
        if (cfg.samePass) {
          cachedPassword = pw;
          haveCached = true;
        }
      }

      try {
        await decryptBackup(cfg, src, decDir, pw);
      } catch (err) {
        console.error(`  [decrypt] error: ${err instanceof Error ? err.message : err}`);
        // wrong password shouldn't poison the cache
        if (cfg.samePass) {
          haveCached = false;
        }
        continue;
      }
      await writeMarker(decMarker);
      decryptRan = true;
      console.log("  [decrypt] done");
    }

    // repair: fresh decrypted output always needs a fresh repair pass;
    // otherwise this stage is idempotent like the others. Failure state is
    // persisted to disk (not just kept in memory) so that summary.md can
    // still surface the caveat on a later run where repair is skipped
    // because it already ran.
    const repairMarker = path.join(decDir, ".mvt_repaired_ok");
    const repairFailuresPath = path.join(decDir, ".mvt_repair_failures.json");
    if (!decryptRan && (await pathExists(repairMarker))) {
      console.log("  [repair]  already done, skipping");
      repairFailuresByBackup.set(name, await readRepairFailures(repairFailuresPath));
    } else {
      try {
        const result = await repairDecrypted(cfg, decDir);
        if (result.scanned === null) {
          console.log("  [repair]  skipped (sqlite3 not available; pass --sqlite-bin or install sqlite3)");
        } else if (result.repaired === 0 && result.failed === 0) {
          console.log(`  [repair]  done, no malformed DBs found (scanned ${result.scanned} candidate file(s))`);
        } else {
          console.log(
            `  [repair]  done, repaired ${result.repaired} DB(s)${
              result.failed > 0 ? `, ${result.failed} could not be fully recovered` : ""
            } (scanned ${result.scanned} candidate file(s))`
          );
        }
        if (result.scanned !== null) {
          await fsp.writeFile(repairFailuresPath, JSON.stringify(result.failedFiles, null, 2));
          repairFailuresByBackup.set(name, result.failedFiles);
        }
        await writeMarker(repairMarker);
      } catch (err) {
        console.error(`  [repair] error: ${err instanceof Error ? err.message : err}`);
        continue;
      }
    }

    const resDir = path.join(cfg.workspace, "results", name);
    const resMarker = path.join(resDir, ".mvt_check_ok");
    const forceCheck = cfg.force || decryptRan;
    if (!forceCheck && (await pathExists(resMarker))) {
      console.log("  [check]   already done, skipping");
    } else {
      const logPath = path.join(cfg.workspace, "logs", `${name}.log`);
      try {
        await checkBackup(cfg, decDir, resDir, logPath);
      } catch (err) {
        console.error(`  [check] error: ${err instanceof Error ? err.message : err}`);
        continue;
      }
      await writeMarker(resMarker);
      console.log("  [check]   done ->", resDir);
    }
    console.log();
  }

  const summaryPath = await writeSummary(cfg, backups, repairFailuresByBackup);
  console.log("summary written to", summaryPath);
}

// ensureIOCs downloads mvt's indicator feeds if missing or stale.
async function ensureIOCs(cfg: Config): Promise<void> {
  const home = os.homedir();
  const indicatorsDir = path.join(home, ".config", "mvt", "indicators");

  let needsRefresh = cfg.refreshIOCs;
  if (!needsRefresh) {
    try {
      const info = await fsp.stat(indicatorsDir);
      if (Date.now() - info.mtimeMs > cfg.iocMaxAgeMs) {
        needsRefresh = true;
      } else {
        const entries = await fsp.readdir(indicatorsDir).catch(() => []);
        if (entries.length === 0) needsRefresh = true;
      }
    } catch {
      needsRefresh = true;
    }
  }

  if (!needsRefresh) {
    console.log("IOC indicators are fresh, skipping download");
    return;
  }

  console.log("downloading/refreshing IOC indicators...");
  await runInherited(cfg.mvtBin, ["download-iocs"]);
}

// A discovered backup: `label` is the friendly top-level directory name
// under --source (used for workspace organization), `path` is the actual
// directory containing Manifest.db / Info.plist (what gets passed to
// mvt-ios). These are the same directory in the simple case, but idevice-
// backup2 output is commonly one level deeper: <source>/<label>/<UDID>/Manifest.db
interface Backup {
  label: string;
  path: string;
}

const BACKUP_SEARCH_MAX_DEPTH = 3;

// discoverBackups treats each immediate subdirectory of `source` as one
// logical backup ("label"), then searches within it (up to a bounded depth)
// for the actual directory containing Manifest.db / Info.plist, since
// idevicebackup2 nests the real backup root under a UDID-named folder.
async function discoverBackups(source: string, only: string): Promise<Backup[]> {
  let wanted: Set<string> | null = null;
  if (only !== "") {
    wanted = new Set(only.split(",").map((n) => n.trim()));
  }

  const topEntries = await fsp.readdir(source, { withFileTypes: true });

  const found: Backup[] = [];
  for (const e of topEntries) {
    if (!e.isDirectory()) continue;
    if (wanted !== null && !wanted.has(e.name)) continue;

    const topPath = path.join(source, e.name);
    const roots = await findBackupRoots(topPath, BACKUP_SEARCH_MAX_DEPTH);

    if (roots.length === 0) continue;
    for (const root of roots) {
      // Multiple backup roots under one label is unusual but possible
      // (e.g. two UDID dirs nested under one date folder) - disambiguate.
      const label = roots.length > 1 ? `${e.name}__${path.basename(root)}` : e.name;
      found.push({ label, path: root });
    }
  }

  found.sort((a, b) => a.label.localeCompare(b.label));
  return found;
}

// findBackupRoots recursively searches for directories that look like an
// idevicebackup2 backup root, stopping as soon as a match is found along
// each branch (it does not descend into the 00-ff hashed content
// directories once Manifest.db has already been located higher up).
async function findBackupRoots(dir: string, remainingDepth: number): Promise<string[]> {
  if (await isBackupRoot(dir)) {
    return [dir];
  }
  if (remainingDepth <= 0) return [];

  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const sub = path.join(dir, e.name);
    results.push(...(await findBackupRoots(sub, remainingDepth - 1)));
  }
  return results;
}

async function isBackupRoot(dir: string): Promise<boolean> {
  return (await pathExists(path.join(dir, "Manifest.db"))) || (await pathExists(path.join(dir, "Info.plist")));
}

// readRepairFailures loads the persisted list of files that were still
// malformed after the last repair attempt for a backup. Missing/unreadable
// state (e.g. an older workspace from before this tracking existed) is
// treated as "no known failures" rather than an error.
async function readRepairFailures(p: string): Promise<string[]> {
  try {
    const content = await fsp.readFile(p, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeMarker(p: string): Promise<void> {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, `completed: ${new Date().toISOString()}\n`);
}

// hashBackup writes a sha256 manifest of the source backup, skipping if one
// already exists. This is for change-detection between runs, not evidentiary
// integrity.
async function hashBackup(cfg: Config, name: string, src: string): Promise<void> {
  const manifestPath = path.join(cfg.workspace, "hashes", `${name}.sha256`);
  if (!cfg.forceDecrypt && (await pathExists(manifestPath))) {
    console.log("  [hash]    already done, skipping");
    return;
  }

  const lines: string[] = [];
  for await (const p of walkFiles(src)) {
    const sum = await sha256File(p);
    const rel = path.relative(src, p);
    lines.push(`${sum}  ${rel}`);
  }

  await fsp.writeFile(manifestPath, lines.join("\n") + (lines.length ? "\n" : ""));
  console.log("  [hash]    done ->", manifestPath);
}

// walkFiles recursively yields every regular file under dir.
async function* walkFiles(dir: string): AsyncGenerator<string> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkFiles(p);
    } else if (e.isFile()) {
      yield p;
    }
  }
}

function sha256File(p: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(p);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function decryptBackup(cfg: Config, src: string, dest: string, password: string): Promise<void> {
  await fsp.mkdir(dest, { recursive: true });
  await runInherited(cfg.mvtBin, ["decrypt-backup", "-p", password, "-d", dest, src]);
}

async function checkBackup(cfg: Config, decryptedDir: string, resultsDir: string, logPath: string): Promise<void> {
  await fsp.mkdir(resultsDir, { recursive: true });
  const logStream = fs.createWriteStream(logPath);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(cfg.mvtBin, ["check-backup", "--output", resultsDir, decryptedDir], {
      stdio: ["inherit", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      logStream.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      logStream.write(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      logStream.end();
      if (code === 0) resolve();
      else reject(new Error(`mvt-ios check-backup exited with code ${code}`));
    });
  });
}

// runInherited runs a command with stdio inherited directly (for interactive
// or simply-passthrough subprocesses like download-iocs / decrypt-backup).
function runInherited(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} exited with code ${code}`));
    });
  });
}

// --- repair -----------------------------------------------------------
//
// idevicebackup2 output is content-addressed (files named by hash, no
// extension), so we can't tell what's a SQLite DB from the filename. We
// cheaply check the first 16 bytes against SQLite's magic header, and only
// run the expensive integrity check (and possible recovery) on matches.

const SQLITE_MAGIC = Buffer.from("SQLite format 3\0", "ascii"); // 16 bytes

interface RepairResult {
  // null means repair was skipped entirely (sqlite3 binary unavailable)
  scanned: number | null;
  repaired: number;
  failed: number;
  failedFiles: string[]; // paths relative to decDir, for backups still missing recoverable data
}

let sqliteBinChecked = false;
let sqliteBinAvailable = false;

async function repairDecrypted(cfg: Config, decDir: string): Promise<RepairResult> {
  if (!sqliteBinChecked) {
    sqliteBinChecked = true;
    sqliteBinAvailable = await checkSqliteBinAvailable(cfg.sqliteBin);
  }
  if (!sqliteBinAvailable) {
    return { scanned: null, repaired: 0, failed: 0, failedFiles: [] };
  }

  let scanned = 0;
  let repaired = 0;
  let failed = 0;
  const failedFiles: string[] = [];

  for await (const p of walkFiles(decDir)) {
    if (path.basename(p).startsWith(".mvt_")) continue; // our own markers
    if (p.endsWith("-wal") || p.endsWith("-shm") || p.includes(".corrupt-")) continue;

    if (!(await looksLikeSqlite(p))) continue;
    scanned++;

    const ok = await sqliteQuickCheck(cfg.sqliteBin, p);
    if (ok) continue;

    console.log(`  [repair]  malformed DB detected: ${path.relative(decDir, p)}`);
    try {
      const { applyWarnings } = await sqliteRecoverInPlace(cfg.sqliteBin, p);
      const okNow = await sqliteQuickCheck(cfg.sqliteBin, p);
      if (okNow) {
        console.log(
          `  [repair]  recovered: ${path.relative(decDir, p)}` +
            (applyWarnings
              ? ` (${applyWarnings} — typically harmless: SQLite's own bookkeeping tables, not your data)`
              : "")
        );
        repaired++;
      } else {
        console.warn(
          `  [repair]  WARNING: ran .recover on ${path.relative(decDir, p)} but it still fails quick_check ` +
            `(some data may be permanently lost; original preserved as .corrupt-<timestamp>)` +
            (applyWarnings ? ` [${applyWarnings}]` : "")
        );
        failed++;
        failedFiles.push(path.relative(decDir, p));
      }
    } catch (err) {
      console.error(`  [repair]  ERROR recovering ${path.relative(decDir, p)}: ${err instanceof Error ? err.message : err}`);
      failed++;
      failedFiles.push(path.relative(decDir, p));
    }
  }

  return { scanned, repaired, failed, failedFiles };
}

async function checkSqliteBinAvailable(sqliteBin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(sqliteBin, ["-version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function looksLikeSqlite(p: string): Promise<boolean> {
  let fh: fsp.FileHandle | undefined;
  try {
    fh = await fsp.open(p, "r");
    const buf = Buffer.alloc(16);
    const { bytesRead } = await fh.read(buf, 0, 16, 0);
    if (bytesRead < 16) return false;
    return buf.equals(SQLITE_MAGIC);
  } catch {
    return false;
  } finally {
    await fh?.close();
  }
}

// sqliteQuickCheck runs PRAGMA quick_check and treats anything other than a
// clean "ok" (or a zero exit with that single line of output) as failure.
function sqliteQuickCheck(sqliteBin: string, dbPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(sqliteBin, [dbPath, "PRAGMA quick_check;"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.on("error", () => resolve(false));
    child.on("close", (code) => {
      resolve(code === 0 && stdout.trim() === "ok");
    });
  });
}

// runProcess spawns bin with args, optionally writing `input` to stdin, and
// resolves with {stdout, stderr, code} regardless of exit code. This is
// deliberate: the sqlite3 CLI (run without -bail) keeps processing after a
// per-statement error, so a non-zero exit from applying `.recover` output
// does NOT mean the whole operation failed — it commonly just means a few
// statements touching SQLite's own internal bookkeeping tables
// (sqlite_sequence, sqlite_stat1, sqlite_master) were rejected while the
// actual user data around them still landed. Callers judge success by
// re-running quick_check on the resulting file, not by trusting the exit
// code. Only a genuine spawn failure (e.g. binary not found) rejects.
function runProcess(
  bin: string,
  args: string[],
  input?: string
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: [input !== undefined ? "pipe" : "ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout!.on("data", (d) => (stdout += d.toString()));
    child.stderr!.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code }));
    if (input !== undefined) {
      child.stdin!.write(input);
      child.stdin!.end();
    }
  });
}

// summarizeSqliteWarnings condenses potentially thousands of near-duplicate
// stderr lines (e.g. "Parse error near line 6001: no such table:
// sqlite_stat1", repeated once per affected row) into unique-message counts,
// so the terminal output stays readable instead of scrolling past a wall of
// identical errors that differ only by line number.
function summarizeSqliteWarnings(stderr: string): string {
  const lines = stderr
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";

  const counts = new Map<string, number>();
  for (const line of lines) {
    const msg = line.replace(/^Parse error near line \d+:\s*/, "");
    counts.set(msg, (counts.get(msg) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([msg, n]) => (n > 1 ? `${msg} (x${n})` : msg));
  return `${lines.length} warning line(s) applying recovered SQL: ${parts.join("; ")}`;
}

// sqliteRecoverInPlace runs `sqlite3 <db> ".recover"` and pipes the output
// SQL into a fresh database, mirroring:
//   sqlite3 "$f" ".recover" | sqlite3 "${f}.repaired"
// The pre-repair file is preserved alongside as <db>.corrupt-<timestamp>
// rather than deleted, and any stale -wal/-shm files (left over from a
// failed open attempt) are removed since they no longer apply to the
// repaired file. Returns a summary of any (usually benign) warnings seen
// while applying the recovered SQL, for the caller to log.
async function sqliteRecoverInPlace(sqliteBin: string, dbPath: string): Promise<{ applyWarnings: string }> {
  const recoverResult = await runProcess(sqliteBin, [dbPath, ".recover"]);
  if (recoverResult.stdout.trim() === "") {
    throw new Error(
      `sqlite3 .recover produced no output` + (recoverResult.stderr.trim() ? `: ${recoverResult.stderr.trim()}` : "")
    );
  }

  const repairedPath = `${dbPath}.repaired-${process.pid}-${Date.now()}`;
  await fsp.rm(repairedPath, { force: true });
  const applyResult = await runProcess(sqliteBin, [repairedPath], recoverResult.stdout);

  // A non-zero exit here is expected and tolerated (see runProcess above),
  // but if the apply step failed so badly it never even created a file,
  // that's a hard failure distinct from the benign per-statement warnings.
  if (!(await pathExists(repairedPath))) {
    await fsp.rm(repairedPath, { force: true });
    throw new Error(
      `sqlite3 did not produce a repaired file` + (applyResult.stderr.trim() ? `: ${applyResult.stderr.trim()}` : "")
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const corruptBackupPath = `${dbPath}.corrupt-${timestamp}`;
  await fsp.copyFile(dbPath, corruptBackupPath);

  await fsp.rename(repairedPath, dbPath);

  await fsp.rm(`${dbPath}-wal`, { force: true });
  await fsp.rm(`${dbPath}-shm`, { force: true });

  return { applyWarnings: summarizeSqliteWarnings(applyResult.stderr) };
}

// promptPassword reads a password from the terminal with echo disabled,
// using raw-mode stdin (no external processes required).
function promptPassword(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    process.stdout.write(prompt);

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (!stdin.isTTY) {
      // Fallback for non-interactive stdin (e.g. piped input in tests):
      // just read a line without hiding it.
      const chunks: Buffer[] = [];
      stdin.on("data", function onData(chunk: Buffer) {
        const idx = chunk.indexOf(0x0a); // \n
        if (idx !== -1) {
          chunks.push(chunk.subarray(0, idx));
          stdin.removeListener("data", onData);
          const line = Buffer.concat(chunks).toString("utf8").replace(/\r$/, "");
          process.stdout.write("\n");
          resolve(line);
        } else {
          chunks.push(chunk);
        }
      });
      stdin.on("error", reject);
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let password = "";

    const onData = (char: string) => {
      switch (char) {
        case "\n":
        case "\r":
        case "\u0004": // Ctrl-D
          cleanup();
          process.stdout.write("\n");
          resolve(password);
          break;
        case "\u0003": // Ctrl-C
          cleanup();
          process.stdout.write("\n");
          reject(new Error("interrupted"));
          break;
        case "\u007f": // Backspace
        case "\b":
          password = password.slice(0, -1);
          break;
        default:
          password += char;
          break;
      }
    };

    const cleanup = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(wasRaw ?? false);
      stdin.pause();
    };

    stdin.on("data", onData);
  });
}

// writeSummary scans every check-backup log for lines that look like
// indicator/detection hits and produces a single markdown rollup.
async function writeSummary(cfg: Config, backups: Backup[], repairFailuresByBackup: Map<string, string[]>): Promise<string> {
  const summaryPath = path.join(cfg.workspace, "summary.md");
  const parts: string[] = [];

  parts.push(`# MVT Analysis Summary\n\ngenerated: ${new Date().toISOString()}\n\n`);

  // lines mvt/log output tends to use for a genuine detection; adjust if
  // your mvt version's wording differs (check a raw log once to confirm).
  const suspectTerms = ["detected", "indicator", "malicious", "match", "warning"];

  for (const backup of backups) {
    const name = backup.label;
    const logPath = path.join(cfg.workspace, "logs", `${name}.log`);
    parts.push(`## ${name}\n\n`);

    const repairFailures = repairFailuresByBackup.get(name) ?? [];
    if (repairFailures.length > 0) {
      parts.push(
        `⚠️ ${repairFailures.length} database${repairFailures.length > 1 ? "s" : ""} could not be fully recovered ` +
          `(${repairFailures.join(", ")}) — check-backup results for this backup may be missing data from ` +
          `${repairFailures.length > 1 ? "those tables" : "that table"}.\n\n`
      );
    }

    let content: string;
    try {
      content = await fsp.readFile(logPath, "utf8");
    } catch {
      parts.push("_no log found (check-backup may not have run)_\n\n");
      continue;
    }

    const hits: string[] = [];
    for (const line of content.split("\n")) {
      const lower = line.toLowerCase();
      if (suspectTerms.some((term) => lower.includes(term))) {
        hits.push(line.trim());
      }
    }

    if (hits.length === 0) {
      parts.push(
        "No indicator/warning lines found in log. **Absence of a match is not proof of a clean device** " +
          "— it means no match against currently downloaded IOC feeds. Manual review of results JSON " +
          "(configuration_profiles, sms, webkit history) is still worthwhile.\n\n"
      );
      continue;
    }

    parts.push(`Found ${hits.length} line(s) worth reviewing:\n\n\`\`\`\n`);
    for (const h of hits) {
      parts.push(`${h}\n`);
    }
    parts.push("```\n\n");
  }

  parts.push(
    "---\n\nThese are keyword-matched log lines, not a verdict. Review the full JSON output under " +
      "`results/<backup>/` for each backup before drawing conclusions, particularly `timeline.csv`, " +
      "`configuration_profiles.json`, and any SMS/webkit modules.\n"
  );

  await fsp.writeFile(summaryPath, parts.join(""));
  return summaryPath;
}

main();