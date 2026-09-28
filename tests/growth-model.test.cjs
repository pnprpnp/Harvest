"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const model = require("../src/scripts/growth-model.js");
const { addDays } = model;

test("parameter selection respects readiness priority before a larger size-only improvement",()=>{
  const parameters=model._test.PARAMETERS;
  const safe=Array.from({length:20},(_,i)=>({id:`p${i}`,groupId:`g${i}`,cropId:`c${i}`,
    asOf:addDays("2025-01-01",i*7),outcomeDate:addDays("2025-01-04",i*7),building:2,season:0,
    actual:"normal",predicted:"small",ordinalError:1,readyError:2,windowConstraintLoss:1,trainingCrops:10,confidence:"reference"}));
  const history=Object.fromEntries(parameters.map(p=>[p.id,[]]));history.safe=safe;
  history[parameters[0].id]=safe.map(row=>({...row,ordinalError:0,predicted:"normal",windowConstraintLoss:0}));
  history[parameters[1].id]=safe.map(row=>({...row,readyError:1}));
  assert.equal(model._test.pickParameter(history,"2026-01-01").id,parameters[1].id);
});

test("archived forecasts require a real issue time and capture time; retrieval cannot invent issuance",()=>{
  const daily=[{date:"2026-09-20",meanTemp:20,lightIndex:1}];
  const options={asOf:"2026-09-20T12:00:00+09:00"};
  assert.equal(model.prepareWeather([],{...options,forecastHistory:[{daily,fetchedAt:"2026-09-19T10:00:00+09:00",capturedAt:"2026-09-19T11:00:00+09:00"}]}).forecasts.size,0);
  assert.equal(model.prepareWeather([],{...options,forecastHistory:[{daily,issuedAt:"2026-09-19T10:00:00+09:00"}]}).forecasts.size,0);
  assert.equal(model.prepareWeather([],{...options,forecastHistory:[{daily,issuedAt:"2026-09-19T10:00:00+09:00",capturedAt:"2026-09-19T11:00:00+09:00"}]}).forecasts.size,1);
});

function weather(start, count, overrides = {}){
  return Array.from({ length:count }, (_, i) => ({ date:addDays(start, i),
    source:"observation", meanTemp:20, lightIndex:1, ...overrides }));
}
function samples(count, options = {}){
  return Array.from({ length:count }, (_, i) => {
    const plantingDate = addDays(options.start || "2025-01-01", i * (options.spacing || 7));
    return { id:`row-${i}`, groupId:`harvest-${i}`, cropId:`crop-${i}`, plantingDate,
      date:addDays(plantingDate, options.age || 29), building:3, bed:"A",
      sizeRating:options.sizeRating || "normal", qualityWeight:1,
      manualAdjustment:{ temperatureOffsetC:0, lightMultiplier:1 } };
  });
}
function archiveFor(input, leadDays = 3){
  return input.flatMap(row => {
    const origin = addDays(row.date, -leadDays);
    return weather(origin, leadDays + 1, { source:"forecast", issuedAt:origin + "T00:00:00+09:00",
      availableAt:origin + "T00:00:00+09:00" });
  });
}

test("Japanese calendar cutoff accepts UTC timestamps at Japanese midnight", () => {
  assert.equal(model.dateKey("2026-09-24T16:00:00Z"), "2026-09-25");
  assert.equal(model.dateKey("2026-02-30"), null);
  const context = model.prepareWeather([], { asOf:"2026-09-24T16:00:00Z", forecastHistory:[
    { date:"2026-09-25", meanTemp:20, lightIndex:1, issuedAt:"2026-09-24T15:30:00Z", availableAt:"2026-09-24T15:40:00Z" }
  ] });
  assert.equal(context.forecasts.size, 1);
});

test("weather nulls never become zero observations and real sunshine wins", () => {
  const context = model.prepareWeather([
    { date:"2025-01-01", meanTemp:20, lightIndex:null, source:"observation" },
    { date:"2025-01-02", meanTemp:null, lightIndex:1, source:"observation" },
    { date:"2025-01-03", meanTemp:20, lightIndex:0.4, sunshineHours:8, source:"observation" },
    { date:"2025-01-04", meanTemp:20, lightIndex:1, source:"forecast", issuedAt:"2025-01-04", estimatedLight:true }
  ], { asOf:"2025-01-04T12:00:00+09:00" });
  assert.equal(context.getDay("2025-01-03").lightIndex, 1);
  const result = model._test.accumulate(context, "2025-01-01", "2025-01-04", {});
  assert.equal(result.dayCounts.observed, 1);
  assert.equal(result.dayCounts.estimated, 2);
  assert.equal(result.dayCounts.unavailable, 1);
  assert.equal(result.complete, false);
  assert.equal(result.dayCounts.forecast, 0);
  assert.ok(result.total > 0);
});

test("blank strings and arrays cannot masquerade as measured weather", () => {
  const context = model.prepareWeather([
    { date:"2025-01-01", meanTemp:" ", lightIndex:1, source:"observation" },
    { date:"2025-01-02", meanTemp:20, lightIndex:"\t", source:"observation" },
    { date:"2025-01-03", meanTemp:[], lightIndex:1, source:"observation" }
  ], { asOf:"2025-01-04" });
  const result = model._test.accumulate(context, "2025-01-01", "2025-01-03", {});
  assert.equal(result.dayCounts.observed, 0);
  assert.equal(result.dayCounts.estimated, 3);
  assert.equal(result.coverage, 0);
});

test("future observations cannot affect climatology or historical predictions", () => {
  const before = weather("2025-01-01", 20);
  const poisoned = before.concat(weather("2025-01-21", 200, { meanTemp:45, lightIndex:0.3 }));
  const first = model.prepareWeather(before, { asOf:"2025-01-21" });
  const second = model.prepareWeather(poisoned, { asOf:"2025-01-21" });
  assert.deepEqual(first.getDay("2025-01-23"), second.getDay("2025-01-23"));
  assert.equal(second.observations.size, 20);
});

