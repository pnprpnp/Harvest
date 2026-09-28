"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../src/scripts/growth-model.js");
const learning = require("../src/scripts/growth-learning.js");
const generations = require("../src/scripts/growth-generation-evaluation.js");
const clone = value => JSON.parse(JSON.stringify(value));
const asOf = "2025-09-01T12:00:00+09:00";

test("archive fetch timestamps cannot substitute for missing JMA issue times",()=>{
  const input=fixtures();
  input.forecastHistory.forEach(row=>{row.fetchedAt=row.issuedAt;delete row.issuedAt;});
  const result=generations.compareFrozen(input);
  assert.equal(result.active.labelledCount,0);
  assert.equal(result.gate.accepted,false);
});
function fixtures(count = 20){
  // Synthetic frozen coefficients make the tested change explicit: at 30
  // accumulated units, the old threshold says small and the new says normal.
  const initial = engine.fit([], { asOf:"2025-01-01", weatherDaily:[], selectedMethod:"safe",
    validation:{ methods:{}, rows:{}, selection:{} } });
  const activeSnapshot = engine.exportModel(initial, { modelVersion:"same-method-old" });
  activeSnapshot.coefficients.farmTarget = 40;
  activeSnapshot.coefficients.independentCrops = 20;
  const candidateSnapshot = clone(activeSnapshot);
  candidateSnapshot.modelVersion = "same-method-new";
  candidateSnapshot.coefficients.farmTarget = 30;
  const samples = Array.from({ length:count }, (_, index) => {
    const plantingDate = engine.addDays("2025-01-01", index * 7);
    return { id:`outcome-${index}`, groupId:`harvest-${index}`, cropId:`crop-${index}`,
      plantingDate, plantingAvailableAt:plantingDate + "T09:00:00+09:00",
      date:engine.addDays(plantingDate, 29), building:3, bed:"A", palletKeys:["3-A-1"], sizeRating:"normal",
      symptoms:{ elongated:"none", uneven:"none", tipburn:"none" } };
  });
  const weatherDaily = Array.from({ length:270 }, (_, i) => ({ date:engine.addDays("2025-01-01", i),
    source:"observation", meanTemp:20, lightIndex:1, retrievedAt:"2025-08-30T12:00:00+09:00" }));
  const forecastHistory = samples.map(sample => {
    const origin = engine.addDays(sample.date, -3);
    return { issuedAt:engine.addDays(origin, -1) + "T18:00:00+09:00", capturedAt:engine.addDays(origin, -1) + "T19:00:00+09:00",
      daily:Array.from({ length:4 }, (_, index) => ({ date:engine.addDays(origin, index), meanTemp:20, lightIndex:1 })) };
  });
  return { engine, activeSnapshot, candidateSnapshot, samples, asOf, weatherDaily, forecastHistory };
}

test("different frozen coefficient generations within the same method are compared and can be proposed", () => {
  const input = fixtures(), before = JSON.stringify(input);
  const result = generations.compareFrozen(input);
  assert.equal(result.sameMethod, true);
  assert.equal(result.activeModelVersion, "same-method-old");
  assert.equal(result.candidateModelVersion, "same-method-new");
  assert.equal(result.active.accuracy, 0);
  assert.equal(result.candidate.accuracy, 1);
  assert.equal(result.gate.accepted, true);
  assert.equal(result.gate.metric, "windowConstraintLoss");
  assert.equal(result.requiresApproval, true);
  assert.equal(result.coverage.scoredSamples, 20);
  assert.equal(JSON.stringify(input), before);
});

test("today's coefficients are never replayed before either generation existed, including exact cutoff", () => {
  const input = fixtures();
  input.candidateSnapshot.trainedAsOf = "2025-06-01T12:00:00+09:00";
  const result = generations.compareFrozen(input);
  assert.ok(result.activeRows.every(row => row.asOf > "2025-06-01"));
  assert.ok(result.excluded.beforeBothGenerations > 0);
  assert.equal(result.gate.accepted, false);
  const firstOrigin = engine.addDays(input.samples[0].date, -3);
  input.candidateSnapshot.trainedAsOf = firstOrigin;
  const exact = generations.compareFrozen(input);
  assert.ok(exact.activeRows.every(row => row.asOf > firstOrigin));
  input.activeSnapshot.trainedAsOf = "2025-09-01T12:00:00+09:00";
  assert.equal(generations.compareFrozen(input).activeRows.length, 0);
});

