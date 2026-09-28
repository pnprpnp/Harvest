"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const evidence = require("../src/scripts/growth-evidence.js");
const model = require("../src/scripts/growth-model.js");
const risk = require("../src/scripts/growth-risk.js");
const asOf = "2026-09-26T12:00:00+09:00";
const sample = extra => ({ id:"harvest:1", groupId:"harvest1", cropId:"crop1", plantingEventId:123,
  building:2, bed:"A", plantingDate:"2026-09-01", date:"2026-09-24", palletKeys:["2-A-1", "2-A-2"],
  sizeRating:"normal", readyDate:"2026-09-22", qualityWeight:1, symptoms:{ tipburn:"none", elongated:"none", uneven:"none" }, ...extra });
const observation = (kind, extra = {}) => ({ observationId:`${kind}:1`, kind, building:2, bed:"A", palletKeys:[],
  createdAt:"2026-09-10T09:00:00+09:00", updatedAt:"2026-09-10T09:00:00+09:00", deletedAt:"", revision:1,
  ...(kind === "environment" ? { startDate:"2026-09-05", endDate:"", payload:{ temperature:"high", light:"low", humidity:"base", dataPolicy:"normal" } }
    : kind === "condition" ? { startDate:"2026-09-05", endDate:"2026-09-15", payload:{ type:"equipmentFailure", dataPolicy:"exclude", note:"配管停止" } }
      : kind === "ec" ? { date:"2026-09-10", payload:{ value:1.8, unit:"mS/cm" } }
        : { plantingEventId:123, plantingDate:"2026-09-01", palletKeys:["2-A-1", "2-A-2"], date:"2026-09-10",
          payload:kind === "manualOffset" ? { days:-2, sourcePredictionId:"prior-prediction" } : { size:"small", quality:{ tipburn:"unknown", elongated:"low", uneven:"high" } } }), ...extra });
const weather = Array.from({ length:30 }, (_, i) => ({ date:model.addDays("2026-09-01", i), meanTemp:20, lightIndex:1, source:"observation" }));

test("joins explicit house, bed and position scopes without changing source records or cultivar labels", () => {
  const input = [sample(), sample({ id:"B", bed:"B", palletKeys:["2-B-1"] }), sample({ id:"other", building:3, palletKeys:["3-A-1"] })];
  const rows = [observation("environment", { bed:"" }), observation("ec"), observation("condition", { palletKeys:["2-A-1", "2-A-2"] })];
  const original = JSON.stringify({ input, rows });
  const output = evidence.annotate(input, rows, { asOf });
  assert.equal(output[0].environmentRegimes.length, 1);
  assert.equal(output[0].environmentRegimes[0].temperatureOffsetC, 1);
  assert.equal(output[0].environmentRegimes[0].lightMultiplier, 0.88);
  assert.equal(output[0].excludedFromTraining, true);
  assert.equal(output[0].specialConditions[0].type, "equipmentFailure");
  assert.equal(output[1].environmentRegimes.length, 1);
  assert.equal(output[1].growthEvidence.ec.length, 0);
  assert.equal(output[1].excludedFromTraining, undefined);
  assert.equal(output[2].environmentRegimes.length, 0);
  for(const key of ["id", "groupId", "cropId", "sizeRating", "readyDate", "qualityWeight", "symptoms"]) assert.deepEqual(output[0][key], input[0][key]);
  assert.equal(JSON.stringify({ input, rows }), original);
});

test("a partial position observation never expands to the full bed; explicit position queries can use it", () => {
  const row = observation("condition", { palletKeys:["2-A-1"] });
  const input = [sample(), sample({ id:"single", palletKeys:["2-A-1"] }), sample({ id:"elsewhere", palletKeys:["2-A-2"] }), sample({ id:"old", palletKeys:[] })];
  const output = evidence.annotate(input, [row], { asOf });
  assert.equal(output[0].excludedFromTraining, undefined);
  assert.equal(output[0].growthEvidence.ignoredPartialScope[0].reason, "partial");
  assert.equal(output[0].growthEvidence.confidenceReduced, true);
  assert.equal(output[1].excludedFromTraining, true);
  assert.equal(output[2].growthEvidence.ignoredPartialScope.length, 0);
  assert.equal(output[2].excludedFromTraining, undefined);
  assert.equal(output[3].growthEvidence.ignoredPartialScope[0].reason, "unknown-position");
  assert.equal(output[3].excludedFromTraining, undefined);
});

