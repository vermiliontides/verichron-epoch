"use strict";
/**
 * Public entry point for `@verichron/db-writer`.
 *
 * Not currently imported anywhere in this repo: apps/orchestrator writes
 * pipeline_runs/pipeline_stage_status directly with parameterized `pg`
 * queries, which is the correct boundary for that table pair (simple
 * upserts, no cross-file dedup, no partial-write hazard). This package
 * exists for ingested_files/forensic_records, and specifically for a
 * TypeScript extractor that writes to them -- none exists yet; all three
 * current extractors (crash, ileapp_bridge, mvt_iocs) are Python and use
 * db_writer.py. When a TypeScript extractor is added, it should depend on
 * this package rather than issuing its own forensic_records inserts, for
 * the same reason db_writer.py is mandatory on the Python side: the
 * ingest/dedup atomicity guarantee documented on `ingest()` below is easy
 * to defeat by accident and hard to notice you've defeated, and this
 * package is the one place that guarantee is implemented and tested.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_RECORDS_PER_STATEMENT = exports.incompleteIngests = exports.writeRecords = exports.writeRecord = exports.ingest = exports.IngestUnit = exports.computeFileHash = exports.DEFAULT_DB_URL = void 0;
var dbWriter_js_1 = require("./dbWriter.js");
Object.defineProperty(exports, "DEFAULT_DB_URL", { enumerable: true, get: function () { return dbWriter_js_1.DEFAULT_DB_URL; } });
Object.defineProperty(exports, "computeFileHash", { enumerable: true, get: function () { return dbWriter_js_1.computeFileHash; } });
Object.defineProperty(exports, "IngestUnit", { enumerable: true, get: function () { return dbWriter_js_1.IngestUnit; } });
Object.defineProperty(exports, "ingest", { enumerable: true, get: function () { return dbWriter_js_1.ingest; } });
Object.defineProperty(exports, "writeRecord", { enumerable: true, get: function () { return dbWriter_js_1.writeRecord; } });
Object.defineProperty(exports, "writeRecords", { enumerable: true, get: function () { return dbWriter_js_1.writeRecords; } });
Object.defineProperty(exports, "incompleteIngests", { enumerable: true, get: function () { return dbWriter_js_1.incompleteIngests; } });
Object.defineProperty(exports, "MAX_RECORDS_PER_STATEMENT", { enumerable: true, get: function () { return dbWriter_js_1.MAX_RECORDS_PER_STATEMENT; } });
