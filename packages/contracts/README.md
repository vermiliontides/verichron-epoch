# Contracts Package (`packages/contracts`)

> **Canonical location.** `packages/contracts/normalized-record.schema.json` is the single source of truth for the Verichron Epoch data envelope.

This package is the boundary definition for data flowing across our polyglot architecture. Everything lives flat in this one directory -- the canonical schema, both language mirrors, the Python runtime adapter, and their tests -- so there is one place to look and one place for CI to check for drift.

---

## Directory Structure

```text
packages/contracts/
├── __init__.py                       # marks this as a Python package
├── normalized-record.schema.json     # the canonical JSON schema (source of truth)
├── normalized_record.py              # Python / Pydantic mirror (source_type enum is generated)
├── normalizedRecord.ts               # TypeScript / Zod mirror (source_type enum is generated)
├── adapter.py                        # Python runtime validation against the canonical schema
├── index.ts                          # TypeScript package entry point
├── conftest.py                       # pytest sys.path setup for this directory
├── test_contract_sync.py             # guards the mirrors against drifting from the schema
├── EXTRACTOR_CONTRACT.md             # what every extractor must do before writing a record
├── package.json                      # workspace package manifest
└── tsconfig.json                     # TypeScript compiler configuration
```

## Keeping the mirrors in sync

Add a new `source_type` to `normalized-record.schema.json` first, then run:

```bash
python3 scripts/sync_contracts.py --write
```

CI runs `python3 scripts/sync_contracts.py --check` and fails the build if either mirror has drifted from the schema.
