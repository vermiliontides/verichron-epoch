# Verichron Epoch: Desktop Application (`apps/epoch`)

`apps/epoch` is the primary graphical user interface for Verichron Epoch, an iOS forensics tool built for the local exploration of mvt-ios backups. As an Electron application, it provides investigators with a localized desktop environment to interact with the underlying forensic extraction pipelines.

## Core Capabilities

This application serves as the user-facing frontend for the broader Verichron Epoch ecosystem. Through this interface, users can:

* **Explore Backups:** Conduct local explorations of mvt-ios device backups.


* **Trigger Forensic Pipelines:** Interface with the core orchestrator, which utilizes mvt-ios and iLEAPP to extract device data.


* **View Remediated Data:** Access data from SQLite databases that have been automatically repaired after extraction corruption.


* **Analyze IOC Timeframes:** View restructured and enriched data designed specifically for analyzing events occurring within a 15-minute window around a specified indicator of compromise.



## Technical Stack & Environment

The `apps/epoch` environment relies on the Node.js ecosystem within the broader monorepo structure:

* **Language:** Built entirely in TypeScript, which comprises 43.6% of the overall repository.


* **Framework:** Packaged and run as an Electron application.


* **Package Management:** Relies on `pnpm` for workspace and dependency management, utilizing the monorepo's root `pnpm-workspace.yaml` and `pnpm-lock.yaml`.


* **Configuration:** TypeScript compilation and developer environment settings are strictly managed via the local `tsconfig.json` to ensure a stable Electron development experience.



## Development & Setup

Because `apps/epoch` is part of a tightly integrated monorepo, its setup is governed by the root workspace.

1. **Install Dependencies:** Run `pnpm install` from the root of the repository to resolve all workspace packages.
2. **Environment Variables:** Ensure any necessary environment configuration is duplicated from the root `.env.example` file.


3. **Local Execution:** (Follow standard `pnpm run dev` or equivalent scripts defined in the `package.json` to launch the Electron development server).



Note: For details on the underlying Python extraction scripts (which make up 54.1% of the repository) or the LLM triage integrations, please refer to the `libs/` or `packages/` documentation.ßßsss