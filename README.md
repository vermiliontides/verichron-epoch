# Verichron Epoch

Verichron Epoch is an iOS forensics tool designed for the local exploration of mvt-ios backups. The platform utilizes `mvt-ios`, `iLEAPP`, and actively repairs damaged SQLite databases that may have been corrupted during extraction. To streamline forensic investigations, all extracted data is restructured into an enriched version to better analyze what was occurring in the 15-minute window around an indicator of compromise (IOC).

## Core Capabilities

* **iOS Backup Exploration:** Facilitates deep, localized exploration of `mvt-ios` backups.


* **Database Remediation:** Automatically repairs corrupted or damaged SQLite databases to ensure data integrity during analysis.


* **Targeted Timeframe Analysis:** Restructures data to isolate and enrich events within a 15-minute window surrounding an indicator of compromise.


* **Pipeline Orchestration:** Utilizes an orchestrator pipeline that integrates directly with downstream analysis tools, including an LLM triage application.



## Repository Structure

This project is structured as a monorepo to separate frontend applications, core Python forensics libraries, and shared packages:

* **`apps/`**: Contains the primary frontend and high-level applications, including the Electron desktop client (`apps/epoch`), the LLM triage application (`apps/analysis`), extractors, and MVT runner services. Please refer to individual app README files for application-specific documentation and usage instructions.


* **`libs/`**: Houses the core forensic extractors and shared infrastructure modules migrated to use `uv`. Please refer to the `libs/` directory for detailed library APIs and Python dependency guidelines.


* **`packages/`**: Contains internal shared packages and core orchestrator pipeline components.


* **`infra/`**: Contains infrastructure configurations, including Docker and PostgreSQL environment setups.


* **`scripts/`**: Houses utility and build scripts utilized for environment maintenance and package management.


* **`backups/` & `ileapp_raw_output/**`: Directories dedicated to handling test data and raw outputs from integrations.



## Tool Acquisition Strategy & Air-Gapped Support

Verichron Epoch balances installation simplicity with strict offline security compliance through a dual-path tool acquisition strategy:

* **Online Verified Downloads:** For standard environments, the application checks a hosted release manifest and dynamically fetches pre-built, checksum-verified binaries from GitHub releases into a user-local directory (`userData/tools/idevicebackup2`). This prevents massive installer bloat while maintaining a seamless onboarding experience.
* **Offline & Air-Gapped Fallback:** For secure, air-gapped forensic labs where internet access is restricted, the application gracefully falls back to local source compilation (`make install` or WSL-managed builds) or manual system tool instructions (`apt`/`brew`), ensuring the platform remains fully functional without external network dependencies.

## Tech Stack & Environment

The project relies on a hybrid stack to bridge forensic data processing with local desktop interfaces:

* **Python (54.1%):** Powers the core forensic extraction, SQLite repairs, and orchestrator pipelines. The Python ecosystem relies on `uv` for fast, reproducible dependency management (`uv.lock`, `pyproject.toml`).


* **TypeScript (43.6%):** Drives the user interfaces, specifically the local Electron application. Node dependencies are managed via `pnpm` (`pnpm-lock.yaml`, `pnpm-workspace.yaml`).


* **Infrastructure:** Utilizes Docker for database provisioning (PostgreSQL), managed through environment variables (`.env.example`).