test("re-downloaded historical observations remain usable but publication times are respected", () => {
  const context = model.prepareWeather([
    { date:"2025-01-01", source:"observation", meanTemp:20, lightIndex:1, retrievedAt:"2026-01-01T00:00:00Z" },
    { date:"2025-01-02", source:"observation", meanTemp:20, lightIndex:1, capturedAt:"2026-01-01T00:00:00Z" },
    { date:"2025-01-03", source:"observation", meanTemp:20, lightIndex:1, availableAt:"2025-02-01T00:00:00Z" },
    { date:"2025-01-04", source:"observation", meanTemp:20, lightIndex:1, observedAt:"2025-02-01T00:00:00Z" },
    { date:"2025-01-10", source:"observation", meanTemp:20, lightIndex:1, retrievedAt:"2026-01-01T00:00:00Z" }
  ], { asOf:"2025-01-10" });
  assert.equal(context.observations.size, 2);
  assert.ok(context.observations.has("2025-01-01"));
  assert.ok(context.observations.has("2025-01-02"));
  assert.ok(!context.observations.has("2025-01-03"));
  assert.ok(!context.observations.has("2025-01-04"));
  assert.ok(!context.observations.has("2025-01-10"));
  const input = samples(5);
  const original = weather("2025-01-01", 100);
  const retrieved = original.map(day => ({ ...day, retrievedAt:"2026-01-01T00:00:00Z" }));
  const first = model.backtest(input, { asOf:"2025-05-01", weatherDaily:original });
  const second = model.backtest(input, { asOf:"2025-05-01", weatherDaily:retrieved });
  assert.deepEqual(first.methods, second.methods);
  assert.ok(second.limitations.some(text => text.includes("現行保存版")));
});

test("archived forecasts require issue and availability before origin", () => {
  const context = model.prepareWeather([], { asOf:"2025-06-01T12:00:00+09:00", forecastHistory:[
    { date:"2025-06-03", meanTemp:16, lightIndex:0.7, issuedAt:"2025-06-01T06:00:00+09:00", capturedAt:"2025-06-01T07:00:00+09:00" },
    { date:"2025-06-03", meanTemp:35, lightIndex:1, issuedAt:"2025-06-01T09:00:00+09:00", capturedAt:"2025-06-02T07:00:00+09:00" },
    { date:"2025-06-03", meanTemp:40, lightIndex:1, issuedAt:"2025-06-02T06:00:00+09:00" },
    { date:"2025-06-04", meanTemp:20, lightIndex:1 },
    { issuedAt:"2025-06-01T06:00:00+09:00", capturedAt:"2025-06-01T07:00:00+09:00", daily:[{ date:"2025-06-05", meanTemp:17, lightIndex:0.7 }] }
  ] });
  assert.equal(context.getDay("2025-06-03").meanTemp, 16);
  assert.equal(context.forecasts.has("2025-06-04"), false);
  assert.equal(context.forecasts.get("2025-06-05").meanTemp, 17);
});

test("empty data stays a reference and never claims an observed ready date", () => {
  const fit = model.fit([], { asOf:"2025-02-01", weatherDaily:[] });
  const prediction = model.predict(fit, { plantingDate:"2025-01-10", targetDate:"2025-02-15", building:3, bed:"A" });
  assert.equal(fit.selectedMethod, "legacy");
  assert.equal(prediction.confidence.level, "insufficient");
  assert.equal(prediction.readyDate, null);
  assert.equal(prediction.interval, null);
  assert.equal(prediction.dayCounts.estimated + prediction.dayCounts.unavailable, prediction.dayCounts.total);
  assert.equal(prediction.outOfForecast, true);
  assert.equal(model.summarize(fit).independentCrops, 0);
  assert.throws(() => model.predict(fit, { asOf:"2025-01-01", plantingDate:"2024-12-01", targetDate:"2025-01-02" }), /Refit/);
});

test("same-day rewind cannot reuse a later forecast context", () => {
  const fit = model.fit([], { asOf:"2025-01-03T15:00:00+09:00", weatherDaily:[
    { date:"2025-01-03", meanTemp:20, lightIndex:1, source:"forecast", issuedAt:"2025-01-03T14:00:00+09:00" }
  ] });
  assert.throws(() => model.predict(fit, {
    asOf:"2025-01-03T10:00:00+09:00", plantingDate:"2025-01-01", targetDate:"2025-01-03"
  }), /earlier asOf time/);
});

test("forecast horizon and forecast age lower information weight and confidence", () => {
  const asOf = "2025-06-01T12:00:00+09:00";
  const daily = weather("2025-01-01", 151);
  const forecast = issuedAt => Array.from({ length:7 }, (_, i) => ({
    date:addDays("2025-06-01", i), meanTemp:20, lightIndex:1, source:"forecast", reliability:"A", issuedAt
  }));
  const input = samples(22).map(row => ({ ...row, readyDate:addDays(row.plantingDate, 25) }));
  const fresh = model.fit(input, { asOf, forecastHistory:archiveFor(input), weatherDaily:daily.concat(forecast("2025-06-01T06:00:00+09:00")) });
  const stale = model.fit(input, { asOf, weatherDaily:daily.concat(forecast("2025-05-27T06:00:00+09:00")), validation:fresh.validation });
  const query = { plantingDate:"2025-05-15", targetDate:"2025-06-07", building:3, bed:"A" };
  const freshPrediction = model.predict(fresh, query), stalePrediction = model.predict(stale, query);
  assert.ok(freshPrediction.weatherReliability > stalePrediction.weatherReliability);
  assert.ok(freshPrediction.weatherReliability < 1);
  assert.equal(freshPrediction.confidence.level, "moderate");
  assert.equal(stalePrediction.confidence.level, "reference");
  assert.ok(stalePrediction.forecastAgeDays > 5);
  const short = model._test.accumulate(fresh.weatherContext, "2025-06-01", "2025-06-01", {});
  const far = model._test.accumulate(fresh.weatherContext, "2025-06-07", "2025-06-07", {});
  assert.ok(short.weatherReliability > far.weatherReliability);
});

