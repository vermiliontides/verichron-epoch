# Verichron Epoch: LLM Triage Application (`apps/analysis`)

`apps/analysis` is the intelligent triage and analysis service within the Verichron Epoch ecosystem. It acts as the automated analysis layer wired into the core orchestrator pipeline, using large language model (LLM) capabilities to evaluate forensic extraction data, assess indicators of compromise (IOCs), and streamline threat investigation.

## Core Capabilities

* **Automated Triage Integration:** Directly interfaces with the monorepo's core orchestrator pipeline to process extracted device data.


* **IOC-Centric Evaluation:** Analyzes restructured forensic logs andss enriched 15-minute event windows around indicators of compromise.


* **LLM-Driven Insights:** Synthesizes complex SQLite-backed extractions and forensic artifacts into concise, actionable intelligence for investigators.

## Architecture & Tech Stack

* **Python Integration:** Operates closely with the repository's Python-based forensic extractors and data pipelines (`libs/` and root configurations).


* **Pipeline Connection:** Wired directly into the orchestrator pipeline (`packages/`) to receive and process stream data post-extraction.


* **Environment Configuration:** Relies on environment parameters configured via the root `.env` template and shared workspace infrastructure.

## Setup & Development

Because `apps/analysis` is part of the Verichron Epoch monorepo, its execution and dependencies align with the overarching workspace patterns:

1. **Environment Setup:** Ensure root `.env` variables (including LLM API keys and database parameters) are populated from `.env.example`.


2. **Dependency Resolution:** Managed via the project's dependency managers (`uv` for Python components and workspace tools).


3. **Orchestrator Execution:** Typically initialized and invoked via the core orchestrator pipeline rather than run as a standalone isolated service.