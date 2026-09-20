Verichron Epoch

Verichron Epoch is an advanced iOS forensics platform designed for local exploration of mvt-ios backups. The platform integrates mvt-ios, iLEAPP, and automated SQLite database remediation to repair corruption resulting from extraction. To streamline investigations, extracted data is restructured into an enriched timeline analyzing activity in the 15-minute window surrounding an indicator of compromise (IOC).

Dual Operational Modes

Verichron Epoch supports two distinct deployment modes to balance accessibility with strict security compliance:

Consumer Mode ("Just Works"): Streamlined for standard onboarding, allowing dynamic tool acquisition and network features.

Lab Mode (Air-Gapped & Secure): Engineered for secure, air-gapped forensic labs where internet access is restricted, ensuring evidence remains legally admissible and protected.

Core Capabilities

iOS Backup Exploration: Facilitates deep, localized exploration of mvt-ios backups.

Database Remediation: Automatically repairs corrupted or damaged SQLite databases to ensure data integrity during analysis.

Targeted Timeframe Analysis: Restructures data to isolate and enrich events within a 15-minute window surrounding an indicator of compromise.

Pipeline Orchestration: Utilizes an orchestrator pipeline integrating directly with downstream analysis tools, including local LLM triage.

Repository Structure

The project is structured as a monorepo using pnpm workspaces and uv for Python dependency management:

apps/: Contains high-level applications, including the Electron desktop client (apps/epoch), the LLM triage application (apps/analysis), extractors, and MVT runner services.

Note on UI/UX: Frontend applications within apps/epoch adhere to the UI/UX design tokens and visual hierarchy defined in DESIGN.md (elevation over flat borders, 4px spacing grid, and 3-tier type scales).

libs/: Houses core forensic extractors and shared infrastructure modules managed via uv.

packages/: Internal shared packages and core orchestrator pipeline components.

infra/: Infrastructure configurations, including Docker and PostgreSQL environment setups.

scripts/: Utility and build scripts for environment maintenance and package management.

backups/ & ileapp_raw_output/: Directories dedicated to test data and raw integration outputs.

Tool Acquisition Strategy & Air-Gapped Support

Verichron Epoch bridges installation simplicity with strict offline security compliance through a dual-path tool acquisition strategy:

Online Verified Downloads: For standard environments, the application checks a hosted release manifest and fetches checksum-verified binaries from GitHub releases into a user-local directory (userData/tools/idevicebackup2).

Offline & Air-Gapped Fallback: For secure forensic labs, the application gracefully falls back to local source compilation (make install or WSL-managed builds) or manual system tool instructions (apt/brew), ensuring full offline functionality.

Tech Stack & Environment

The project relies on a hybrid stack bridging forensic data processing with local desktop and AI interfaces:

Python (54.1%): Powers core forensic extraction, SQLite repairs, ETL parsers, and orchestrator pipelines, managed via uv (uv.lock, pyproject.toml).

TypeScript (43.6%): Drives user interfaces, the Electron desktop application, and orchestration, managed via pnpm (pnpm-lock.yaml, pnpm-workspace.yaml).

AI & Storage Infrastructure: Leverages PostgreSQL for persistent storage and Ollama for local pattern recognition and triage support.