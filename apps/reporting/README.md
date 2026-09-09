
# Verichron Epoch: Reports and Summary Layer (`apps/reporting`)

`apps/reporting` handles the generation, compilation, and presentation of forensic findings within the Verichron Epoch ecosystem. It aggregates enriched timelines, repaired SQLite database logs, and automated triage results into final investigator-ready summaries.

## Core Capabilities

* **Forensic Report Generation:** Compiles structured outputs from the core orchestrator pipeline into readable formats.


* **IOC Window Highlighting:** Formats the 15-minute event window surrounding any detected indicator of compromise for immediate review.


* **Artifact & Remediation Export:** Displays records of repaired SQLite databases and raw forensic artifacts extracted via `mvt-ios` and `iLEAPP`.



## Architecture & Tech Stack

* **Monorepo Integration:** Interfaces closely with the frontend desktop application (`apps/epoch`), the LLM triage application (`apps/analysis`), and the core orchestrator pipeline (`packages/`).


* **Environment Setup:** Adheres to workspace-level configurations and Python/TypeScript environment management standards.