# mvt-runner (`@verichron/mvt-runner`)

Prepares iOS backups for the pipeline. For each backup it:

1. hashes it into its evidence identity;
2. decrypts it with `mvt-ios`;
3. repairs malformed SQLite databases;
4. runs `mvt-ios check-backup` against a hashed copy of the IOC set.

It writes only to the workspace and never touches the database. The workspace
layout and the role this plays are described in
[docs/architecture.md](../../docs/architecture.md), and the identity and markers
in [docs/evidence-model.md](../../docs/evidence-model.md).

## Run

```bash
pnpm --filter @verichron/mvt-runner dev -- --source <dir-of-backups> --workspace <workspace>
```

It prompts for the backup password on stdin. The desktop app relays that prompt
to its UI.

| Option | Meaning |
|---|---|
| `--source <dir>` | Directory containing encrypted backups (required) |
| `--workspace <dir>` | Output workspace (default `~/mvt-workspace`) |
| `--mvt-bin <path>` | `mvt-ios` binary (found automatically in common venv locations) |
| `--mvt-home <dir>` | mvt's data and config home, where the IOC set lives (default `$VERICHRON_MVT_HOME` or `~/.local/share/verichron/mvt`) |
| `--sqlite-bin <path>` | `sqlite3` for the repair pass |
| `--force` | Re-run `check-backup` even if current |
| `--force-decrypt` | Re-decrypt, then repair and check again |
| `--verify` | Re-read every byte when hashing, ignoring the stat cache |
| `--refresh-iocs`, `--ioc-max-age <dur>` | Refresh the IOC set (default: when older than 168h) |
| `--only <names>` | Process only these backup labels |
| `--different-passwords` | Prompt per backup instead of reusing one password |

Each step is skipped when its output is current. Current means the output's
marker names this backup's content root, this mvt-ios version and, for results,
this IOC set. Anything else is redone from scratch. `MVT_STIX2` is refused,
because the recorded IOC set must be exactly the one used.

## Source

| File | Responsibility |
|---|---|
| `src/main.ts` | The per-backup loop: hash → decrypt → repair → check, plus markers and summary |
| `src/utils/manifest.ts` | Canonical manifest, `content_root`, stat cache |
| `src/utils/repair.ts` | SQLite quick-check and `.recover`, returning repair provenance |
| `src/utils/resolver.ts` | Finding `mvt-ios`; reading the `sqlite3` version |
| `src/utils/prompt.ts` | Password prompt |
| `src/utils/summary.ts` | `summary.md` |

## Test

```bash
pnpm --filter @verichron/mvt-runner test
```

The tests drive the real CLI against stub `mvt-ios` and `sqlite3` executables.

**Known issues:** the backup password is passed to `mvt-ios` on the command line
(EPOCH-423). The app reads this tool's progress by parsing its log lines
(EPOCH-445).