test("safe ordinal constraints correct legacy small/large boundary inconsistency", () => {
  const daily = weather("2025-01-01", 400);
  const context = model.prepareWeather(daily, { asOf:"2026-02-01" });
  ["small", "large"].forEach(sizeRating => {
    const input = samples(12, { age:19, sizeRating });
    const normalized = model.normalizeSamples(input, "2026-02-01").samples;
    const safe = model._test.buildCandidate(normalized, context, "safe");
    const legacy = model._test.buildCandidate(normalized, context, "legacy");
    const predictionInput = { plantingDate:"2025-05-01", targetDate:"2025-05-20", building:3, bed:"A" };
    assert.equal(model._test.predictCandidate(safe, context, predictionInput).status, sizeRating);
    assert.equal(model._test.predictCandidate(legacy, context, predictionInput).status, "normal");
    assert.equal(safe.byBuilding.get(3).learned, false);
    assert.equal(safe.byBed.get("3-A").learned, false);
  });
});

test("legacy comparator ignores optional actual ready dates", () => {
  const input = samples(3).map(row => ({ ...row, readyDate:addDays(row.plantingDate, 19) }));
  const context = model.prepareWeather(weather("2025-01-01", 200), { asOf:"2025-10-01" });
  const normalized = model.normalizeSamples(input, "2025-10-01").samples;
  assert.equal(model._test.targetFor(model._test.buildCandidate(normalized, context, "legacy"), 3, "A"), 30);
  const safe = model._test.buildCandidate(normalized, context, "safe");
  assert.equal(model._test.targetFor(safe, 3, "A") * safe.window.lower, 20);
});

test("bad ages, estimated plantings and late edits cannot train; bed partial stays weak", () => {
  const base = samples(1)[0];
  const normalized = model.normalizeSamples([
    base,
    { ...base, id:"too-old", date:"2026-01-01" },
    { ...base, id:"estimated", estimatedPlanting:true },
    { ...base, id:"partial", type:"partialHarvest" },
    { ...base, id:"late-edit", availableAt:"2025-07-01T00:00:00Z" }
  ], "2025-06-01");
  assert.equal(normalized.samples.length, 2);
  assert.equal(normalized.samples.find(row => row.id === "partial").signalKind, "partial-bed");
  assert.deepEqual(normalized.excluded, { implausibleAge:1, estimatedPlanting:1, notYetAvailable:1 });
});

test("long healthy crops remain supported beyond 35 days", () => {
  const input = samples(8, { age:59 });
  const fit = model.fit(input, { asOf:"2025-08-01", weatherDaily:weather("2025-01-01", 300), maxFolds:5 });
  const prediction = model.predict(fit, { plantingDate:"2025-06-01", targetDate:"2025-07-30", building:3, bed:"A" });
  assert.equal(prediction.status, "normal");
  assert.ok(prediction.readyStart <= "2025-07-30");
  assert.ok(prediction.readyEnd === null || prediction.readyEnd >= "2025-07-30");
  assert.equal(prediction.readyDate, prediction.readyStart);
  assert.ok(model.daysBetween("2025-06-01", prediction.readyStart) > 35);
  assert.equal(prediction.dayCounts.total, 60);
});

test("walk-forward parameter selection and training exclude future outcomes", () => {
  const input = samples(34, { spacing:10 });
  const options = { asOf:"2026-03-01", weatherDaily:weather("2025-01-01", 440), forecastHistory:archiveFor(input), maxFolds:40 };
  const first = model.backtest(input, options);
  const changed = input.map(row => row.date >= "2025-08-01" ? { ...row, sizeRating:"large", readyDate:addDays(row.plantingDate, 7) } : row);
  const second = model.backtest(changed, options);
  for(const method of ["legacy", "safe", "calendar", "adaptive"]){
    assert.deepEqual(first.rows[method].filter(row => row.asOf < "2025-08-01"), second.rows[method].filter(row => row.asOf < "2025-08-01"));
  }
  assert.equal(first.methods.safe.readyDateCount, 0);
  assert.equal(first.methods.safe.normalHarvestProxyCount, 0);
  assert.ok(first.methods.safe.windowConstraintCount > 0);
  assert.equal(first.selection.requiresApproval, true);
});

test("multiple bed labels remain visible without multiplying independent evidence", () => {
  const first = samples(1)[0];
  const input = [first, { ...first, id:"other-bed", bed:"B", sizeRating:"large" }];
  const result = model.backtest(input, { asOf:"2025-06-01", weatherDaily:weather("2025-01-01", 160) });
  assert.equal(result.rows.safe.length, 2);
  assert.equal(result.methods.safe.independentCrops, 1);
  assert.equal(result.selection.selectedMethod, "legacy");
  const repeated = Array.from({ length:40 }, (_, i) => ({
    id:`test${i}`, cropId:"same-crop", groupId:`different-harvest${i}`,
    asOf:addDays("2025-01-01", i * 7), outcomeDate:addDays("2025-01-01", i * 7 + 7),
    actual:"normal", predicted:"normal", ordinalError:0, readyError:null, normalHarvestProxyError:0, intervalHit:null
  }));
  const baseline = repeated.map(row => ({ ...row, ordinalError:1 }));
  assert.equal(model._test.compareGate(repeated, baseline).accepted, false);
});

test("only actual ready dates are point truth; normal harvests supply window constraints", () => {
  const input = samples(20).map((row, i) => i % 2 ? { ...row, readyDate:addDays(row.plantingDate, 27) } : row);
  const result = model.backtest(input, { asOf:"2025-09-01", weatherDaily:weather("2025-01-01", 300), forecastHistory:archiveFor(input) });
  assert.ok(result.methods.safe.readyDateCount > 0);
  assert.equal(result.methods.safe.normalHarvestProxyCount, 0);
  assert.ok(result.methods.safe.readyDateCount < result.methods.safe.windowConstraintCount);
  assert.ok(Number.isFinite(result.methods.safe.readyDateMAE));
});

