"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const model = require("../src/scripts/growth-model.js");
const source = fs.readFileSync(require("node:path").join(__dirname, "../src/scripts/app/07-dashboard.js"), "utf8");
const start = source.indexOf("function evaluateDashboardGrowthSavedPredictions(");
const context = vm.createContext({ HarvestGrowthModel:model,
  formatDateOnlyString:model.dateKey,
  parseDateOnlyString:value => new Date(value + "T00:00:00+09:00"),
  addDays:(date, days) => new Date(model.addDays(model.dateKey(date), days) + "T00:00:00+09:00"),
  getLocalDayDiff:(from, to) => model.daysBetween(model.dateKey(from), model.dateKey(to))
});
vm.runInContext(source.slice(start, source.indexOf("\n}", start) + 2), context);
const evaluate = (entries,samples,options={}) => context.evaluateDashboardGrowthSavedPredictions(entries,samples,
  {asOf:"2026-09-25T12:00:00+09:00",...options});
const sample = (id, bed, sizeRating = "normal", groupId = id) => ({ id, groupId, cropId:id,
  building:2, bed, sizeRating, plantingDate:new Date("2026-08-20T00:00:00+09:00"),
  date:new Date("2026-09-20T00:00:00+09:00"), palletKeys:[`2-${bed}-1`], readyDate:"2026-09-18" });
const forecast = (bed, status = "normal") => ({ building:2, bed, plantingDate:"2026-08-20",
  palletKeys:[`2-${bed}-1`], scheduled:true, targetDate:"2026-09-20",
  prediction:{ status, readyDate:"2026-09-17", confidence:{level:"reference"}, dayCounts:{},
    interval:{start:"2026-09-16",end:"2026-09-19"} } });
const entry = predictions => ({ asOf:"2026-09-17", capturedAt:"2026-09-17T12:00:00+09:00", payload:{ predictions } });

test("saved quality-only outcomes are scored without inventing size or ready labels",()=>{
  const actual={...sample("quality","A","unknown"),readyDate:"",symptoms:{elongated:"slight",uneven:"none",tipburn:"unknown"},
    availableAt:"2026-09-21T00:00:00+09:00",plantingAvailableAt:"2026-08-20T10:00:00+09:00"};
  const prediction=forecast("A","unknown");prediction.prediction.readyDate=null;
  prediction.risk={elongated:{severity:"many"},uneven:{severity:"none"},tipburn:{severity:"none"}};
  const saved=entry([prediction]);Object.assign(saved.payload,{modelVersion:"v1",modelId:"model-1",modelTrainedAsOf:"2026-09-01T00:00:00+09:00"});
  const result=evaluate([saved],[actual]);
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].ordinalError,null);
  assert.equal(result.rows[0].readyError,null);
  assert.equal(result.rows[0].qualityErrors.elongated,1);
  assert.equal(result.rows[0].qualityErrors.uneven,0);
  assert.equal(result.rows[0].qualityErrors.tipburn,null);
  assert.equal(result.rows[0].provenanceVerified,true);
  delete actual.plantingAvailableAt;
  assert.equal(evaluate([saved],[actual]).rows[0].provenanceVerified,false);
});

test("saved predictions score every bed and weight shared harvest outcomes once", () => {
  const result = evaluate([entry([forecast("A"),forecast("B"),forecast("C")])], [
    sample("a","A","normal","shared"), sample("b","B","small","shared"), sample("c","C")
  ]);
  assert.equal(result.rows.length, 3);
  assert.equal(result.metrics.independentCrops, 2);
  assert.equal(result.metrics.accuracy, 0.75);
  assert.equal(result.metrics.byConfidence.reference.accuracy, 0.75);
  assert.equal(result.metrics.readyDateMAE, 1);
  assert.equal(result.metrics.intervalCoverage, 1);
  assert.equal(result.leadDays,3);
  assert.equal(result.selection,"latest-on-exact-lead-day");
});

test("capture cutoff uses Japanese date and late saves cannot masquerade as old predictions", () => {
  const late = {...entry([forecast("A")]), capturedAt:"2026-09-17T15:01:00Z"}; // 9/18 JST
  assert.equal(evaluate([late],[sample("a","A")]).rows.length,0);
  const timely = {...entry([forecast("A","small")]), capturedAt:"2026-09-17T14:59:00Z"};
  assert.equal(evaluate([late,timely],[sample("a","A")]).rows[0].predicted,"small");
});

