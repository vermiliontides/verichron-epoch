# Verichron Epoch: Extractors Service (`apps/extractors`)

`apps/extractors` manages the specialized forensic data extraction and parsing pipelines for Verichron Epoch, integrating tools like `mvt-ios` and `iLEAPP` to process device artifacts.

## Core Capabilities

* **Forensic Parsing:** Executes extraction routines across local iOS backups and artifact dumps.


* **Database Remediation:** Automatically detects and repairs corrupted SQLite databases resulting from device extractions.


* **Event Enrichment:** Restructures raw output into normalized, enriched timeline formats optimized for analyzing a 15-minute window around an indicator of compromise.



## Architecture & Tech Stack

* **Python Engine:** Built on the repository's Python-centric data processing stack.


* **Pipeline Interoperability:** Connects with the core orchestrator (`packages/`) and LLM triage services (`apps/analysis`) to pass structured forensic output.



## Setup & Execution

1. **Environment Management:** Relies on the monorepo's Python dependency configuration (`uv` and root `pyproject.toml`).


2. **Workflow Integration:** Executed automatically as part of the core orchestrator pipeline or invoked via backend service scripts.