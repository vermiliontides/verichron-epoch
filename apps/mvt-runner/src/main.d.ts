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
export {};