test("fixed three-day lead uses that day's latest matching snapshot, never a different horizon",()=>{
  const old={...entry([forecast("A","normal")]),asOf:"2026-09-16",capturedAt:"2026-09-16T14:00:00+09:00"};
  const early={...entry([forecast("A","normal")]),capturedAt:"2026-09-17T08:00:00+09:00"};
  const latest={...entry([forecast("A","small")]),capturedAt:"2026-09-17T14:00:00+09:00"};
  const tooLate={...entry([forecast("A","large")]),asOf:"2026-09-18",capturedAt:"2026-09-18T14:00:00+09:00"};
  const actual=sample("a","A");
  const result=evaluate([old,tooLate,early,latest],[actual]);
  assert.equal(result.rows.length,1);assert.equal(result.rows[0].predicted,"small");
  assert.equal(evaluate([old,tooLate],[actual]).rows.length,0);
  assert.equal(evaluate([old],[actual],{leadDays:4}).rows.length,1);
  const unavailable=forecast("A","unknown");unavailable.prediction.readyDate=null;
  const newest={...entry([unavailable]),capturedAt:"2026-09-17T15:00:00+09:00"};
  assert.equal(evaluate([early,newest],[actual]).rows.length,0,"must not cherry-pick an older available prediction");
  assert.throws(()=>evaluate([early],[actual],{leadDays:0}));
});

test("future outcomes, unpublished outcomes and weak partial-bed labels are excluded",()=>{
  const saved=entry([forecast("A")]),actual=sample("a","A");
  for(const [change,options] of [
    [{},{asOf:"2026-09-20T23:59:00+09:00"}],
    [{availableAt:"2026-09-26T00:00:00+09:00"},{}],
    [{availableAt:"2026-09-25T12:00:00+09:00"},{}],
    [{availableAt:"not-an-instant"},{}],
    [{signalKind:"partial-bed"},{}],
    [{partialHarvest:true,positionKnown:false},{}]
  ]) assert.equal(evaluate([saved],[{...actual,...change}],options).rows.length,0);
  assert.equal(evaluate([saved],[{...actual,signalKind:"partial-position",positionKnown:true}]).rows.length,1);
});

test("planting knowledge, declared prediction time and frozen training time respect the saved origin",()=>{
  const saved=entry([forecast("A")]);
  saved.payload.asOf="2026-09-17T10:00:00+09:00";
  saved.payload.modelTrainedAsOf="2026-09-16T10:00:00+09:00";
  const actual={...sample("a","A"),plantingAvailableAt:"2026-09-17T09:59:59+09:00"};
  assert.equal(evaluate([saved],[actual]).rows.length,1);
  assert.equal(evaluate([saved],[{...actual,plantingAvailableAt:saved.payload.asOf}]).rows.length,0);
  for(const payload of [
    {...saved.payload,asOf:"2026-09-16T10:00:00+09:00"},
    {...saved.payload,asOf:"2026-09-17T13:00:00+09:00"},
    {...saved.payload,asOf:"2026-09-17T24:00:00+09:00"},
    {...saved.payload,modelTrainedAsOf:"2026-09-17T10:30:00+09:00"},
    {...saved.payload,modelTrainedAsOf:"2026-09-18T00:00:00+09:00"},
    {...saved.payload,modelTrainedAsOf:"unknown"},
    {...saved.payload,model:{trainedAt:"2026-09-18T00:00:00+09:00"}}
  ]) assert.equal(evaluate([{...saved,payload}],[actual]).rows.length,0);
  assert.equal(evaluate([entry([forecast("A")])],[sample("a","A")]).rows.length,1,"old payloads without timestamp fields stay usable with a stated limitation");
});

test("every matching position cohort contributes while one crop retains one independent weight",()=>{
  const first=forecast("A","normal"),second={...forecast("A","small"),palletKeys:["2-A-2"]};
  const third=forecast("B","normal");
  const actualA={...sample("a","A"),palletKeys:["2-A-1","2-A-2"]};
  const result=evaluate([entry([first,second,third])],[actualA,sample("b","B")]);
  assert.equal(result.rows.length,3);assert.equal(result.metrics.independentCrops,2);
  assert.equal(result.metrics.accuracy,.75);
  assert.deepEqual(Array.from(result.rows.filter(row=>row.groupId==="a"),row=>row.predicted),["normal","small"]);
  assert.equal(new Set(result.rows.map(row=>row.id)).size,3);
  const duplicates=evaluate([entry([first,second,second,third])],[actualA,actualA,sample("b","B")]);
  assert.equal(duplicates.rows.length,3);assert.equal(duplicates.metrics.accuracy,.75);
  const missing=evaluate([entry([first])],[actualA]);
  assert.equal(missing.rows.length,0);assert.equal(missing.excluded.incompleteCoverage,1);
});

test("new cohort IDs cannot match a different planting event and ISO string samples remain compatible",()=>{
  const actual={...sample("a","A"),plantingEventId:42,date:"2026-09-20",plantingDate:"2026-08-20"};
  const wrong={...forecast("A"),plantingEventId:43};
  assert.equal(evaluate([entry([wrong])],[actual]).rows.length,0);
  assert.equal(evaluate([entry([{...wrong,plantingEventId:42}])],[actual]).rows.length,1);
  assert.equal(evaluate([entry([forecast("A")])],[actual]).rows.length,1,"legacy cohorts without event IDs use the existing date and pallet match");
});

test("a different planned date cannot score size or invent a missing ready-date label", () => {
  const saved = forecast("A"); saved.targetDate = "2026-09-21";
  const actual = sample("a","A"); actual.readyDate = "";
  assert.equal(evaluate([entry([saved])],[actual]).rows.length,0);
});
