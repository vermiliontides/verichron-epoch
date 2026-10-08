import { spawn } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";
import { pathExists } from "./fs.js";

export async function findInPath(binName: string): Promise<string | null> {
  const isWin = process.platform === "win32";
  const cmd = isWin ? "where" : "which";
  return new Promise((resolve) => {
    const child = spawn(cmd, [binName], { stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.on("close", (code) => {
      if (code === 0) {
        const firstLine = stdout.split("\n")[0].trim();
        resolve(firstLine || null);
      } else {
        resolve(null);
      }
    });
    child.on("error", () => resolve(null));
  });
}

export async function discoverMvtBin(): Promise<string | null> {
  const home = os.homedir();
  const candidates = [
    path.join(home, "mvt", ".venv", "bin", "mvt-ios"),
    path.join(home, ".local", "bin", "mvt-ios"),
    path.join(process.cwd(), ".venv", "bin", "mvt-ios"),
    path.join(process.cwd(), "..", "..", ".venv", "bin", "mvt-ios"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  const globalBin = await findInPath("mvt-ios");
  if (globalBin) {
    return globalBin;
  }

  return null;
}

/**
 * The sqlite3 binary's version (first token of `sqlite3 -version`), or null
 * if it can't be run. Recorded in a decrypt's repair provenance (EPOCH-406).
 */
export async function sqliteVersion(sqliteBin: string): Promise<string | null> {
  return new Promise((resolve) => {
    let out = "";
    const child = spawn(sqliteBin, ["-version"], { stdio: ["ignore", "pipe", "ignore"] });
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 && out.trim() ? out.trim().split(/\s+/)[0] : null));
  });
}