test("200 crop evaluation remains bounded and JSON journal summary excludes weather", () => {
  const input = samples(200, { spacing:2 });
  const started = performance.now();
  const fit = model.fit(input, { asOf:"2026-05-01", weatherDaily:weather("2025-01-01", 490) });
  const elapsed = performance.now() - started;
  assert.ok(fit.validation.methods.safe.folds <= 24);
  assert.ok(elapsed < 15000, `200 crop evaluation exceeded 15 s: ${elapsed} ms`);
  const summary = JSON.stringify(model.summarize(fit));
  assert.ok(summary.length < 20000);
  assert.ok(!summary.includes("weatherContext"));
  console.log(`growth-model performance: 200 crops, ${fit.validation.methods.safe.folds} folds, ${Math.round(elapsed)} ms`);
});

test("future repeated cohorts cannot reweight earlier training folds", () => {
  const input = samples(18, { spacing:10 });
  const options = { asOf:"2025-12-01", weatherDaily:weather("2025-01-01", 360), maxFolds:40 };
  const original = model.backtest(input, options);
  const extra = { ...input[0], id:"later-same-crop", plantingDate:"2025-05-01", date:"2025-09-01", sizeRating:"large" };
  const changed = model.backtest(input.concat(extra), options);
  assert.deepEqual(original.rows.safe.filter(row => row.asOf < "2025-08-01"), changed.rows.safe.filter(row => row.asOf < "2025-08-01"));
});

test("actual ready dates alone can validate a candidate without size labels", () => {
  const candidate = Array.from({ length:20 }, (_, i) => ({
    id:`date${i}`, cropId:`crop${i}`, groupId:`harvest${i}`, asOf:addDays("2025-01-01", i * 7),
    outcomeDate:addDays("2025-01-01", i * 7 + 7), actual:"unknown", predicted:"normal",
    ordinalError:null, readyError:1, normalHarvestProxyError:null, intervalHit:null
  }));
  const baseline = candidate.map(row => ({ ...row, readyError:4 }));
  const gate = model._test.compareGate(candidate, baseline);
  assert.equal(gate.accepted, true);
  assert.equal(gate.metric, "actualReadyDateMAE");
  assert.equal(gate.readyDateImprovementDays, 3);
});

test("late-entered outcomes cannot select historical parameters or calibrate confidence", () => {
  const candidate = Array.from({ length:20 }, (_, i) => ({
    id:`late${i}`, cropId:`crop${i}`, groupId:`harvest${i}`, asOf:addDays("2025-01-01", i * 7),
    outcomeDate:addDays("2025-01-01", i * 7 + 7), actual:"normal", predicted:"normal",
    ordinalError:0, readyError:0, normalHarvestProxyError:0, intervalHit:1,
    availableAt:Date.parse("2025-12-01T09:00:00+09:00")
  }));
  const baseline = candidate.map(row => ({ ...row, ordinalError:1, readyError:4 }));
  const history = { safe:baseline, weather:candidate };
  assert.equal(model._test.pickParameter(history, "2025-11-01"), null);
  assert.equal(model._test.pickParameter(history, "2025-12-02").id, "weather");
  assert.equal(model._test.evaluationAvailableBefore(candidate[0], "2025-11-01"), false);
  assert.equal(model._test.evaluationAvailableBefore(candidate[0], "2025-12-02"), true);
  const fit = model.fit(samples(20), { asOf:"2025-08-01", weatherDaily:weather("2025-01-01", 250) });
  // Simulate an externally supplied validation ledger; future available outcomes
  // must not inflate live confidence or create an interval even then.
  fit.validation.rows.safe = candidate;
  const prediction = model.predict(fit, { plantingDate:"2025-07-01", targetDate:"2025-08-05", building:3, bed:"A" });
  assert.equal(prediction.confidence.validationCount, 0);
  assert.equal(prediction.interval, null);
});

test("planting dates entered or changed after forecast origin cannot be test inputs", () => {
  const input = samples(3).map((sample, index) => ({ ...sample,
    plantingAvailableAt:index === 0 ? "2025-02-15T09:00:00+09:00" : sample.plantingDate + "T09:00:00+09:00"
  }));
  const result = model.backtest(input, { asOf:"2025-05-01", weatherDaily:weather("2025-01-01", 130) });
  assert.equal(result.rows.safe.length, 2);
  assert.ok(result.rows.safe.every(row => row.id !== input[0].id));
  assert.equal(result.excluded.plantingUnavailableAtOrigin, 1);
  const unavailableNow = model.normalizeSamples([{ ...input[1], plantingAvailableAt:"2025-06-01T00:00:00Z" }], "2025-05-01");
  assert.equal(unavailableNow.samples.length, 0);
  assert.equal(unavailableNow.excluded.plantingNotYetAvailable, 1);
  // Legacy timestamps are absent rather than invented; the reconstruction limit
  // stays explicit and does not prevent use of all existing farm records.
  const legacy = model.backtest(samples(1), { asOf:"2025-05-01", weatherDaily:weather("2025-01-01", 130) });
  assert.equal(legacy.rows.safe.length, 1);
});

test("worker source evaluates with no browser app, require or network dependency", () => {
  let reply;
  const context = vm.createContext({ self:{ postMessage:value => { reply = value; } } });
  vm.runInContext(model.getBacktestWorkerSource(), context);
  context.self.onmessage({ data:{ id:"check", samples:[], options:{ asOf:"2025-01-01", weatherDaily:[] } } });
  assert.equal(reply.id, "check");
  assert.equal(reply.result.selection.selectedMethod, "legacy");
  assert.equal(reply.result.methods.safe.predictions, 0);
  context.self.onmessage({ data:{ id:"error", samples:[], options:{} } });
  assert.match(reply.error, /asOf/);
});

function validatedSelectionRows(){
  return Array.from({ length:20 }, (_, i) => ({
    id:`selection${i}`, groupId:`harvest${i}`, cropId:`crop${i}`, trainingCrops:8 + i,
    asOf:addDays("2025-01-01", i * 7), outcomeDate:addDays("2025-01-01", i * 7 + 7),
    actual:"normal", predicted:"small", ordinalError:1, readyError:null,
    normalHarvestProxyError:null, windowConstraintLoss:2, intervalHit:null
  }));
}

