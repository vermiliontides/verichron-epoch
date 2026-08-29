"use strict";
/**
 * Public entry point for `@verichron/contracts`.
 *
 * `epoch` and `@verichron/db-writer` both declare a dependency on this
 * package, and its package.json has always pointed `main` at `dist/index.js`.
 * TypeScript consumers validate with the Zod model exported here.
 *
 * The canonical JSON Schema (`normalized-record.schema.json`, a sibling of
 * this file) is deliberately not re-exported through TypeScript: importing
 * JSON from outside this package's rootDir fights `composite`/`outDir`
 * emit, and Zod already gives TS callers the same guarantee. Python callers
 * that want raw JSON Schema validation use `adapter.py` in this same
 * directory.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceType = exports.NormalizedRecord = void 0;
var normalizedRecord_js_1 = require("./normalizedRecord.js");
Object.defineProperty(exports, "NormalizedRecord", { enumerable: true, get: function () { return normalizedRecord_js_1.NormalizedRecord; } });
Object.defineProperty(exports, "SourceType", { enumerable: true, get: function () { return normalizedRecord_js_1.SourceType; } });
