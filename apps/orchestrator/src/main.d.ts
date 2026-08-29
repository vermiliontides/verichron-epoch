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
export {};