test("legacy target can be selected only after beating safe on matching chronological cases", () => {
  const safe = validatedSelectionRows();
  const legacy = safe.map(row => ({ ...row, predicted:"normal", ordinalError:0, windowConstraintLoss:0 }));
  const selection = model._test.selectValidatedMethod({ safe, legacy, calendar:safe, adaptive:safe });
  assert.equal(selection.selectedMethod, "legacy");
  assert.equal(selection.reason, "chronologicalLegacyImprovement");
  assert.equal(selection.gates.legacy.accepted, true);
  assert.equal(model._test.selectValidatedMethod({ safe:safe.slice(0, 5), legacy:legacy.slice(0, 5) }).selectedMethod, "safe");
  // A common zero-history fold is reported, but must not permanently prevent
  // legacy adoption just because the old model had no initial target.
  const cold = { ...safe[0], id:"cold", groupId:"cold", cropId:"cold", trainingCrops:0, asOf:"2024-12-01" };
  const withCold = model._test.selectValidatedMethod({
    safe:[cold, ...safe], legacy:[{ ...cold, ordinalError:null }, ...legacy], calendar:safe, adaptive:safe
  });
  assert.equal(withCold.selectedMethod, "legacy");
});

test("every alternative is rejected if better errors hide reduced prediction coverage", () => {
  const safe = validatedSelectionRows();
  const candidate = safe.map((row, index) => ({ ...row, ordinalError:index === 0 ? null : 0 }));
  const selection = model._test.selectValidatedMethod({ safe, legacy:candidate, calendar:candidate, adaptive:candidate });
  assert.equal(selection.selectedMethod, "safe");
  for(const name of ["legacy", "calendar", "adaptive"]){
    assert.equal(selection.gates[name].reason, "reducedPredictionCoverage");
    assert.equal(selection.gates[name].lostClassifications, 1);
  }
  const dated = safe.map(row => ({ ...row, readyError:3 }));
  assert.equal(model._test.compareGate(candidate.map(row => ({ ...row, ordinalError:0, readyError:null })), dated).reason, "reducedPredictionCoverage");
});

test("unusable learned candidates fall back to safe; empty legacy remains a reference baseline", () => {
  const validation = model.backtest([], { asOf:"2025-06-01", weatherDaily:[] });
  ["calendar", "adaptive"].forEach(method => {
    const fit = model.fit([], { asOf:"2025-06-01", weatherDaily:[], selectedMethod:method, validation:{ ...validation,
      selection:{ ...validation.selection, selectedMethod:method } } });
    assert.equal(fit.selectedMethod, "safe");
    assert.equal(fit.selectionFallback.from, method);
    assert.equal(model.summarize(fit).selectionFallback.reason, "currentCandidateUnavailable");
  });
  const initial = model.fit([], { asOf:"2025-06-01", weatherDaily:[], selectedMethod:"legacy", validation });
  assert.equal(initial.selectedMethod, "legacy");
  assert.equal(initial.selectionFallback, null);
  assert.ok(model._test.targetFor(initial.candidate, 3, "A") > 0);
});

test("forecast last day is usable, next day is unavailable, stored forecast extension resolves the window", () => {
  const observed = weather("2025-01-01", 9);
  const saved = count => weather("2025-01-10", count, { source:"forecast", issuedAt:"2025-01-09T18:00:00+09:00" });
  const short = model.prepareWeather(observed.concat(saved(1)), { asOf:"2025-01-10" });
  const candidate = model._test.buildCandidate([], short, "safe");
  candidate.farmTarget = 10;
  candidate.window = { lower:0.9, upper:1.1, learned:false, reference:true };
  const query = { plantingDate:"2025-01-01", building:3, bed:"A", targetDate:"2025-01-10" };
  const last = model._test.predictCandidate(candidate, short, query);
  assert.equal(last.status, "normal");
  assert.equal(last.readyStart, "2025-01-09");
  assert.equal(last.readyEnd, null);
  assert.equal(last.windowTruncated, true);
  const outside = model._test.predictCandidate(candidate, short, { ...query, targetDate:"2025-01-11" });
  assert.equal(outside.status, "unknown");
  assert.equal(outside.ratio, null);
  assert.equal(outside.outOfForecast, true);
  assert.equal(outside.dayCounts.unavailable, 1);
  assert.equal(short.getDay("2025-01-11"), null);
  const extended = model.prepareWeather(observed.concat(saved(3)), { asOf:"2025-01-10" });
  const updated = model._test.predictCandidate(candidate, extended, { ...query, targetDate:"2025-01-12" });
  assert.equal(updated.status, "large");
  assert.equal(updated.readyStart, "2025-01-09");
  assert.equal(updated.readyEnd, "2025-01-11");
  assert.equal(updated.windowTruncated, false);
  // Offline is the same pure calculation over stored issued forecasts. Merely
  // advancing the day never grants permission to fabricate future weather.
  const offline = model.prepareWeather(observed.concat(saved(1)), { asOf:"2025-01-11" });
  assert.equal(offline.getDay("2025-01-11"), null);
  assert.equal(model._test.predictCandidate(candidate, offline, { ...query, targetDate:"2025-01-11" }).status, "unknown");
});