test("missing archived forecasts cannot be replaced by live forecasts or future observations", () => {
  const input = fixtures();
  const live = input.forecastHistory.flatMap(snapshot => snapshot.daily.map(day => ({ ...day, source:"forecast",
    issuedAt:snapshot.issuedAt, capturedAt:snapshot.capturedAt })));
  const result = generations.compareFrozen({ ...input, forecastHistory:[], weatherDaily:input.weatherDaily.concat(live) });
  assert.equal(result.coverage.scoredSamples, 0);
  assert.equal(result.active.labelledCount, 0);
  assert.equal(result.candidate.readyDateCount, 0);
  assert.equal(result.gate.accepted, false);
  assert.ok(result.activeRows.every(row => row.dayCounts.unavailable > 0));
});

test("forecast archives need timely issue and capture, and never use revisions received later", () => {
  const input = fixtures(3);
  const original = generations.compareFrozen(input);
  const later = input.forecastHistory.map(snapshot => ({ ...snapshot, issuedAt:"2025-08-01T00:00:00+09:00",
    capturedAt:"2025-08-01T01:00:00+09:00", daily:snapshot.daily.map(day => ({ ...day, meanTemp:40, lightIndex:0.3 })) }));
  const repeated = generations.compareFrozen({ ...input, forecastHistory:input.forecastHistory.concat(later) });
  assert.deepEqual(repeated.activeRows, original.activeRows);
  assert.deepEqual(repeated.candidateRows, original.candidateRows);
  const missingCapture = generations.compareFrozen({ ...input, forecastHistory:input.forecastHistory.map(({ capturedAt,...snapshot }) => snapshot) });
  assert.equal(missingCapture.coverage.scoredSamples, 0);
  assert.equal(missingCapture.excluded.forecastMissingAvailability, 12);
  const lateCapture = generations.compareFrozen({ ...input, forecastHistory:input.forecastHistory.map(snapshot => ({ ...snapshot, capturedAt:"2025-08-01" })) });
  assert.equal(lateCapture.coverage.scoredSamples, 0);
});

test("planting inputs and outcome revisions reuse the engine availability rules", () => {
  const input = fixtures(4);
  input.samples[0].plantingAvailableAt = "2025-05-01T00:00:00+09:00";
  input.samples[1].availableAt = "2025-10-01T00:00:00+09:00";
  input.samples[2].availableAt = "2025-08-01T00:00:00+09:00"; // Truth can become known after origin but before final evaluation.
  const result = generations.compareFrozen(input);
  assert.equal(result.excluded.plantingUnavailableAtOrigin, 1);
  assert.equal(result.excluded.notYetAvailable, 1);
  assert.equal(result.activeRows.length, 2);
  assert.ok(result.activeRows.some(row => row.id === input.samples[2].id));
  assert.ok(result.activeRows.every(row => row.id !== input.samples[0].id && row.id !== input.samples[1].id));
});

test("frozen replay never fits and prediction inputs contain no future labels", () => {
  const input = fixtures(2);
  let predicts = 0, scores = 0;
  const guarded = { ...engine, fit(){ throw new Error("must not fit"); }, backtest(){ throw new Error("must not tune"); },
    predict(model, query){
      predicts++;
      for(const key of ["readyDate", "sizeRating", "symptoms", "date"]) assert.equal(key in query, false);
      return engine.predict(model, query);
    } };
  const result = generations.compareFrozen({ ...input, engine:guarded, score:(...args) => { scores++; return learning.score(...args); } });
  assert.equal(predicts, 4);
  assert.equal(scores, 4);
  assert.equal(result.candidate.accuracy, 1);
});

test("weak bed partials do not become position scores or additional independent evidence", () => {
  const input = fixtures(2);
  input.samples.push({ ...input.samples[0], id:"bed-copy", bed:"B", palletKeys:["3-B-1"] });
  input.samples.push({ ...input.samples[1], id:"weak", signalKind:"partial-bed", sizeRating:"large", palletKeys:[] });
  const result = generations.compareFrozen(input);
  assert.equal(result.activeRows.length, 4);
  assert.equal(result.active.independentCrops, 2);
  const weak = result.candidateRows.find(row => row.id === "weak");
  assert.equal(weak.ordinalError, null);
  assert.equal(weak.windowConstraintLoss, null);
});