test("future or exactly-cutoff revisions have no effect; a known tombstone cancels without resurrecting older versions", () => {
  const base = evidence.annotate([sample()], [], { asOf });
  const future = observation("condition", { updatedAt:"2026-09-27T00:00:00+09:00" });
  const exact = observation("environment", { updatedAt:asOf });
  assert.deepEqual(evidence.annotate([sample()], [future, exact], { asOf }), base);
  const original = observation("environment");
  const deleted = { ...original, updatedAt:"2026-09-20T09:00:00+09:00", deletedAt:"2026-09-20T09:00:00+09:00", revision:2 };
  assert.equal(evidence.annotate([sample()], [deleted, original], { asOf })[0].environmentRegimes.length, 0);
  const past = evidence.annotate([sample()], [deleted, original], { asOf:"2026-09-15T12:00:00+09:00" });
  assert.equal(past[0].environmentRegimes.length, 1);
});

test("date intervals overlap the crop, and manual/field records require the exact planting event", () => {
  const rows = [observation("environment", { startDate:"2026-08-01", endDate:"2026-08-31" }),
    observation("condition", { startDate:"2026-09-25", endDate:"" }),
    observation("manualOffset", { plantingEventId:999 }), observation("fieldAssessment", { plantingDate:"2026-08-31" })];
  const result = evidence.annotate([sample()], rows, { asOf })[0];
  assert.equal(result.environmentRegimes.length, 0);
  assert.equal(result.excludedFromTraining, undefined);
  assert.equal(result.growthEvidence.appliedIds.length, 0);
  assert.equal(result.growthEvidence.manualOffset, null);
});

test("manual offsets and field assessments are metadata and never synthetic harvest or ready labels", () => {
  const rows = [observation("manualOffset"), observation("fieldAssessment"), observation("manualOffset", { observationId:"reset", date:"2026-09-15",
    updatedAt:"2026-09-15T09:00:00+09:00", payload:{ days:0, sourcePredictionId:"later-prediction" } })];
  const output = evidence.annotate([sample()], rows, { asOf })[0];
  assert.equal(output.sizeRating, "normal");
  assert.equal(output.readyDate, "2026-09-22");
  assert.equal(output.symptoms.elongated, "none");
  assert.equal(output.growthEvidence.manualOffset.days, 0);
  assert.equal(output.growthEvidence.manualOffset.trainingEligible, false);
  assert.equal(output.growthEvidence.fieldAssessments[0].size, "small");
  assert.deepEqual(output.growthEvidence.fieldAssessments[0].quality, { elongated:"slight", uneven:"many", tipburn:"unknown" });
  assert.equal(output.trainingPolicies.length, 0);
  assert.equal(output.growthEvidence.trainingInputsChanged, false);
});

test("EC absence and a large measured value never invent an abnormal flag or exclusion", () => {
  const rows = [observation("ec", { payload:{ value:40, unit:"mS/cm" } }), observation("ec", { observationId:"normal", payload:{ value:2, unit:"mS/cm", isAbnormal:false } })];
  const unflagged = evidence.annotate([sample()], rows, { asOf })[0];
  assert.deepEqual(unflagged.growthEvidence.ec.map(row => row.isAbnormal), [null, false]);
  assert.equal(unflagged.growthEvidence.confidenceReduced, false);
  assert.equal(unflagged.excludedFromTraining, undefined);
  const flagged = evidence.annotate([sample()], [observation("ec", { payload:{ value:1.8, unit:"mS/cm", isAbnormal:true } })], { asOf })[0];
  assert.equal(flagged.growthEvidence.confidenceReduced, true);
  assert.equal(flagged.growthEvidence.reasons[0].code, "explicitAbnormalEc");
  assert.equal(flagged.excludedFromTraining, undefined);
});

