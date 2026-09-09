# Verichron Epoch: MVT Runner Service (`apps/mvt-runner`)

`apps/mvt-runner` is a specialized micro-service application within the Verichron Epoch monorepo dedicated to driving Mobile Verification Toolkit (`mvt-ios`) commands. It acts as the execution wrapper that runs artifact extraction scans and indicator-of-compromise (IOC) matching against local iOS backups.

## Core Capabilities

* **MVT Execution Wrapper:** Programmatically invokes `mvt-ios` processes to scan iOS backups for signs of compromise.


* **Artifact Scanning:** Coordinates targeted extractions of system logs, diagnostics, and application records as dictated by the orchestrator pipeline.
* **Result Structuring:** Feeds raw scanner output back into the broader pipeline to be enriched and analyzed within the 15-minute timeframe window surrounding any detected IOC.



## Architecture & Tech Stack

* **Python Engine:** Built on the monorepo's primary backend language stack (Python 54.1%), leveraging the repository's core forensic modules.


* **Dependency Management:** Utilizes modern Python packaging workflows via `uv` consistent with the rest of the `libs/` and backend architecture.


* **Pipeline Integration:** Coordinates directly with the core orchestrator package (`packages/`) to receive scan tasks and report back structured results.



## Setup & Development

1. **Environment Preparation:** Ensure root `.env` configurations are set up and `uv` dependencies are installed across the workspace.


2. **Service Invocation:** Typically run as a background service or invoked dynamically by the core orchestrator framework rather than used standalone.