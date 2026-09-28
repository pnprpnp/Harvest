"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateExport } = require("../tools/evaluate_growth.cjs");
const model = require("../src/scripts/growth-model.js");
test("export replay uses the requested cutoff and leaves the exported archive unchanged", () => {
  const payload = { app:"Harvestnavi", type:"growth-evaluation-backup", schemaVersion:1,
    exportedAt:"2026-09-25T12:00:00+09:00", samples:[{
      id:"late", date:"2026-09-20", plantingDate:"2026-08-20", building:2, bed:"A", sizeRating:"normal"
    }], weather:{ daily:[] }, weatherHistory:[] };
  const original = JSON.stringify(payload);
  const output = evaluateExport(payload, "2026-09-01");
  assert.equal(output.asOf, "2026-09-01");
  const empty = model.backtest([], { asOf:"2026-09-01", weatherDaily:[], forecastHistory:[], maxFolds:24 });
  assert.deepEqual(output.result.methods, empty.methods);
  assert.deepEqual(output.result.rows, empty.rows);
  assert.equal(JSON.stringify(payload), original);
  payload.asOf = "2026-09-25T12:00:00+09:00";
  payload.backtest = { asOf:"2026-09-25" };
  assert.equal(evaluateExport(payload).asOf, payload.asOf, "replay must preserve the original cutoff time instead of rewinding to midnight");
});
test("export replay rejects an unrelated backup or invalid cutoff", () => {
  assert.throws(() => evaluateExport({ records:[] }), /JSON/);
  assert.throws(() => evaluateExport({ app:"Harvestnavi", type:"growth-evaluation-backup", schemaVersion:1,
    samples:[], exportedAt:"invalid" }), /日付/);
});