test("actual-ready error interval is distinct from an agronomic ready window", () => {
  const context = model.prepareWeather(weather("2025-01-01", 9).concat(weather("2025-01-10", 7,
    { source:"forecast", issuedAt:"2025-01-09T18:00:00+09:00" })), { asOf:"2025-01-10" });
  const candidate = model._test.buildCandidate([], context, "safe");
  candidate.farmTarget = 14;
  const residuals = samples(8).map((row, i) => ({ ...row, readyError:i % 2 ? 3 : -2 }));
  const prediction = model._test.predictCandidate(candidate, context,
    { plantingDate:"2025-01-01", targetDate:"2025-01-16", building:3, bed:"A" }, residuals);
  assert.equal(prediction.readyDate, prediction.readyStart);
  assert.ok(prediction.readyEnd >= prediction.readyStart);
  assert.equal(prediction.readyWindow.reference, true);
  assert.equal(prediction.interval.kind, "actual-ready-error");
  assert.notEqual(prediction.interval.start, prediction.readyStart);
  assert.equal(prediction.interval.calibrationCount, 8);
  const uncertain = model._test.predictCandidate(candidate, context,
    { plantingDate:"2025-01-01", targetDate:"2025-01-16", building:3, bed:"A" }, residuals.map(row => ({ ...row, readyError:10 })));
  assert.equal(uncertain.interval.end, "2025-01-16");
  assert.equal(uncertain.interval.truncated, true);
  assert.equal(uncertain.interval.nominalCoverage, null);
});

test("normal harvest provides a range; sparse labels cannot learn the width or a position effect", () => {
  const context = model.prepareWeather(weather("2025-01-01", 200), { asOf:"2025-08-01" });
  const normalized = model.normalizeSamples(samples(5), "2025-08-01").samples;
  const candidate = model._test.buildCandidate(normalized, context, "adaptive");
  assert.equal(candidate.anchorCount, 0);
  assert.equal(candidate.window.learned, false);
  for(const row of candidate.rows){
    assert.ok(row.units >= candidate.farmTarget * candidate.window.lower);
    assert.ok(row.units <= candidate.farmTarget * candidate.window.upper);
  }
  const output = model._test.predictCandidate(candidate, context,
    { plantingDate:"2025-06-01", targetDate:"2025-06-30", building:3, bed:"A", positionKey:"3-A-1" });
  assert.equal(output.positionFallback, true);
});

test("supported window candidates learn an end boundary without moving large observations onto normal", () => {
  const input = samples(24, { spacing:10 }).map((row, index) => {
    const sizeRating = ["small", "normal", "large"][index % 3];
    return { ...row, sizeRating, date:addDays(row.plantingDate, { small:25, normal:29, large:33 }[sizeRating]),
      readyDate:sizeRating === "normal" ? addDays(row.plantingDate, 27) : null };
  });
  const context = model.prepareWeather(weather("2025-01-01", 400), { asOf:"2026-03-01" });
  const candidate = model._test.buildCandidate(model.normalizeSamples(input, "2026-03-01").samples, context, "adaptive");
  assert.equal(candidate.window.learned, true);
  assert.ok(candidate.window.upper < 1.12);
  assert.ok(candidate.window.lower < candidate.window.upper);
  assert.equal(model._test.predictCandidate(candidate, context,
    { plantingDate:"2025-01-01", targetDate:"2025-02-03", building:3, bed:"A" }).status, "large");
  assert.ok(Math.abs(candidate.farmTarget * candidate.window.lower - 28) < 1e-9);
  // This is an offline candidate; fitting without an approved choice still uses legacy.
  const fitted = model.fit(input, { asOf:"2026-03-01", weatherDaily:weather("2025-01-01", 400), validation:{ rows:{}, methods:{}, selection:{} } });
  assert.equal(fitted.selectedMethod, "legacy");
});

test("partial position is strong large; bed partial preserves existence without inventing a pallet or metric", () => {
  const normal = samples(8);
  const sample = normal[0];
  const partials = [
    { ...sample, id:"strong", groupId:"partial-strong", cropId:"strong", signalKind:"partial-position", palletKeys:["3-A-1"], sizeRating:"small" },
    { ...sample, id:"weak", groupId:"partial-weak", cropId:"weak", signalKind:"partial-bed", palletKeys:["3-A-2"], sizeRating:"small" },
    { ...sample, id:"invalid", signalKind:"partial-position", palletKeys:[] }
  ];
  const normalized = model.normalizeSamples(normal.concat(partials), "2025-06-01");
  assert.equal(normalized.excluded.partialPositionMissing, 1);
  const strong = normalized.samples.find(row => row.id === "strong"), weak = normalized.samples.find(row => row.id === "weak");
  assert.equal(strong.sizeRating, "large");
  assert.deepEqual(strong.palletKeys, ["3-A-1"]);
  assert.equal(weak.sizeRating, "large");
  assert.deepEqual(weak.palletKeys, []);
  assert.ok(weak.weight < strong.weight);
  const context = model.prepareWeather(weather("2025-01-01", 200), { asOf:"2025-08-01" });
  const candidate = model._test.buildCandidate(normalized.samples, context, "adaptive");
  assert.ok(candidate.rows.some(row => row.id === "strong"));
  assert.ok(!candidate.rows.some(row => row.id === "weak"));
  assert.equal(candidate.weakEvidence.length, 1);
  assert.equal(candidate.weakEvidence[0].positionKnown, false);
  const evaluation = model.backtest(normal.concat(partials), { asOf:"2025-06-01", weatherDaily:weather("2025-01-01", 160), forecastHistory:archiveFor(normal.concat(partials)) });
  const weakScore = evaluation.rows.safe.find(row => row.id === "weak");
  assert.equal(weakScore.ordinalError, null);
  assert.equal(weakScore.windowConstraintLoss, null);
});

test("model proposal never replaces legacy without an explicit method or an approved coefficient snapshot", () => {
  const input = samples(8), weatherDaily = weather("2025-01-01", 200);
  const validation = { methods:{}, rows:{}, selectedParameter:null, selection:{ selectedMethod:"adaptive", candidateMethod:"adaptive", requiresApproval:true } };
  const original = model.fit(input, { asOf:"2025-08-01", weatherDaily, validation });
  assert.equal(original.selectedMethod, "legacy");
  const chosen = model.fit(input, { asOf:"2025-08-01", weatherDaily, validation, selectedMethod:"safe" });
  assert.equal(chosen.selectedMethod, "safe");
  const snapshot = model.exportModel(chosen);
  const adopted = model.fit([], { asOf:"2025-08-01", weatherDaily, approvedModel:snapshot });
  assert.equal(adopted.selectedMethod, "safe");
  assert.equal(adopted.restored, true);
});

