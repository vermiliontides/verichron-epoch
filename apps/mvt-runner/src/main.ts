#!/usr/bin/env node
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { spawn } from "node:child_process";
import { discoverBackups, BACKUP_SEARCH_MAX_DEPTH, type Backup } from "@verichron/contracts";

import { parseFlags, type Config } from "./utils/cli.js";
import { pathExists, walkFiles, writeMarker } from "./utils/fs.js";
import { discoverMvtBin } from "./utils/resolver.js";
import { repairDecrypted } from "./utils/repair.js";
import { promptPassword } from "./utils/prompt.js";
import { writeSummary } from "./utils/summary.js";

async function main() {
  const cfg = parseFlags();
  try {
    await run(cfg);
  } catch (err) {
    console.error("error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

async function run(cfg: Config): Promise<void> {
  if (!(await pathExists(cfg.mvtBin))) {
    const discovered = await discoverMvtBin();
    if (discovered) {
      console.log(`[mvt-runner] mvt-ios not found at configured path (${cfg.mvtBin}), discovered at: ${discovered}`);
      cfg.mvtBin = discovered;
    } else {
      throw new Error(
        `mvt-ios not found at ${cfg.mvtBin} or standard locations (pass --mvt-bin to override, or install via python3 -m venv ~/mvt/.venv && ~/mvt/.venv/bin/pip install mvt)`
      );
    }
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
  const failedBackups = new Set<string>();

  for (const backup of backups) {
    const name = backup.label;
    const src = backup.path;
    console.log(`=== ${name} ===`);

    try {
      await hashBackup(cfg, name, src);
    } catch (err) {
      console.error(`  [hash] error: ${err instanceof Error ? err.message : err}`);
      failedBackups.add(name);
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
          failedBackups.add(name);
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
        if (cfg.samePass) {
          haveCached = false;
        }
        failedBackups.add(name);
        continue;
      }
      await writeMarker(decMarker);
      decryptRan = true;
      console.log("  [decrypt] done");
    }

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
          if (result.failed > 0) failedBackups.add(name);
        }
        if (result.scanned !== null) {
          await fsp.writeFile(repairFailuresPath, JSON.stringify(result.failedFiles, null, 2));
          repairFailuresByBackup.set(name, result.failedFiles);
        }
        await writeMarker(repairMarker);
      } catch (err) {
        console.error(`  [repair] error: ${err instanceof Error ? err.message : err}`);
        failedBackups.add(name);
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
        failedBackups.add(name);
        continue;
      }
      await writeMarker(resMarker);
      console.log("  [check]   done ->", resDir);
    }
    console.log();
  }

  const summaryPath = await writeSummary(cfg, backups, repairFailuresByBackup);
  const backupResults = await Promise.all(
    backups.map(async (backup) => ({
      label: backup.label,
      success: !failedBackups.has(backup.label),
      decrypted: await pathExists(path.join(cfg.workspace, "decrypted", backup.label, ".mvt_decrypted_ok")),
    }))
  );
  await fsp.writeFile(
    path.join(cfg.workspace, "summary.json"),
    JSON.stringify({ backups: backupResults }, null, 2)
  );
  console.log("summary written to", summaryPath);
  if (failedBackups.size > 0) {
    console.error(`completed with ${failedBackups.size} backup(s) that need attention`);
    process.exitCode = 1;
  }
}

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

async function readRepairFailures(p: string): Promise<string[]> {
  try {
    const content = await fsp.readFile(p, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

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

main();