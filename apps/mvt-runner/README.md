# Verichron Epoch: MVT Runner Service (`apps/mvt-runner`)

`apps/mvt-runner` is a specialized micro-service application within the Verichron Epoch monorepo dedicated to driving Mobile Verification Toolkit (`mvt-ios`) commands. It acts as an idempotent execution wrapper that runs artifact extraction scans, cryptographic hashing, decryption, SQLite database repair, and indicator-of-compromise (IOC) matching against local iOS backups.

## Core Capabilities

* **MVT Execution Wrapper:** Programmatically invokes `mvt-ios` processes to scan iOS backups for signs of compromise.


* **Idempotent Pipeline:** Manages independent force flags (`--force`, `--force-decrypt`) to skip completed hashing, decryption, or check stages safely.
* **SQLite Recovery Engine:** Cheaply identifies SQLite databases via magic bytes and automatically runs `.recover` in place on malformed files while preserving corrupt originals.


* **Result Structuring & Reporting:** Feeds raw scanner output back into the pipeline and compiles automated aggregate Markdown summaries of detected warnings and indicator matches.



## Directory Layout

* `src/main.ts`: Core orchestration engine handling backup discovery, change hashing, decryption, repair, analysis, and summary reporting.


* `dist/`: Compiled JavaScript output (generated after build).

## Setup & Development

### Build and Compilation

Compile the TypeScript source into the distribution directory:

```bash
npm install && npm run build

```

### Execution and Usage

Execute the runner via Node.js or `tsx` without a build step:

```bash
node dist/main.js --source ./backups --workspace ./mvt-workspace
# or
npx tsx src/main.ts --source ./backups --workspace ./mvt-workspace

```

### Key CLI Options

* `--source <dir>`: Directory containing backup subdirectories (required).


* `--workspace <dir>`: Workspace directory for hashes, decrypted files, and results (default: `~/mvt-workspace`).


* `--mvt-bin <path>`: Explicit path to the `mvt-ios` binary (auto-discovers standard local virtual environments if omitted).


* `--sqlite-bin <path>`: Path to the `sqlite3` binary used for repairing malformed databases.


* `--force`: Re-run backup checks even if already completed.


* `--force-decrypt`: Force re-decryption, cascading repairs and checks.