test("quality snapshots are hydrated at the same origin and missing candidate coverage rejects adoption", () => {
  const input = fixtures();
  const quality = { trainedAsOf:"2025-01-01", grade:"none" };
  input.activeSnapshot.coefficients.quality = quality;
  input.candidateSnapshot.coefficients.quality = { ...quality };
  const calls = [];
  const riskEngine = {
    hydrateModel(snapshot, options){ calls.push(options); return { ...snapshot, asOf:options.asOf }; },
    predict(snapshot){ return Object.fromEntries(["elongated", "uneven", "tipburn"].map(key => [key, { severity:snapshot.grade, outOfForecast:false }])); }
  };
  const evaluated = generations.compareFrozen({ ...input, riskEngine });
  assert.equal(evaluated.active.quality.elongated.count, 20);
  assert.equal(evaluated.candidate.quality.tipburn.mae, 0);
  assert.equal(calls.length, 40);
  assert.ok(calls.every(call => call.weatherDaily.some(day => day.source === "forecast")));
  delete input.candidateSnapshot.coefficients.quality;
  const missing = generations.compareFrozen({ ...input, riskEngine });
  assert.equal(missing.gate.accepted, false);
  assert.equal(missing.gate.reason, "reducedPredictionCoverage");
  assert.equal(missing.gate.lostQualityPredictions.elongated, 20);
});

test("later quality training also moves the earliest eligible origin forward", () => {
  const input = fixtures();
  input.candidateSnapshot.coefficients.quality = { trainedAsOf:"2025-06-01" };
  const riskEngine = { hydrateModel:snapshot => snapshot, predict:() => ({}) };
  const result = generations.compareFrozen({ ...input, riskEngine });
  assert.ok(result.activeRows.every(row => row.asOf > "2025-06-01"));
  assert.equal(result.gate.accepted, false);
});

test("deterministic origin caps, forecast horizon gaps and invalid snapshots fail safely", () => {
  const input = fixtures();
  const capped = generations.compareFrozen({ ...input, maxFolds:5 });
  assert.equal(capped.coverage.evaluatedOrigins, 5);
  assert.equal(capped.foldCoverage[0].origin, engine.addDays(input.samples[0].date, -3));
  assert.equal(capped.foldCoverage.at(-1).origin, engine.addDays(input.samples.at(-1).date, -3));
  const horizon = generations.compareFrozen({ ...input,
    forecastHistory:input.forecastHistory.map(snapshot => ({ ...snapshot, daily:snapshot.daily.slice(0,3) })) });
  assert.equal(horizon.coverage.scoredSamples, 0);
  assert.equal(horizon.gate.accepted, false);
  const corrupt = clone(input.candidateSnapshot); corrupt.coefficients.window = { lower:2, upper:1 };
  const bad = generations.compareFrozen({ ...input, candidateSnapshot:corrupt });
  assert.equal(bad.gate.accepted, false);
  assert.equal(bad.gate.reason, "frozenGenerationEvaluationError");
  assert.ok(bad.errors.length > 0);
  assert.throws(() => generations.compareFrozen({ ...input, candidateSnapshot:{ ...input.candidateSnapshot, trainedAsOf:null } }), /学習完了日時/);
});

test("a frozen zero-crop initial prior may be replaced after sufficient later evidence, without relaxing the support gate", () => {
  const input = fixtures();
  input.activeSnapshot.coefficients.independentCrops = 0;
  input.activeSnapshot.coefficients.farmTarget = 30.6;
  input.candidateSnapshot.coefficients.farmTarget = 40;
  input.samples = input.samples.map(sample => ({ ...sample, date:engine.addDays(sample.date, 10) }));
  input.forecastHistory = input.forecastHistory.map(snapshot => ({
    issuedAt:engine.addDays(engine.dateKey(snapshot.issuedAt), 10) + "T18:00:00+09:00",
    capturedAt:engine.addDays(engine.dateKey(snapshot.capturedAt), 10) + "T19:00:00+09:00",
    daily:snapshot.daily.map(day => ({ ...day, date:engine.addDays(day.date, 10) }))
  }));
  const result = generations.compareFrozen(input);
  assert.ok(result.activeRows.every(row => row.trainingCrops === 0));
  assert.equal(result.active.accuracy, 0);
  assert.equal(result.candidate.accuracy, 1);
  assert.equal(result.gate.accepted, true);
  assert.equal(result.gate.requiresApproval, true);
  assert.equal(generations.compareFrozen({ ...input, samples:input.samples.slice(0,15) }).gate.accepted, false);
  assert.equal(generations.compareFrozen({ ...input, maxFolds:4 }).gate.accepted, false);
});
