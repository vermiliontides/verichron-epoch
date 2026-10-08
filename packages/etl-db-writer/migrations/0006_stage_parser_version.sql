-- 0006_stage_parser_version.sql  (EPOCH-404 review)
--
-- Each stage row records the parserVersion its stage.json declared when the
-- run was planned. The orchestrator's resume check needs it: a complete run
-- only stands in for a new one if it ran every stage that is enabled now, at
-- the parser_version declared now. Without it, a parserVersion bump (R8: new
-- version = new rows) or a newly enabled stage was skipped as "already done".
--
-- NULL = the stage declares no parserVersion (it writes no facts, e.g. the
-- report). Single statement: it is both this migration's start and finish
-- marker in migrate.py.

ALTER TABLE pipeline_stage_status
    ADD COLUMN parser_version INTEGER CHECK (parser_version IS NULL OR parser_version >= 1);
