# Analysis stage (`apps/analysis`)

A pipeline stage (order 80) that asks a local LLM, through Ollama, to flag
suspicious entries in mvt's JSON output.

- It reads the **mvt results** derivative.
- It sends chunks of each JSON file to the model, which answers `SAFE` or lists
  suspicious rows.
- Flagged rows become `llm_flagged_anomaly` records.

These findings are **leads, not evidence**: they belong in a separate,
examiner-reviewed section of the report and never mix with extracted facts
([decision](../../docs/decisions.md#ai)).

## Run

It runs as part of the pipeline; see the
[stage contract](../../packages/contracts/EXTRACTOR_CONTRACT.md). It needs Ollama
on `http://localhost:11434` with the configured model pulled.

`forensics_benchmark.py` is a developer script that compares two models on a
hand-written chunk. The evaluation set (EPOCH-441) replaces it.

**Known issues:**

| Issue | Ticket |
|---|---|
| Findings from a different model or prompt dedup against earlier ones | EPOCH-426 |
| Writes its checkpoint and a second report into the mvt results directory | EPOCH-449 |
| No tests | EPOCH-450 |
| The model isn't pinned by digest | EPOCH-439 |
