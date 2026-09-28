"use strict";
// Integration contracts for the real dashboard record adapter. No DOM, network,
// generated index.html, or production browser storage is used by this test.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
process.env.TZ = "Asia/Tokyo";
const root = path.join(__dirname, "..", "src", "scripts", "app");
const sourceByFile = new Map();

function extract(file, name){
  if(!sourceByFile.has(file)) sourceByFile.set(file, fs.readFileSync(path.join(root, file), "utf8"));
  const source = sourceByFile.get(file);
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${file}: ${name} is missing`);
  const end = source.indexOf("\n}", start);
  assert.notEqual(end, -1, `${file}: ${name} has no top-level closing brace`);
  return source.slice(start, end + 2);
}

function context(records = [], plantingEvents = [], observations = []){
  const clock = Date.parse("2026-09-25T12:00:00+09:00");
  class FixedDate extends Date {
    constructor(...args){ super(...(args.length ? args : [clock])); }
    static now(){ return clock; }
  }
  const fitCalls = [];
  const c = vm.createContext({
    Date:FixedDate, records, plantingEvents, BUILDINGS:[2,3,4,5,6,7,8,9],
    bedOrder:["A","B","C","D","E","F"], PALLETS_PER_BED:78,
    dashboardGrowthDataRevision:0, dashboardGrowthSourceCache:null,
    dashboardHarvestForecastModelCache:null, dashboardGrowthPredictionModelCache:null,
    dashboardSeedlingStatusModelCache:null, dashboardPastCalendarItemsByDateCache:null,
    dashboardRenderedSubtabs:new Set(), dashboardRenderedDayKey:"", dashboardGrowthForecastHistoryCache:null,
    closeDashboardSeedlingStatusDetail:() => {}, performance:{ now:() => 0 },
    getDashboardGrowthBuildingAdjustment:() => ({ temperatureOffsetC:0, lightMultiplier:1 }),
    getDashboardGrowthHistoryScope:() => "integration-test",
    buildDashboardGrowthWeatherIndex:() => ({}),
    getDashboardGrowthRisk:() => ({}),
    HarvestGrowthModel:{
      fit(samples, options){ fitCalls.push({samples, options}); return {sampleCount:samples.length, validation:null}; },
      predict(fit, input){ return {status:"normal", ratio:1, progress:0.8,
        confidence:{level:"reference", label:"参考値"}, reasons:[], basis:{},
        dayCounts:{}, readyDate:null}; }
    },
    HarvestGrowthRisk:{ fit:() => ({}), predict:()=>({}) },
    HarvestGrowthEvidence:require("../src/scripts/growth-evidence.js"),
    HarvestGrowthReadiness:require("../src/scripts/growth-readiness.js"),
    HarvestGrowthObservations:{list:() => observations,revision:() => 0}
  });
  const functions = {
    "03-sheet-sync-core.js":["isStrictDateOnlyString"],
    "06-settings.js":["getPalletKey","parsePalletKey","clampNumber"],
    "08-harvest-calculation.js":["getLocalDayDiff","getOrderIndexFromKey"],
    "02-local-data.js":["isValidPalletKeyString","getDirectPalletKeys","expandPalletRangesToKeys",
      "expandPalletKeyItemsToKeys","getPalletKeysFromRecord","normalizePartialHarvestTargets",
      "normalizeQualityTag","normalizeQualityMemo","normalizeHarvestSizeRating",
      "getHarvestBedKeyFromPalletKey","getHarvestBedKeysFromPalletKeys","normalizeHarvestSymptomStatus","isHarvestSymptomPresent",
      "hasHarvestGrowthObservationFields","normalizeHarvestGrowthObservations","normalizeHarvestGrowthDetail",
      "getHarvestGrowthOverallState","getHarvestGrowthStateForBed"],
    "growth-runtime.js":["getDashboardGrowthObservationsByBuilding","getDashboardGrowthObservationScopes"],
    "07-dashboard.js":["parseDateOnlyString","startOfLocalDay","formatDateOnlyString","addDays",
      "getDashboardGrowthMedian","buildDashboardGrowthPlantingIndex","getDashboardGrowthPriorPlanting",
      "getDashboardGrowthPriorPlantingDate","buildDashboardGrowthTrainingSamples","getDashboardGrowthSourceState",
      "invalidateDashboardDerivedData","getDashboardGrowthAsOf","getDashboardGrowthBedPrediction",
      "buildDashboardGrowthWeatherDiagnostics","buildDashboardGrowthPredictionModel"]
  };
  for(const [file, names] of Object.entries(functions)){
    for(const name of names) vm.runInContext(extract(file, name), c, { filename:`${file}:${name}` });
  }
  c.fitCalls = fitCalls;
  return c;
}

function planting(eventId, plantingDate, plantingPalletKeys, extra = {}){
  return {eventId, plantingDate, plantingPalletKeys, ...extra};
}
function harvest(id, date, palletKeys, extra = {}){
  return {id, recordUuid:`harvest-${id}`, type:"fullHarvest", date, palletKeys,
    sizeRating:"normal", qualityMemo:{tags:[], other:""}, ...extra};
}
function plain(value){ return JSON.parse(JSON.stringify(value)); }
function date(c, value){ return c.parseDateOnlyString(value); }


test("one harvest is split by real planting event while retaining a shared outcome group", () => {
  const c = context([harvest(10, "2026-09-20", ["2-A-1","2-A-2","2-A-3"], {
    updatedAt:"2026-09-21T09:00:00+09:00",
    growthDetail:{schemaVersion:2, uneven:false, readyDate:"2026-09-18", tipburnStatus:"none",
      elongatedStatus:"unknown", cultivar:"マルチリーフエアリ", bedOverrides:{}}
  })], [
    planting(1,"2026-08-20",["2-A-1","2-A-2"]),
    planting(2,"2026-09-01",["2-A-3"])
  ]);
  const rows = c.buildDashboardGrowthTrainingSamples(date(c,"2026-09-25"));
  assert.equal(rows.length,2);
  assert.deepEqual(plain(rows.map(row => c.formatDateOnlyString(row.plantingDate)).sort()),["2026-08-20","2026-09-01"]);
  assert.deepEqual(plain(rows.map(row => row.ageDays).sort((a,b) => a-b)),[19,31]);
  assert.deepEqual(plain(rows.map(row => row.palletCount).sort()),[1,2]);
  assert.equal(new Set(rows.map(row => row.groupId)).size,1,"bed rows must not become independent harvest outcomes");
  assert.equal(new Set(rows.map(row => row.cropId)).size,2);
  assert.equal(rows[0].readyDate,"2026-09-18");
  assert.equal(rows[0].symptoms.tipburn,"none");
  assert.equal(rows[0].symptoms.elongated,"unknown");
  assert.equal(Date.parse(rows[0].availableAt),Date.parse("2026-09-21T09:00:00+09:00"));
});


test("an intervening full harvest prevents reuse of an old planting even with missing replant data", () => {
  const c = context([
    harvest(2,"2026-09-10",["2-A-1"]),
    harvest(1,"2026-08-25",["2-A-1"])
  ],[planting(1,"2026-08-01",["2-A-1"])]);
  const state = c.getDashboardGrowthSourceState(date(c,"2026-09-25"));
  assert.equal(state.samples.length,1);
  assert.equal(state.samples[0].groupId,"harvest-1");
  assert.equal(state.diagnostics.invalidCycle,1);
  assert.equal(state.currentPlanting.has("2-A-1"),false);
});


test("same-day replant starts a new cycle and missing pallets do not acquire a median planting date", () => {
  const c = context([
    harvest(1,"2026-08-25",["2-A-1"]),
    harvest(2,"2026-09-20",["2-A-1","2-A-2"])
  ],[
    planting(1,"2026-08-01",["2-A-1"]),
    planting(2,"2026-08-25",["2-A-1"])
  ]);
  const state = c.getDashboardGrowthSourceState();
  const later = state.samples.find(row => row.groupId === "harvest-2");
  assert.equal(c.formatDateOnlyString(later.plantingDate),"2026-08-25");
  assert.deepEqual(plain(later.palletKeys),["2-A-1"]);
  assert.equal(later.palletCount,1);
  assert.equal(state.diagnostics.missingPlanting,1);
});


test("current crops older than 35 days reach the growth model without changing the harvest schedule cache", () => {
  const c = context([],[planting(1,"2026-08-01",["2-A-1"])]);
  const schedule = {
    referenceDate:date(c,"2026-09-25"), startBuilding:2, canForecast:false,
    plantingDateByPallet:new Map(), estimatedPlantingPalletKeys:new Set(),
    palletForecasts:new Map(), bedRanges:new Map(), buildingRanges:new Map()
  };
  c.dashboardHarvestForecastModelCache = schedule;
  const model = c.buildDashboardGrowthPredictionModel({daily:[]});
  const start = model.baseModel.plantingDateByPallet.get("2-A-1");
  assert.equal(c.getLocalDayDiff(start,date(c,"2026-09-25")),55);
  assert.equal(model.predictions.get("2-A").hasCurrentCrop,true);
  assert.equal(model.predictions.get("2-A").basis.palletCount,1);
  assert.equal(schedule.plantingDateByPallet.size,0);
  assert.equal(schedule.growthFit,undefined);
  assert.equal(c.dashboardHarvestForecastModelCache,schedule);
  assert.equal(c.fitCalls.length,1);
});

test("an explicit environment position splits prediction cohorts without changing targets or the harvest schedule cache", () => {
  const observations = [], pallets = ["2-A-1","2-A-2"];
  const c = context([],[planting(1,"2026-08-25",pallets)],observations);
  const plannedDay = date(c,"2026-09-29");
  const schedule = {
    referenceDate:date(c,"2026-09-25"),startBuilding:2,canForecast:true,
    plantingDateByPallet:new Map(pallets.map(key => [key,date(c,"2026-08-25")])),
    estimatedPlantingPalletKeys:new Set(),
    palletForecasts:new Map(pallets.map(key => [key,{date:plannedDay}])),
    bedRanges:new Map([["2-A",{start:{date:plannedDay},end:{date:plannedDay}}]]),
    buildingRanges:new Map()
  };
  const snapshot = () => plain({ ...schedule,
    plantingDateByPallet:[...schedule.plantingDateByPallet],
    estimatedPlantingPalletKeys:[...schedule.estimatedPlantingPalletKeys],
    palletForecasts:[...schedule.palletForecasts],bedRanges:[...schedule.bedRanges],
    buildingRanges:[...schedule.buildingRanges] });
  const originalSchedule = snapshot(), riskInputs = [];
  c.dashboardHarvestForecastModelCache = schedule;
  c.HarvestGrowthRisk.predict = (_,input) => { riskInputs.push(input); return {}; };
  const before = c.buildDashboardGrowthPredictionModel({daily:[]}).predictions.get("2-A");
  assert.equal(before.cohorts.length,1);
  assert.deepEqual(plain(before.cohorts[0].palletKeys),pallets);
  observations.push({observationId:"local-environment",kind:"environment",building:2,bed:"A",palletKeys:["2-A-1"],
    startDate:"2026-09-01",endDate:"",createdAt:"2026-09-20T00:00:00Z",updatedAt:"2026-09-20T00:00:00Z",
    payload:{temperature:"low",light:"high",humidity:"base",dataPolicy:"normal"}});
  riskInputs.length = 0;
  const model = c.buildDashboardGrowthPredictionModel({daily:[]});
  const after = model.predictions.get("2-A"), affected = after.cohorts.find(row => row.palletKeys.includes("2-A-1"));
  const untouched = after.cohorts.find(row => row.palletKeys.includes("2-A-2"));
  assert.equal(after.cohorts.length,2);
  assert.equal(after.basis.palletCount,before.basis.palletCount);
  assert.deepEqual(plain(after.cohorts.flatMap(row => row.palletKeys).sort()),pallets,"all target pallets remain exactly once");
  assert.ok(after.cohorts.every(row => row.input.targetDate === "2026-09-29"));
  assert.equal(affected.input.environmentRegimes.length,1);
  assert.equal(affected.input.environmentRegimes[0].observationId,"local-environment");
  assert.equal(affected.input.environmentRegimes[0].temperatureOffsetC,-1);
  assert.equal(affected.input.environmentRegimes[0].lightMultiplier,1.12);
  assert.deepEqual(plain(untouched.input.environmentRegimes),[]);
  assert.ok(after.cohorts.every(row => row.input.growthEvidence.ignoredPartialScope.length === 0),"the local observation is applied after splitting, not skipped for the entire bed");
  assert.deepEqual(riskInputs.map(input => input.environmentRegimes.length).sort(),[0,1],"quality risk receives the same position-specific environment");
  assert.equal(c.dashboardHarvestForecastModelCache,schedule);
  assert.equal(model.baseModel.palletForecasts,schedule.palletForecasts);
  assert.equal(model.baseModel.bedRanges,schedule.bedRanges);
  assert.deepEqual(snapshot(),originalSchedule);
  assert.equal("growthObservationScopeByPallet" in schedule,false);
});


test("partial harvest affects only its pallet cohort, excludes future partials, and does not carry into replanting", () => {
  const partial = (id, day, bed, number) => ({id,type:"partialHarvest",date:day,
    targets:[{building:2,bed,start:number,end:number,plantsPerPallet:1}]});
  const c = context([
    partial(1,"2026-08-19","A",2), // Before this pallet's new planting.
    partial(2,"2026-09-10","A",1),
    harvest(3,"2026-09-20",["2-A-1","2-A-2","2-B-1"]),
    partial(4,"2026-09-26","B",1) // Not yet known at the origin.
  ],[
    planting(1,"2026-08-20",["2-A-1"]),
    planting(2,"2026-08-22",["2-A-2"]),
    planting(3,"2026-08-20",["2-B-1"])
  ]);
  const state = c.getDashboardGrowthSourceState();
  const finalSamples = state.samples.filter(row => !row.signalKind);
  const affected = finalSamples.find(row => row.palletKeys.includes("2-A-1"));
  const untouched = finalSamples.filter(row => !row.palletKeys.includes("2-A-1"));
  assert.equal(affected.partial,true);
  assert.equal(affected.qualityWeight,0.5);
  assert.ok(untouched.every(row => row.partial === false && row.qualityWeight === 1));
  assert.equal(state.partialDates.has("2-B-1"),false);
  assert.equal(finalSamples.length,3,"partial signals remain distinct from final harvest outcomes");
  const partialSamples = state.samples.filter(row => row.signalKind);
  assert.equal(partialSamples.length,1);
  assert.equal(partialSamples[0].signalKind,"partial-position");
  assert.equal(partialSamples[0].sizeRating,"large");
  assert.deepEqual(plain(partialSamples[0].palletKeys),["2-A-1"]);
});


test("same-day partial harvest is applied before the full outcome regardless of record ID", () => {
  const c = context([
    harvest(1,"2026-09-20",["2-A-1"]),
    {id:2,type:"partialHarvest",date:"2026-09-20",
      targets:[{building:2,bed:"A",start:1,end:1,plantsPerPallet:1}]}
  ],[planting(1,"2026-08-20",["2-A-1"])]);
  const rows = c.buildDashboardGrowthTrainingSamples().filter(row => !row.signalKind);
  assert.equal(rows.length,1);
  assert.equal(rows[0].partial,true);
  assert.equal(rows[0].qualityWeight,0.5);
});


test("late partial-harvest entry or correction delays only the affected sample's availability", () => {
  const actualModel = require("../src/scripts/growth-model.js");
  const partial = (id, number, createdAt, updatedAt) => ({id,type:"partialHarvest",date:"2026-09-10",
    createdAt,updatedAt,targets:[{building:2,bed:"A",start:number,end:number,plantsPerPallet:1}]});
  const c = context([
    partial(1,1,"2026-09-23T08:00:00+09:00","2026-09-24T09:00:00+09:00"),
    partial(2,2,"2026-09-24T10:00:00+09:00","2026-09-24T08:00:00+09:00"),
    {id:3,type:"partialHarvest",date:"2026-08-01",createdAt:"2026-09-25T10:00:00+09:00",
      targets:[{building:2,bed:"B",start:1,end:1,plantsPerPallet:1}]},
    harvest(4,"2026-09-20",["2-A-1","2-A-2","2-B-1"],{createdAt:"2026-09-20T18:00:00+09:00"})
  ],[planting(1,"2026-08-20",["2-A-1","2-A-2","2-B-1"])]);
  const rows = c.buildDashboardGrowthTrainingSamples().filter(row => !row.signalKind);
  const affected = rows.find(row => row.bed === "A");
  const untouched = rows.find(row => row.bed === "B");
  assert.equal(affected.partial,true);
  assert.equal(affected.qualityWeight,0.5);
  assert.equal(affected.availableAt,"2026-09-24T10:00:00+09:00", "all used pallet records contribute their latest creation/update instant");
  assert.equal(untouched.partial,false);
  assert.equal(untouched.availableAt,"2026-09-20T18:00:00+09:00", "an old-cycle partial must not delay the new crop's outcome");
  const input = rows.map(row => ({...row,plantingDate:c.formatDateOnlyString(row.plantingDate),date:c.formatDateOnlyString(row.date)}));
  const before = actualModel.normalizeSamples(input,"2026-09-22T12:00:00+09:00");
  assert.equal(before.samples.length,1);
  assert.equal(before.samples[0].bed,"B");
  assert.equal(before.excluded.notYetAvailable,1);
  assert.equal(actualModel.normalizeSamples(input,"2026-09-25T12:00:00+09:00").samples.length,2);
});


test("an actual current planting takes precedence over a scheduled estimated planting flag", () => {
  const c = context([],[planting(1,"2026-08-01",["2-A-1"])]);
  const estimates = new Set(["2-A-1","2-A-2"]);
  c.dashboardHarvestForecastModelCache = {
    referenceDate:date(c,"2026-09-25"),startBuilding:2,canForecast:false,
    plantingDateByPallet:new Map(), estimatedPlantingPalletKeys:estimates,
    palletForecasts:new Map(), bedRanges:new Map(),buildingRanges:new Map()
  };
  const result = c.buildDashboardGrowthPredictionModel({daily:[]});
  assert.equal(result.baseModel.estimatedPlantingPalletKeys.has("2-A-1"),false);
  assert.equal(result.baseModel.estimatedPlantingPalletKeys.has("2-A-2"),true);
  assert.equal(result.predictions.get("2-A").hasCurrentCrop,true);
  assert.equal(result.predictions.get("2-A").basis.palletCount,1);
  assert.equal(estimates.has("2-A-1"),true,"the scheduling model must retain its own original estimate flags");
});


test("unchanged source calls reuse the same samples and avoid rebuilding the planting index", () => {
  const c = context([harvest(1,"2026-09-20",["2-A-1"])],[planting(1,"2026-08-20",["2-A-1"])]);
  let indexBuilds = 0;
  const original = c.buildDashboardGrowthPlantingIndex;
  c.buildDashboardGrowthPlantingIndex = () => { indexBuilds++; return original(); };
  const first = c.getDashboardGrowthSourceState();
  assert.equal(c.getDashboardGrowthSourceState(),first);
  assert.equal(c.buildDashboardGrowthTrainingSamples(),first.samples);
  assert.equal(indexBuilds,1);
  c.records[0].sizeRating = "large";
  c.invalidateDashboardDerivedData();
  const edited = c.getDashboardGrowthSourceState();
  assert.notEqual(edited,first);
  assert.equal(edited.samples[0].sizeRating,"large");
  assert.equal(indexBuilds,2);
  c.records = c.records.slice();
  assert.notEqual(c.getDashboardGrowthSourceState(),edited,"record array replacement must invalidate the cached source");
  assert.equal(indexBuilds,3);
  c.plantingEvents = c.plantingEvents.slice();
  c.getDashboardGrowthSourceState();
  assert.equal(indexBuilds,4);
  c.getDashboardGrowthSourceState(date(c,"2026-09-26"));
  assert.equal(indexBuilds,5,"a new as-of day must rebuild the source");
});


test("historical origins exclude future harvests and future planting events", () => {
  const c = context([
    harvest(1,"2026-09-10",["2-A-1"]),
    harvest(2,"2026-09-26",["2-A-2"])
  ],[
    planting(1,"2026-08-20",["2-A-1","2-A-2"]),
    planting(2,"2026-09-27",["2-A-1"])
  ]);
  const state = c.getDashboardGrowthSourceState(date(c,"2026-09-25"));
  assert.equal(state.samples.length,1);
  assert.equal(state.currentPlanting.has("2-A-1"),false);
  assert.equal(state.currentPlanting.has("2-A-2"),true);
  assert.equal(c.formatDateOnlyString(state.currentPlanting.get("2-A-2").date),"2026-08-20");
});


test("independent ready observations split one harvest by actual ready date, preserving unknown pallets",()=>{
  const observations=[
    {observationId:"ready-a",kind:"ready",plantingEventId:1,plantingDate:"2026-08-20",palletKeys:["2-A-1"],readyDate:"2026-09-17",createdAt:"2026-09-18T00:00:00Z",updatedAt:"2026-09-21T00:00:00Z"},
    {observationId:"ready-b",kind:"ready",plantingEventId:1,plantingDate:"2026-08-20",palletKeys:["2-A-2"],readyDate:"2026-09-19",createdAt:"2026-09-19T00:00:00Z",updatedAt:"2026-09-19T00:00:00Z"},
    {observationId:"old-crop",kind:"ready",plantingEventId:99,plantingDate:"2026-08-20",palletKeys:["2-A-3"],readyDate:"2026-09-18",createdAt:"2026-09-19T00:00:00Z",updatedAt:"2026-09-19T00:00:00Z"}
  ];
  const c=context([harvest(1,"2026-09-20",["2-A-1","2-A-2","2-A-3"],{createdAt:"2026-09-20T00:00:00Z"})],
    [planting(1,"2026-08-20",["2-A-1","2-A-2","2-A-3"])],observations);
  const rows=c.buildDashboardGrowthTrainingSamples();
  assert.equal(rows.length,3); assert.equal(new Set(rows.map(row=>row.groupId)).size,1);
  assert.deepEqual(plain(rows.map(row=>[row.palletKeys,row.readyDate])),[[["2-A-1"],"2026-09-17"],[["2-A-2"],"2026-09-19"],[["2-A-3"],""]]);
  assert.deepEqual(plain(rows[0].readyObservationIds),["ready-a"]);
  assert.equal(Date.parse(rows[0].availableAt),Date.parse("2026-09-21T00:00:00Z"));
  assert.equal(Date.parse(rows[1].availableAt),Date.parse("2026-09-20T00:00:00Z"));
});

test("explicit none stops ready-date inheritance but keeps the measured harvest size",()=>{
  const observations=[{observationId:"ready-a",kind:"ready",plantingEventId:1,plantingDate:"2026-08-20",palletKeys:["2-A-1"],readyDate:"2026-09-18",createdAt:"2026-09-19T00:00:00Z",updatedAt:"2026-09-19T00:00:00Z"}];
  const c=context([harvest(1,"2026-09-20",["2-A-1"],{growthDetail:{schemaVersion:3,readyDateMode:"none",readyDate:"",unevenStatus:"unknown",bedOverrides:{}}})],
    [planting(1,"2026-08-20",["2-A-1"])],observations);
  const rows=c.buildDashboardGrowthTrainingSamples(); assert.equal(rows.length,1); assert.equal(rows[0].readyDate,"");
  assert.equal(rows[0].sizeRating,"normal"); assert.deepEqual(plain(rows[0].readyObservationIds),[]);
});

test("a whole-bed partial is only a weak large signal and invents no pallet location",()=>{
  const c=context([{id:1,type:"partialHarvest",date:"2026-09-18",targets:[{building:2,bed:"A",start:1,end:78,plantsPerPallet:1}]}],
    [planting(1,"2026-08-20",["2-A-1","2-A-2"])])
  const rows=c.buildDashboardGrowthTrainingSamples(); assert.equal(rows.length,1);
  assert.equal(rows[0].signalKind,"partial-bed"); assert.equal(rows[0].sizeRating,"large");
  assert.equal(rows[0].qualityWeight,0.2); assert.deepEqual(plain(rows[0].palletKeys),[]); assert.equal(rows[0].palletCount,0);
});
