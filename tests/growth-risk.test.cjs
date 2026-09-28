const assert = require("node:assert/strict");
const test = require("node:test");
const risk = require("../src/scripts/growth-risk.js");
const asOf = "2026-09-25T12:00:00+09:00";
const addDays = (date, days) => new Date(Date.parse(date + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const observation = (date, meanTemp = 24, lightIndex = 0.6) => ({ date, meanTemp, lightIndex, source:"observation" });
const week = (end, temperature = 24, light = 0.6) => Array.from({ length:7 }, (_, i) => observation(addDays(end, i - 6), temperature, light));
const sample = (id, date, status = "present", extra = {}) => ({
  id, groupId:id, cropId:id, building:3, plantingDate:addDays(date, -25), date,
  symptoms:{ tipburn:status, elongated:status }, ...extra
});
const forecast = (date, extra = {}) => ({
  date, meanTemp:24, lightIndex:0.6, source:"forecast", issuedAt:"2026-09-25T02:00:00Z", ...extra
});

test("only explicit tri-state absence counts; legacy booleans and unknown stay unknown", () => {
  const model = risk.fit([
    sample("present", "2026-09-20"), sample("none", "2026-09-20", "none"),
    sample("unknown", "2026-09-20", "unknown"),
    sample("legacy", "2026-09-20", "unknown", { symptoms:undefined, tipburn:false, elongated:true })
  ], { asOf, weatherDaily:week("2026-09-20") });
  assert.equal(model.buildings[3].tipburn.confirmedCount, 2);
  assert.equal(model.buildings[3].tipburn.presentCount, 1);
  assert.equal(model.buildings[3].elongated.confirmedCount, 2);
  assert.equal(model.buildings[3].tipburn.association.excluded.unknown, 2);
});

test("future outcomes and late revisions are excluded independently of weather", () => {
  const model = risk.fit([
    sample("known", "2026-09-20"), sample("today", "2026-09-25"), sample("future", "2026-09-26"),
    sample("late-edit", "2026-09-20", "present", { availableAt:"2026-09-26T00:00:00Z" })
  ], { asOf, weatherDaily:week("2026-09-20") });
  assert.equal(model.buildings[3].tipburn.confirmedCount, 1);
  assert.equal(model.excluded.future, 3);
  const replay = risk.predict(model, { asOf:"2026-09-19", building:3, forecastDate:"2026-09-20" });
  assert.equal(replay.tipburn.confirmedCount, 0);
});

test("relationship analysis requires 80 percent observation coverage and never imputes null as zero", () => {
  const weatherDaily = week("2026-09-20").slice(0, 5);
  weatherDaily.push({ date:"2026-09-19", meanTemp:null, lightIndex:null, source:"observation" });
  const sparse = risk.fit([sample("sparse", "2026-09-20")], { asOf, weatherDaily });
  assert.equal(sparse.buildings[3].tipburn.association.eligibleCount, 0);
  assert.equal(sparse.buildings[3].tipburn.association.excluded.insufficientWeather, 1);
  weatherDaily.push(observation("2026-09-20"));
  const enough = risk.fit([sample("enough", "2026-09-20")], { asOf, weatherDaily });
  assert.equal(enough.buildings[3].tipburn.association.eligibleCount, 1);
  assert.equal(enough.buildings[3].tipburn.association.exposed.count, 1);
});

test("shared records and repeated crop evaluations do not inflate independent group counts", () => {
  const rows = [
    sample("a", "2026-09-20", "present", { groupId:"record1", cropId:"bedA" }),
    sample("b", "2026-09-20", "present", { groupId:"record1", cropId:"bedB" }),
    sample("c", "2026-09-21", "present", { groupId:"record2", cropId:"bedA" }),
    sample("d", "2026-09-20", "none")
  ];
  const model = risk.fit(rows, { asOf, weatherDaily:[...week("2026-09-20"), observation("2026-09-21")] });
  assert.equal(model.buildings[3].tipburn.confirmedCount, 2);
  assert.equal(model.buildings[3].tipburn.association.eligibleCount, 2);
  assert.equal(model.buildings[3].tipburn.presentCount, 1);
});

test("contradictory shared outcomes are counted once and excluded from association", () => {
  const model = risk.fit([
    sample("a", "2026-09-20", "present", { groupId:"shared" }),
    sample("b", "2026-09-20", "none", { groupId:"shared" })
  ], { asOf, weatherDaily:week("2026-09-20") });
  assert.equal(model.buildings[3].tipburn.confirmedCount, 1);
  assert.equal(model.buildings[3].tipburn.presentCount, 1);
  assert.equal(model.buildings[3].tipburn.association.eligibleCount, 0);
  assert.equal(model.buildings[3].tipburn.association.excluded.conflictingOutcome, 1);
});

test("exposed and unexposed historical frequencies shrink toward the pooled rate without claiming probability", () => {
  const rows = [], weatherDaily = [];
  for(let index = 0; index < 12; index++){
    const end = addDays("2026-04-01", index * 10);
    rows.push(sample(`crop-${index}`, end, index < 6 ? "present" : "none"));
    weatherDaily.push(...week(end, index < 6 ? 24 : 18, index < 6 ? 0.6 : 1));
  }
  const model = risk.fit(rows, { asOf, weatherDaily });
  const association = model.buildings[3].tipburn.association;
  assert.equal(association.status, "descriptive");
  assert.equal(association.exposed.count, 6);
  assert.equal(association.unexposed.count, 6);
  assert.equal(association.exposed.shrunkRate, 0.75);
  assert.equal(association.unexposed.shrunkRate, 0.25);
  assert.equal(association.validation.status, "not-validated");
  const output = risk.predict(model, { asOf, building:3, forecastDate:"2026-09-25", weatherDaily:[forecast("2026-09-25")] });
  assert.equal(output.tipburn.reference, true);
  assert.equal(output.tipburn.label, "高");
  assert.equal(output.tipburn.confidence.level, "low");
  assert.equal(output.tipburn.severity, "unknown");
  assert.match(output.tipburn.reason, /条件あり6作中6作、条件なし6作中0作/);
  assert.match(output.tipburn.reason, /発生確率は未検証/);
});

test("forecast issue and availability cutoffs exclude future forecasts and realized future observations", () => {
  const weatherDaily = [
    forecast("2026-09-25"),
    forecast("2026-09-26", { issuedAt:"2026-09-26T00:00:00Z" }),
    forecast("2026-09-27", { retrievedAt:"2026-09-26T00:00:00Z" }),
    observation("2026-09-28"),
    forecast("2026-09-29", { issuedAt:undefined }),
    forecast("2026-09-30", { estimatedTemperature:true }),
    forecast("2026-10-01", { meanTemp:null })
  ];
  const model = risk.fit([], { asOf, weatherDaily });
  const output = risk.predict(model, { asOf, building:3, forecastDate:"2026-10-10", weatherDaily });
  assert.equal(output.tipburn.weatherDays, 1);
  assert.equal(output.tipburn.forecastWeatherDays, 1);
  assert.equal(output.tipburn.expectedWeatherDays, 7);
});

test("available observation dates and manual adjustments apply consistently to history and forecast", () => {
  const rows = [sample("a", "2026-09-20", "present", { manualAdjustment:{ temperatureOffsetC:1, lightMultiplier:0.8 } })];
  const weatherDaily = week("2026-09-20", 21, 0.9);
  weatherDaily[0].retrievedAt = "2026-09-26T00:00:00Z";
  const model = risk.fit(rows, { asOf, weatherDaily });
  assert.equal(model.buildings[3].tipburn.association.exposed.count, 1);
  assert.equal(model.buildings[3].elongated.association.exposed.count, 1);
  const output = risk.predict(model, { asOf:new Date(asOf), building:3, forecastDate:new Date("2026-09-25T00:00:00+09:00"),
    manualAdjustment:{ temperatureOffsetC:1, lightMultiplier:0.8 },
    weatherDaily:[forecast("2026-09-25", { meanTemp:21, lightIndex:0.9 })] });
  assert.equal(output.tipburn.weatherDays, 1);
  assert.equal(output.elongated.weatherDays, 1);
});

test("recent retrieval of old observations remains usable, but explicit late availability does not", () => {
  const rows = [sample("known", "2026-09-20")];
  const days = week("2026-09-20").map(day => ({ ...day, retrievedAt:"2026-09-26T12:00:00+09:00" }));
  const archived = risk.fit(rows, { asOf, weatherDaily:days });
  assert.equal(archived.buildings[3].tipburn.association.eligibleCount, 1);
  const late = risk.fit(rows, { asOf, weatherDaily:days.map(day => ({ ...day, availableAt:day.retrievedAt })) });
  assert.equal(late.buildings[3].tipburn.association.eligibleCount, 0);
});

function severityHistory(count = 40, legacy = false){
  const rows = [], daily = [], archive = [];
  for(let index = 0; index < count; index++){
    const date = addDays("2025-01-30", index * 10), hot = index % 2 === 0;
    const severity = hot ? legacy ? "present" : "many" : "none";
    rows.push(sample(`severity-${index}`, date, severity,
      { symptoms:{ elongated:severity, uneven:severity, tipburn:severity } }));
    const conditions = { meanTemp:hot ? 24 : 18, lightIndex:hot ? 0.6 : 1, maxTemp:hot ? 30 : 20, minTemp:hot ? 20 : 16 };
    daily.push(...week(date).map(day => ({ ...day, ...conditions })));
    const origin = addDays(date, -6);
    archive.push({ issuedAt:origin + "T00:00:00+09:00", capturedAt:origin + "T00:00:00+09:00",
      daily:Array.from({ length:7 }, (_, i) => ({ date:addDays(origin, i), ...conditions })) });
  }
  return { rows, daily, archive };
}

test("all three risks retain severity, distinguish unknown from none, and remain reference confidence", () => {
  const data = severityHistory();
  const fitted = risk.fit(data.rows, { asOf, weatherDaily:data.daily });
  const predicted = risk.predict(fitted, { asOf, building:3, forecastDate:"2026-09-25",
    weatherDaily:[forecast("2026-09-25", { maxTemp:30, minTemp:20 })] });
  for(const symptom of ["elongated", "uneven", "tipburn"]){
    assert.equal(predicted[symptom].level, "high");
    assert.equal(predicted[symptom].severity, "many");
    assert.equal(predicted[symptom].confidence.level, "low");
    assert.equal(predicted[symptom].reference, true);
    assert.equal(predicted[symptom].riskStartsAt, "2026-09-25");
    assert.equal(predicted[symptom].riskStartsAtKind, "reference-weather-condition");
    assert.equal(predicted[symptom].validation.status, "not-validated");
  }
  const withoutExtremes = risk.predict(fitted, { asOf, building:3, forecastDate:"2026-09-25", weatherDaily:[forecast("2026-09-25")] });
  assert.equal(withoutExtremes.uneven.level, "unknown");
  assert.equal(withoutExtremes.uneven.severity, "unknown");
  const none = risk.predict(fitted, { asOf, building:3, forecastDate:"2026-09-25",
    weatherDaily:[forecast("2026-09-25", { meanTemp:18, lightIndex:1, maxTemp:20, minTemp:16 })] });
  assert.equal(none.tipburn.level, "low");
  assert.equal(none.tipburn.severity, "none");
});

test("legacy positive observations never become a measured severity grade", () => {
  const data = severityHistory(40, true);
  const fitted = risk.fit(data.rows, { asOf, weatherDaily:data.daily });
  const predicted = risk.predict(fitted, { asOf, building:3, forecastDate:"2026-09-25", weatherDaily:[forecast("2026-09-25")] });
  assert.equal(predicted.tipburn.level, "high");
  assert.equal(predicted.tipburn.severity, "unknown");
  assert.equal(fitted.buildings[3].tipburn.association.exposed.severityCounts["legacy-present"], 20);
});

test("slight is a distinct grade and incomplete forecast coverage never produces a reassuring low risk", () => {
  const data = severityHistory();
  const rows = data.rows.map(row => ({ ...row, symptoms:Object.fromEntries(Object.entries(row.symptoms).map(([key, value]) => [key, value === "many" ? "slight" : value])) }));
  const fitted = risk.fit(rows, { asOf, weatherDaily:data.daily });
  const current = risk.predict(fitted, { asOf, building:3, forecastDate:"2026-09-25", weatherDaily:[forecast("2026-09-25")] });
  assert.equal(current.tipburn.severity, "slight");
  const horizon = risk.predict(fitted, { asOf, building:3, forecastDate:"2026-09-26", weatherDaily:[forecast("2026-09-25")] });
  for(const output of Object.values(horizon)){
    assert.equal(output.level, "unknown");
    assert.equal(output.severity, "unknown");
    assert.equal(output.outOfForecast, true);
    assert.equal(output.riskStartsAt, null);
  }
});

test("quality coefficient snapshots restore without source data and cannot rewind", () => {
  const data = severityHistory();
  const weatherDaily = data.daily.concat(forecast("2026-09-25", { maxTemp:30, minTemp:20 }));
  const fitted = risk.fit(data.rows, { asOf, weatherDaily });
  const snapshot = JSON.parse(JSON.stringify(risk.exportModel(fitted)));
  assert.ok(!JSON.stringify(snapshot).includes("plantingDate"));
  assert.ok(!JSON.stringify(snapshot).includes("weatherDaily"));
  const restored = risk.hydrateModel(snapshot, { asOf, weatherDaily });
  const query = { asOf, building:3, forecastDate:"2026-09-25" };
  assert.deepEqual(risk.predict(restored, query), risk.predict(fitted, query));
  assert.throws(() => risk.hydrateModel(snapshot, { asOf:"2026-09-25T10:00:00+09:00", weatherDaily }), /前/);
});

test("quality walk-forward uses archived forecasts and excludes unavailable outcomes; no archive means unscored", () => {
  const data = severityHistory();
  const result = risk.backtest(data.rows, { asOf, weatherDaily:data.daily, forecastHistory:data.archive });
  for(const symptom of ["elongated", "uneven", "tipburn"]){
    assert.ok(result.metrics[symptom].count > 0);
    assert.equal(result.metrics[symptom].mae, 0);
  }
  const unavailable = risk.backtest(data.rows.map(row => ({ ...row, availableAt:"2027-01-01" })),
    { asOf, weatherDaily:data.daily, forecastHistory:data.archive });
  assert.equal(unavailable.rows.length, 0);
  const noArchive = risk.backtest(data.rows, { asOf, weatherDaily:data.daily });
  for(const metric of Object.values(noArchive.metrics)){
    assert.equal(metric.count, 0);
    assert.equal(metric.mae, null);
    assert.equal(metric.status, "insufficient-data");
  }
  const legacy = severityHistory(40, true);
  const uncertainGrade = risk.backtest(legacy.rows, { asOf, weatherDaily:legacy.daily, forecastHistory:legacy.archive });
  assert.ok(uncertainGrade.rows.filter(row => row.actual === "legacy-present").every(row => row.loss === null));
});

test("dated environment effects use only their covered days and known revisions in quality estimates", () => {
  const environmentRegimes = [{ startDate:"2026-09-19", endDate:"2026-09-25", temperatureOffsetC:1, lightMultiplier:0.8,
    availableAt:"2026-09-18T12:00:00+09:00" }];
  const rows = [sample("environment", "2026-09-20", "slight", { environmentRegimes })];
  const weatherDaily = week("2026-09-20", 21, 0.9);
  const fitted = risk.fit(rows, { asOf, weatherDaily });
  assert.equal(fitted.buildings[3].tipburn.association.exposed.count, 1);
  assert.equal(fitted.buildings[3].elongated.association.exposed.count, 1);
  const late = risk.fit(rows.map(row => ({ ...row, environmentRegimes:environmentRegimes.map(regime => ({ ...regime, availableAt:"2026-09-26" })) })),
    { asOf, weatherDaily });
  assert.equal(late.buildings[3].tipburn.association.unexposed.count, 1);
  const predicted = risk.predict(fitted, { asOf, building:3, forecastDate:"2026-09-25", environmentRegimes,
    weatherDaily:[forecast("2026-09-25", { meanTemp:21, lightIndex:0.9 })] });
  assert.equal(predicted.tipburn.weatherDays, 1);
  assert.equal(predicted.elongated.weatherDays, 1);
});