test("JSON coefficient snapshots reproduce every method and weather refresh never retrains", () => {
  const input = samples(12).map(row => ({ ...row, readyDate:addDays(row.plantingDate, 25) }));
  const options = { asOf:"2025-06-01T12:00:00+09:00", weatherDaily:weather("2025-01-01", 151).concat(weather("2025-06-01", 7,
    { source:"forecast", issuedAt:"2025-06-01T06:00:00+09:00" })), validation:{ methods:{}, rows:{}, selection:{} } };
  const query = { plantingDate:"2025-05-05", targetDate:"2025-06-03", building:3, bed:"A" };
  for(const method of ["legacy", "safe", "calendar", "adaptive"]){
    const original = model.fit(input, { ...options, selectedMethod:method });
    const snapshot = JSON.parse(JSON.stringify(model.exportModel(original)));
    assert.ok(!JSON.stringify(snapshot).includes("weatherDaily"));
    assert.ok(!JSON.stringify(snapshot).includes("plantingDate"));
    const restored = model.hydrateModel(snapshot, options);
    const before = model.predict(original, query), after = model.predict(restored, query);
    for(const key of ["status", "ratio", "progress", "readyStart", "readyEnd", "readyWindow", "dayCounts", "basis"])
      assert.deepEqual(after[key], before[key], `${method}:${key}`);
    const refreshed = model.hydrateModel(snapshot, { ...options, asOf:"2025-06-02T12:00:00+09:00" });
    assert.deepEqual(model.exportModel(refreshed).coefficients, snapshot.coefficients);
    assert.deepEqual(model.summarize(restored).legacyBuildingTargets, model.summarize(original).legacyBuildingTargets);
    assert.throws(() => model.hydrateModel(snapshot, { ...options, asOf:"2025-06-01T10:00:00+09:00" }), /前/);
    assert.throws(() => model.hydrateModel({ ...snapshot, coefficients:{ ...snapshot.coefficients, window:{ lower:2, upper:1 } } }, options), /境界/);
  }
});

test("dated environmental conditions affect only their valid days and exclusions respect knowledge time", () => {
  const daily = weather("2025-01-01", 90, { meanTemp:17 });
  const regimes = [{ startDate:"2025-01-10", endDate:"2025-01-19", temperatureOffsetC:1, lightMultiplier:1,
    availableAt:"2025-01-05T00:00:00+09:00" }];
  const context = model.prepareWeather(daily, { asOf:"2025-03-01" });
  const corrected = model._test.accumulate(context, "2025-01-01", "2025-01-30", {}, undefined, regimes);
  assert.ok(Math.abs(corrected.total - (20 * 12 / 13 + 10)) < 1e-9);
  const unavailable = model._test.accumulate(context, "2025-01-01", "2025-01-30", {}, undefined,
    [{ ...regimes[0], availableAt:"2025-04-01" }]);
  assert.ok(Math.abs(unavailable.total - 30 * 12 / 13) < 1e-9);
  const row = { ...samples(1)[0], excludedFromTraining:true, exclusionAvailableAt:"2025-03-15T12:00:00+09:00" };
  const normalized = model.normalizeSamples([row], "2025-04-01").samples;
  assert.equal(model._test.buildCandidate(normalized, context, "safe").rows.length, 1);
  const later = model.prepareWeather(daily, { asOf:"2025-04-01" });
  assert.equal(model._test.buildCandidate(normalized, later, "safe").rows.length, 0);
});

test("shadow comparisons reject readiness, quality and recent-period deterioration before size gains", () => {
  const active = validatedSelectionRows().map(row => ({ ...row, readyError:2, windowConstraintLoss:2, building:3, season:1 }));
  const improvedSize = active.map(row => ({ ...row, readyError:2.1, ordinalError:0 }));
  assert.equal(model.comparePredictions(improvedSize, active).reason, "readyDateRegression");
  const qualityBad = active.map(row => ({ ...row, readyError:1, qualityErrors:{ elongated:1 } }));
  assert.equal(model.comparePredictions(qualityBad, active.map(row => ({ ...row, qualityErrors:{ elongated:0 } }))).reason, "qualityRegression");
  const dates = active.map((row, i) => ({ ...row, asOf:addDays("2025-01-01", i * 20), outcomeDate:addDays("2025-01-08", i * 20), readyError:4 }));
  const unstable = dates.map((row, i) => ({ ...row, readyError:i < 15 ? 0 : 5 }));
  assert.equal(model.comparePredictions(unstable, dates).reason, "subgroupRegression");
  const better = active.map(row => ({ ...row, readyError:1 }));
  assert.equal(model.comparePredictions(better, active).accepted, true);
  assert.equal(model.comparePredictions(better, active).requiresApproval, true);
  assert.equal(model.comparePredictions(better.map(row => ({ ...row, availableAt:"2026-01-01" })), active,
    { asOf:"2025-12-01" }).accepted, false);
});

test("retrospective weather diagnosis freezes the original cutoff, coefficients and forecast horizon", () => {
  const asOf = "2025-06-01T12:00:00+09:00";
  const weatherDaily = weather("2025-01-01", 151).concat(weather("2025-06-01", 3,
    { source:"forecast", meanTemp:10, issuedAt:"2025-06-01T06:00:00+09:00" }));
  const fitted = model.fit(samples(10), { asOf, weatherDaily, validation:{ methods:{}, rows:{}, selection:{} } });
  const snapshot = model.exportModel(fitted);
  const input = { plantingDate:"2025-05-10", targetDate:"2025-06-03", building:3, bed:"A" };
  const before = model.predict(fitted, input);
  const diagnosed = model.diagnoseWeather(snapshot, { asOf, weatherDaily, input,
    analysisAsOf:"2025-06-05", observedDaily:weather("2025-06-01", 6) });
  assert.equal(diagnosed.productionEligible, false);
  assert.equal(diagnosed.original.ratio, before.ratio);
  assert.ok(diagnosed.counterfactual.ratio > diagnosed.original.ratio);
  assert.deepEqual(diagnosed.substitutedDays, ["2025-06-01", "2025-06-02", "2025-06-03"]);
  assert.equal(diagnosed.forecastEndDate, "2025-06-03");
  assert.equal(model.predict(fitted, input).ratio, before.ratio);
  const outside = model.diagnoseWeather(snapshot, { asOf, weatherDaily, input:{ ...input, targetDate:"2025-06-04" },
    analysisAsOf:"2025-06-05", observedDaily:weather("2025-06-01", 6) });
  assert.equal(outside.counterfactual.status, "unknown");
  assert.equal(outside.counterfactual.outOfForecast, true);
  const notPublished = model.diagnoseWeather(snapshot, { asOf, weatherDaily, input,
    analysisAsOf:"2025-06-05", observedDaily:weather("2025-06-01", 6, { availableAt:"2025-06-06" }) });
  assert.equal(notPublished.substitutedDays.length, 0);
  assert.equal(notPublished.original.ratio, notPublished.counterfactual.ratio);
  assert.throws(() => model.diagnoseWeather(snapshot, { asOf, weatherDaily, input, analysisAsOf:"2025-05-31" }), /診断時点/);
});