test("late downweight/exclude policies are evaluated at each fold, not baked into earlier sample weights", () => {
  const input = sample({ date:"2026-09-10", readyDate:null });
  const row = observation("environment", { updatedAt:"2026-09-20T09:00:00+09:00",
    payload:{ temperature:"base", light:"base", humidity:"base", dataPolicy:"downweight" } });
  const joined = evidence.annotate([input], [row, { ...row, observationId:"duplicate-policy" }], { asOf });
  assert.equal(joined[0].qualityWeight, 1);
  assert.equal(joined[0].availableAt, undefined);
  const normalized = model.normalizeSamples(joined, asOf).samples;
  const earlyContext = model.prepareWeather(weather, { asOf:"2026-09-15" }), currentContext = model.prepareWeather(weather, { asOf });
  assert.equal(model._test.buildCandidate(normalized, earlyContext, "safe").rows[0].weight, 1);
  assert.equal(model._test.buildCandidate(normalized, currentContext, "safe").rows[0].weight, 0.5);
  assert.equal(risk.fit(joined, { asOf:"2026-09-15", weatherDaily:weather }).buildings[2].tipburn.association.effectiveCount, 1);
  assert.equal(risk.fit(joined, { asOf, weatherDaily:weather }).buildings[2].tipburn.association.effectiveCount, 0.5);
  const excluded = evidence.annotate([input], [observation("condition", { updatedAt:"2026-09-20T09:00:00+09:00" })], { asOf });
  const exclusionNormalized = model.normalizeSamples(excluded, asOf).samples;
  assert.equal(model._test.buildCandidate(exclusionNormalized, earlyContext, "safe").rows.length, 1);
  assert.equal(model._test.buildCandidate(exclusionNormalized, currentContext, "safe").rows.length, 0);
  assert.equal(risk.fit(excluded, { asOf:"2026-09-15", weatherDaily:weather }).buildings[2].tipburn.confirmedCount, 1);
  assert.equal(risk.fit(excluded, { asOf, weatherDaily:weather }).buildings[2], undefined);
});

test("explicit position environment wins over broader scope and never applies before its available timestamp", () => {
  const local = observation("environment", { observationId:"local", palletKeys:["2-A-1"],
    payload:{ temperature:"low", light:"base", humidity:"low", dataPolicy:"normal" } });
  const house = observation("environment", { observationId:"house", bed:"", updatedAt:"2026-09-15T09:00:00+09:00",
    payload:{ temperature:"high", light:"base", humidity:"base", dataPolicy:"normal" } });
  const joined = evidence.annotate([sample({ palletKeys:["2-A-1"] })], [local, house], { asOf })[0];
  const coldWeather = weather.map(day => ({ ...day, meanTemp:18 }));
  const context = model.prepareWeather(coldWeather, { asOf });
  const applied = model._test.accumulate(context, "2026-09-05", "2026-09-05", {}, undefined, joined.environmentRegimes);
  assert.equal(applied.total, 12 / 13);
  assert.ok(joined.growthEvidence.reasons.some(row => row.code === "humidityUncalibrated"));
  assert.equal(joined.environmentRegimes.some(row => own(row, "humidityMultiplier")), false);
});
function own(value, key){ return Object.prototype.hasOwnProperty.call(value, key); }

test("annotation is idempotent and cancelled evidence restores original policy instead of leaving sticky exclusions", () => {
  const input = [sample({ availableAt:"2026-09-24T12:00:00+09:00" })], rows = [observation("condition"), observation("environment")];
  const once = evidence.annotate(input, rows, { asOf });
  assert.deepEqual(evidence.annotate(once, rows, { asOf }), once);
  const removed = evidence.annotate(once, [], { asOf })[0];
  assert.equal(removed.excludedFromTraining, undefined);
  assert.equal(removed.environmentRegimes.length, 0);
  assert.equal(removed.trainingPolicies.length, 0);
  assert.equal(removed.availableAt, input[0].availableAt);
  const originalExclusion = evidence.annotate([sample({ excludedFromTraining:true })], rows, { asOf })[0];
  assert.equal(originalExclusion.exclusionAvailableAt, undefined);
  assert.equal(evidence.annotate([originalExclusion], [], { asOf })[0].excludedFromTraining, true);
});

test("invalid pallet data cannot collapse into house-wide scope and unknown planting cannot borrow a condition", () => {
  const invalid = observation("condition", { palletKeys:["2-A-999"] });
  assert.equal(evidence.annotate([sample()], [invalid], { asOf })[0].excludedFromTraining, undefined);
  const badSample = evidence.annotate([sample({ palletKeys:["2-A-1", "invalid"] })], [observation("condition")], { asOf })[0];
  assert.equal(badSample.excludedFromTraining, undefined);
  assert.equal(badSample.growthEvidence.reasons[0].code, "missingCropScope");
  assert.equal(evidence.annotate([sample({ plantingDate:null })], [observation("condition")], { asOf })[0].excludedFromTraining, undefined);
  assert.throws(() => evidence.annotate([sample()], [], {}), /判定時点/);
});
