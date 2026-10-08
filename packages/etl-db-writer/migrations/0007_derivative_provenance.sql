-- 0007_derivative_provenance.sql  (EPOCH-406)
--
-- A derivative records what produced it, and that provenance is part of its
-- identity.
--
--   tool            {name, version} of the tool that made it (mvt-ios for a
--                   decrypt or a results set). Required: no default.
--   params          what shaped it: a decrypt's repair outcome (sqlite3
--                   version, counts, failed files, preserved originals), a
--                   results set's IOC-set hash. Required: no default.
--   provenance_key  sha256 of the canonical JSON of {tool, params}, computed
--                   by the one writer (orchestrator registration, R2) with
--                   contracts' provenanceKey().
--
-- Identity becomes (evidence, kind, parent, provenance_key). A different
-- mvt-ios version, repair outcome or IOC set is therefore a NEW derivative:
-- facts already filed under the old one keep pointing at the provenance that
-- produced them, and no row's tool/params is ever rewritten. Only `path`, the
-- last-known location, is updated in place.
--
-- pipeline_stage_status.derivative_id: the derivative each stage read. The
-- orchestrator's resume check compares it, so a new results set (e.g. a new
-- IOC set over the same decrypt) re-runs the stages that read results.
--
-- No backfill: development data is fresh (greenfield), so existing
-- derivative rows are not carried over.

ALTER TABLE evidence_derivatives
    ALTER COLUMN tool DROP DEFAULT,
    ALTER COLUMN params DROP DEFAULT,
    ADD COLUMN provenance_key TEXT NOT NULL
        CONSTRAINT evidence_derivatives_provenance_key_hex CHECK (provenance_key ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT evidence_derivatives_tool_named
        CHECK (jsonb_typeof(tool -> 'name') = 'string' AND jsonb_typeof(tool -> 'version') = 'string');

DROP INDEX evidence_derivatives_identity;
CREATE UNIQUE INDEX evidence_derivatives_identity
    ON evidence_derivatives (evidence_id, kind, parent_derivative_id, provenance_key) NULLS NOT DISTINCT;

ALTER TABLE pipeline_stage_status
    ADD COLUMN derivative_id UUID REFERENCES evidence_derivatives (derivative_id);
