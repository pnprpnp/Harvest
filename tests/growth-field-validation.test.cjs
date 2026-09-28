"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const field=require("../src/scripts/growth-field-validation.js");
const asOf="2026-09-28T12:00:00+09:00";
const sample=(extra={})=>({id:"harvest",groupId:"h1",plantingEventId:1,plantingDate:"2026-09-01",date:"2026-09-25",
  palletKeys:["2-A-1","2-A-2"],sizeRating:"large",symptoms:{elongated:"many",uneven:"none",tipburn:"unknown"},...extra});
const assessment=(date,size="small",extra={})=>({observationId:`assessment:${date}`,kind:"fieldAssessment",
  plantingEventId:1,plantingDate:"2026-09-01",date,palletKeys:["2-A-1","2-A-2"],
  payload:{size,quality:{elongated:"low",uneven:"none",tipburn:"unknown"}},
  createdAt:date+"T09:00:00+09:00",updatedAt:date+"T09:00:00+09:00",...extra});

test("small to normal to large is a chronological trajectory, never an error or teacher",()=>{
  const samples=[sample()],observations=[assessment("2026-09-10"),assessment("2026-09-18","normal")];
  const original=JSON.stringify({samples,observations});
  const result=field.evaluate({samples,observations,asOf});
  assert.equal(result.trainingEligible,false);
  assert.equal(result.status,"insufficient-data");
  assert.equal(result.summary.independentCrops,1);
  assert.deepEqual(result.trajectories[0].events.map(row=>row.size),["small","normal","large"]);
  assert.ok(result.trajectories[0].comparisons.every(row=>row.error===false&&row.trainingEligible===false));
  assert.equal(result.summary.size.increased,2);
  assert.equal(result.summary.quality.tipburn.unknown,2);
  assert.equal(result.summary.quality.elongated.increased,2);
  assert.equal(JSON.stringify({samples,observations}),original);
});

test("only exact planting event/date and intersecting pallets are compared",()=>{
  const observations=[assessment("2026-09-10","small",{palletKeys:["2-A-1"]}),
    assessment("2026-09-11","normal",{observationId:"other-event",plantingEventId:2}),
    assessment("2026-09-12","normal",{observationId:"other-date",plantingDate:"2026-08-31"}),
    assessment("2026-09-13","normal",{observationId:"other-pallet",palletKeys:["2-B-1"]})];
  const result=field.evaluate({samples:[sample()],observations,asOf});
  const pairs=result.trajectories.flatMap(row=>row.comparisons);
  assert.equal(pairs.length,1);
  assert.deepEqual(pairs[0].palletKeys,["2-A-1"]);
  assert.equal(result.summary.independentCrops,1);
});

test("ready and selective partial harvest remain different endpoints; unknown positions are excluded",()=>{
  const observations=[assessment("2026-09-10"),{...assessment("2026-09-20"),kind:"ready",readyDate:"2026-09-20",observationId:"ready"}];
  const samples=[sample({readyDate:"2026-09-20"}),sample({id:"partial",date:"2026-09-18",signalKind:"partial-position",palletKeys:["2-A-1"]}),
    sample({id:"weak",signalKind:"partial-bed",palletKeys:[]})];
  const result=field.evaluate({samples,observations,asOf});
  assert.deepEqual(result.summary.endpointKinds,{partialHarvest:1,ready:1,harvest:1});
  assert.equal(result.summary.size.selectivePartialLarge,1);
  assert.equal(result.summary.size.notASizeLabel,1);
  assert.equal(result.excluded.unknownPosition,1);
  assert.equal(result.summary.independentCrops,1);
});

test("future revisions, unavailable harvests and deleted observations do not enter review",()=>{
  const original=assessment("2026-09-10");
  const deleted={...original,deletedAt:"2026-09-20T12:00:00+09:00",updatedAt:"2026-09-20T12:00:00+09:00",revision:2};
  const future=assessment("2026-09-11","normal",{updatedAt:"2026-09-30T12:00:00+09:00"});
  const result=field.evaluate({samples:[sample({availableAt:"2026-10-01T00:00:00+09:00"})],observations:[original,deleted,future],asOf});
  assert.equal(result.trajectories.length,0);
  assert.equal(result.summary.independentCrops,0);
});

test("same day disagreement and later shrinking are review descriptions, not false-error statistics",()=>{
  const observations=[assessment("2026-09-25","large")];
  const samples=[sample({sizeRating:"normal",availableAt:"2026-09-25T12:00:00+09:00"}),
    sample({id:"later",date:"2026-09-26",sizeRating:"small",symptoms:{elongated:"none"}})];
  const result=field.evaluate({samples,observations,asOf});
  assert.equal(result.summary.size.sameDayDifference,1);
  assert.equal(result.summary.size.decreased,1);
  assert.ok(result.trajectories[0].comparisons.every(row=>row.error===false));
});

test("twenty independent crops only permit reference review, never training promotion",()=>{
  const samples=Array.from({length:20},(_,i)=>sample({id:`h${i}`,plantingEventId:i+1}));
  const observations=Array.from({length:20},(_,i)=>assessment("2026-09-10","small",{observationId:`a${i}`,plantingEventId:i+1}));
  const result=field.evaluate({samples,observations,asOf});
  assert.equal(result.summary.independentCrops,20);
  assert.equal(result.status,"reference");
  assert.equal(result.trainingEligible,false);
  const bounded=field.evaluate({samples,observations,asOf,maxCrops:3});
  assert.equal(bounded.summary.independentCrops,3);
  assert.equal(bounded.truncated.crops,17);
});
