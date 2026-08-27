"""Shared per-file/per-record success-and-failure accounting for the
extractor pipeline (ETLRunResult).

> **Reconstructed.** This file and libs/runtime-env/runtime_env.py had been
> swapped on disk -- this file held runtime_env's guard code, and the real
> etl_run.py was gone. The repo's history is a single initial commit that
> already contains the swap, so there is no earlier revision to recover
> content from. This is a from-scratch rebuild, not a restore, derived from:
>   - this project's own pyproject.toml description ("per-file/per-record
>     success-and-failure accounting")
>   - every call site in apps/extractors/mvt_iocs/main.py (the only current
>     consumer): ETLRunResult(), .note(), .fail(key, error), .ok(count),
>     .merge(other), .print_summary(label), .exit_code
> Treat this the way EXTRACTOR_CONTRACT.md's stub is treated: functionally
> consistent with every known caller, but not guaranteed to match whatever
> the original implementation did beyond that observable contract.

Lives under libs/ for the same reason runtime-env does: it's a cross-cutting
concern (every extractor needs the same success/failure ledger shape) rather
than something owned by one extractor or by packages/db.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass


@dataclass
class ETLFailure:
    """One failed unit of work -- a whole file, or a single record inside
    an otherwise-good file. `key` identifies what failed (a file name, or
    `"filename[index]"` for a per-record failure); `error` is its message."""

    key: str
    error: str


class ETLRunResult:
    """Accumulates one extractor invocation's outcome across however many
    files and records it touches.

    A single result covers one file's processing (see process_alerts /
    process_timeline in apps/extractors/mvt_iocs/main.py, each of which
    builds its own ETLRunResult), and per-run results are combined with
    merge() so the extractor's main() can report and exit on one final
    tally covering the whole invocation.
    """

    def __init__(self) -> None:
        self.ok_count: int = 0
        self.failures: list[ETLFailure] = []
        self.notes: list[str] = []

    def ok(self, record_count: int) -> None:
        """Record a successful unit of work and how many records it
        produced. 0 is a valid, meaningful count (an empty-but-valid file),
        matching the ingested_files.record_count convention in packages/db."""
        self.ok_count += record_count

    def fail(self, key: str, error: object) -> None:
        """Record one failure. `error` is typically an exception (its
        message is captured via str()) or a plain string explanation."""
        self.failures.append(ETLFailure(key=key, error=str(error)))

    def note(self, message: str) -> None:
        """Record an informational message that is not a failure -- e.g.
        an expected-missing optional input file being skipped."""
        self.notes.append(message)

    def merge(self, other: "ETLRunResult") -> "ETLRunResult":
        """Combine two results into a new one covering both. Non-mutating,
        so callers can keep using either input result afterward if needed."""
        combined = ETLRunResult()
        combined.ok_count = self.ok_count + other.ok_count
        combined.failures = [*self.failures, *other.failures]
        combined.notes = [*self.notes, *other.notes]
        return combined

    @property
    def exit_code(self) -> int:
        """0 if nothing failed, 1 otherwise. Notes never affect this --
        they're informational, not failures."""
        return 1 if self.failures else 0

    def print_summary(self, label: str) -> None:
        """Human-readable summary to stdout/stderr, prefixed with the
        extractor's own label (mirrors the `[mvt_iocs] ...` style already
        used for this extractor's other log lines)."""
        print(f"[{label}] {self.ok_count} record(s) ingested, {len(self.failures)} failure(s)")
        for msg in self.notes:
            print(f"[{label}] note: {msg}")
        for failure in self.failures:
            print(f"[{label}] FAILED {failure.key}: {failure.error}", file=sys.stderr)