test("shadow gates reject lost quality coverage and quality regression outside readiness-scored rows", () => {
  const active = validatedSelectionRows().map(row => ({ ...row, readyError:2, qualityErrors:{ elongated:0, uneven:0, tipburn:0 } }));
  const missing = active.map((row, index) => ({ ...row, readyError:1,
    qualityErrors:index ? row.qualityErrors : { elongated:null, uneven:0, tipburn:0 } }));
  const coverage = model.comparePredictions(missing, active);
  assert.equal(coverage.reason, "reducedPredictionCoverage");
  assert.equal(coverage.lostQualityPredictions.elongated, 1);
  const extra = { ...active[0], id:"quality-only", cropId:"quality-crop", groupId:"quality-record", readyError:null, windowConstraintLoss:null, ordinalError:null };
  const better = active.map(row => ({ ...row, readyError:1 }));
  const regression = model.comparePredictions([...better, { ...extra, qualityErrors:{ elongated:1 } }], [...active, extra]);
  assert.equal(regression.reason, "reducedPredictionCoverage");
  const complete = { ...extra, qualityErrors:{ elongated:1, uneven:0, tipburn:0 } };
  assert.equal(model.comparePredictions([...better, complete], [...active, extra]).reason, "qualityRegression");
});

test("at equal readiness a validated quality gain can be proposed, while readiness improvement ranks first", () => {
  const active = validatedSelectionRows().map(row => ({ ...row, readyError:2, qualityErrors:{ elongated:1, uneven:1, tipburn:1 } }));
  const quality = active.map(row => ({ ...row, qualityErrors:{ elongated:0, uneven:1, tipburn:1 } }));
  const qualityGate = model.comparePredictions(quality, active);
  assert.equal(qualityGate.accepted, true);
  assert.equal(qualityGate.decidingPriority, "elongated");
  const ready = active.map(row => ({ ...row, readyError:1.5 }));
  const selection = model._test.selectValidatedMethod({ legacy:active, safe:quality, calendar:ready, adaptive:active }, "legacy");
  assert.equal(selection.candidateMethod, "calendar");
  assert.equal(selection.requiresApproval, true);
});

test("auxiliary frozen quality and yield coefficients survive hydration and re-export unchanged", () => {
  const fit = model.fit(samples(3), { asOf:"2025-06-01", weatherDaily:weather("2025-01-01", 160), validation:{ methods:{}, rows:{}, selection:{} } });
  const snapshot = model.exportModel(fit);
  snapshot.coefficients.quality = { schemaVersion:2, trainedAsOf:"2025-06-01", trainedAt:Date.parse("2025-06-01T00:00:00+09:00"), buildings:{} };
  snapshot.coefficients.yield = {schemaVersion:1,trainedAsOf:"2025-06-01",model:{schemaVersion:1,rows:[{factor:0.87,building:2}]},training:{cropIds:["a"],independentCrops:1}};
  const restored = model.hydrateModel(snapshot, { asOf:"2025-06-02", weatherDaily:[] });
  assert.deepEqual(model.exportModel(restored).coefficients.quality, snapshot.coefficients.quality);
  assert.deepEqual(model.exportModel(restored).coefficients.yield, snapshot.coefficients.yield);
});

test("frozen zero-history prior can be compared only by explicit opt-in and sufficient independent future evidence", () => {
  const active = validatedSelectionRows().map(row => ({ ...row, trainingCrops:0 }));
  const candidate = active.map(row => ({ ...row, trainingCrops:20, predicted:"normal", ordinalError:0, windowConstraintLoss:0 }));
  assert.equal(model.comparePredictions(candidate, active).accepted, false);
  assert.equal(model._test.compareGate(candidate, active).accepted, false); // rolling comparator keeps its cold-start policy.
  assert.equal(model.comparePredictions(candidate, active, { allowPriorBaseline:true }).accepted, true);
  assert.equal(model.comparePredictions(candidate.slice(0,15), active.slice(0,15), { allowPriorBaseline:true }).accepted, false);
  const fourFolds = active.map((row, i) => ({ ...row, asOf:addDays("2025-01-01", (i % 4) * 20) }));
  assert.equal(model.comparePredictions(candidate.map((row,i) => ({ ...row, asOf:fourFolds[i].asOf })), fourFolds,
    { allowPriorBaseline:true }).accepted, false);
  const shortPeriod = active.map((row,i) => ({ ...row, asOf:addDays("2025-01-01", i) }));
  assert.equal(model.comparePredictions(candidate.map((row,i) => ({ ...row, asOf:shortPeriod[i].asOf })), shortPeriod,
    { allowPriorBaseline:true }).accepted, false);
  const repeatedCrop = active.map(row => ({ ...row, cropId:"one-crop" }));
  assert.equal(model.comparePredictions(candidate.map(row => ({ ...row, cropId:"one-crop" })), repeatedCrop,
    { allowPriorBaseline:true }).accepted, false);
});
