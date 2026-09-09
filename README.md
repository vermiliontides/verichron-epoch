Verichron Epoch
Verichron Epoch is an iOS forensics tool designed for the local exploration of mvt-ios backups. The platform utilizes mvt-ios and iLEAPP, and it actively repairs damaged SQLite databases that may have been corrupted during extraction. To streamline forensic investigations, all extracted data is restructured into an enriched format, providing a highly focused analysis of system and user events occurring within a 15-minute window around a specific indicator of compromise.  
HTML
+ 2
Core Capabilities
iOS Backup Exploration: Facilitates deep, localized exploration of mvt-ios backups.  
HTML
Database Remediation: Automatically repairs corrupted or damaged SQLite databases to ensure data integrity during analysis.  
HTML
Targeted Timeframe Analysis: Restructures data to isolate and enrich events within a 15-minute window surrounding an indicator of compromise.  
HTML
Pipeline Orchestration: Utilizes an orchestrator pipeline that integrates directly with downstream analysis tools, including an LLM triage application.  
HTML
Repository Structure
This project is structured as a monorepo to separate frontend applications, core Python forensics libraries, and shared packages.  
HTML
apps/: Contains the primary frontend and high-level applications, including the Electron application setup and the LLM triage app (apps/analysis). Please refer to the apps/README.md for application-specific documentation, setup, and usage instructions.  
HTML
libs/: Houses the core forensic extractors and shared infrastructure modules, which have been migrated to use uv. Please refer to the libs/README.md for detailed library APIs and Python dependency guidelines.  
HTML
packages/: Contains internal shared packages and orchestrator pipeline components. Please refer to the packages/README.md for internal package specifications.  
HTML
infra/: Contains infrastructure configurations, including Docker and PostgreSQL environment setups.  
HTML
scripts/: Houses utility and build scripts utilized for environment maintenance and package management.  
HTML
backups/ & ileapp_raw_output/: Directories dedicated to handling test data and raw outputs from the iLEAPP integration.  
HTML
Tech Stack & Environment
The project relies on a hybrid stack to bridge forensic data processing with local desktop interfaces:  
HTML
Python (54.1%): Powers the core forensic extraction, SQLite repairs, and orchestrator pipelines. The Python ecosystem relies on uv for fast, reproducible dependency management (uv.lock, pyproject.toml).  
HTML
+ 1
TypeScript (43.6%): Drives the user interfaces, specifically the local Electron application. Node dependencies are managed via pnpm (pnpm-lock.yaml, pnpm-workspace.yaml).  
HTML
+ 1
Infrastructure: Utilizes Docker for database provisioning (PostgreSQL), managed through environment variables (.env.example).  
HTML