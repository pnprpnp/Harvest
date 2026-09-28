"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const similarity=require("../src/scripts/growth-similarity.js");
const engine=require("../src/scripts/growth-model.js");
const asOf="2026-09-20T12:00:00+09:00";
const input={plantingEventId:900,plantingDate:"2026-09-01",building:2,bed:"A",palletKeys:["2-A-1"]};
const sample=(extra={})=>({id:"harvest1",plantingEventId:1,plantingDate:"2025-09-01",date:"2025-09-28",
  building:2,bed:"A",palletKeys:["2-A-1"],sizeRating:"normal",readyDate:"2025-09-25",...extra});
const weather=(start,count,extra={})=>Array.from({length:count},(_,i)=>({date:engine.addDays(start,i),source:"observation",meanTemp:20,sunshineHours:6,lightIndex:0.5,...extra}));
const weatherDaily=weather("2025-09-01",30).concat(weather("2026-09-01",30));
const index=extra=>similarity.createIndex({samples:[sample()],weatherDaily,asOf,engine,...extra});
const field=(plantingEventId,plantingDate,date,size="normal",extra={})=>({observationId:`${plantingEventId}:${date}`,kind:"fieldAssessment",plantingEventId,plantingDate,
  palletKeys:["2-A-1"],date,payload:{size,quality:{elongated:"none",uneven:"none",tipburn:"unknown"}},
  createdAt:date+"T09:00:00+09:00",updatedAt:date+"T09:00:00+09:00",...extra});

test("same-age observed temperature/sunshine and season select transparent reference cases",()=>{
  const result=similarity.find({index:index(),input});
  assert.equal(result.matches.length,1);
  const match=result.matches[0];
  assert.equal(match.ageDays,19);
  assert.equal(match.comparisonDate,"2025-09-20");
  assert.equal(match.differences.temperatureC,0);
  assert.equal(match.differences.lightKind,"sunshine");
  assert.equal(match.location,"sameBed");
  assert.equal(result.trainingEligible,false);
  assert.equal(result.criteria.calibrated,false);
});

test("post-matched-age weather, interim observations, and harvest labels cannot alter selection",()=>{
  const first=similarity.find({index:index(),input});
  const poisoned=weatherDaily.map(row=>row.date>="2025-09-20"&&row.date<"2026-01-01"?{...row,meanTemp:50,sunshineHours:0}:row);
  const second=similarity.find({index:index({samples:[sample({sizeRating:"large",readyDate:"2025-09-22",symptoms:{tipburn:"many"}})],
    weatherDaily:poisoned,observations:[field(1,"2025-09-01","2025-09-21","small")]}),input});
  assert.deepEqual(second.matches.map(({outcomes,...rest})=>rest),first.matches.map(({outcomes,...rest})=>rest));
  assert.equal(second.matches[0].outcomes[0].size,"large");
});

test("historical features ignore later-entered revisions and future completed outcomes",()=>{
  const observations=[field(1,"2025-09-01","2025-09-10","small",{updatedAt:"2026-08-01T12:00:00+09:00"}),
    field(900,"2026-09-01","2026-09-10","large")];
  const result=similarity.find({index:index({observations,samples:[sample(),sample({id:"future",plantingEventId:2,date:"2026-10-01"}),
    sample({id:"unavailable",plantingEventId:3,availableAt:"2026-10-01T00:00:00+09:00"})]}),input});
  assert.equal(result.matches.length,1);
  assert.equal(result.matches[0].differences.fieldPeriods,0);
});

test("available field trajectories compare matching age thirds without treating unknown as absence",()=>{
  const observations=[field(1,"2025-09-01","2025-09-04","small"),field(1,"2025-09-01","2025-09-10","normal"),
    field(900,"2026-09-01","2026-09-04","small"),field(900,"2026-09-01","2026-09-10","normal")];
  const result=similarity.find({index:index({observations}),input});
  assert.equal(result.matches[0].differences.fieldPeriods,2);
  assert.equal(result.matches[0].differences.field,0);
});

test("normal and special-condition crops are separated and unknown legacy specials are withheld",()=>{
  const condition={observationId:"condition1",kind:"condition",building:2,bed:"A",palletKeys:[],
    startDate:"2025-09-05",endDate:"2025-09-25",payload:{type:"equipmentFailure",dataPolicy:"exclude"},
    createdAt:"2025-09-05T09:00:00+09:00",updatedAt:"2025-09-05T09:00:00+09:00"};
  assert.equal(similarity.find({index:index({observations:[condition]}),input}).matches.length,0);
  assert.equal(similarity.find({index:index({samples:[sample({special:true})]}),input}).matches.length,0);
  const current={...condition,observationId:"condition2",startDate:"2026-09-05",endDate:"",createdAt:"2026-09-05T09:00:00+09:00",updatedAt:"2026-09-05T09:00:00+09:00"};
  const result=similarity.find({index:index({observations:[condition,current]}),input});
  assert.deepEqual(result.matches[0].special,["equipmentFailure"]);
});

test("insufficient measured weather, distant temperature or season do not create guessed matches",()=>{
  assert.equal(similarity.find({index:index({weatherDaily:[]}),input}).matches.length,0);
  const hot=weatherDaily.map(row=>row.date.startsWith("2025")?{...row,meanTemp:35}:row);
  assert.equal(similarity.find({index:index({weatherDaily:hot}),input}).matches.length,0);
  const winter=sample({plantingDate:"2025-01-01",date:"2025-01-28"});
  assert.equal(similarity.find({index:index({samples:[winter],weatherDaily:weatherDaily.concat(weather("2025-01-01",30))}),input}).matches.length,0);
  const forecasts=weatherDaily.map(row=>({...row,source:"forecast",issuedAt:"2025-01-01T00:00:00+09:00",availableAt:"2025-01-01T00:00:00+09:00"}));
  assert.equal(similarity.find({index:index({weatherDaily:forecasts}),input}).matches.length,0);
});

test("one planting event is not repeated as multiple independent examples; full scope required",()=>{
  const samples=[sample(),sample({id:"other-bed",bed:"B",palletKeys:["2-B-1"]})];
  const result=similarity.find({index:index({samples}),input});
  assert.equal(result.matches.length,1);
  assert.equal(result.matches[0].bed,"A");
  assert.equal(similarity.find({index:index(),input:{...input,palletKeys:[]}}).matches.length,0);
});

test("proxy light is explicit, observed sun wins and historical publication cutoff is enforced",()=>{
  const proxy=weatherDaily.map(({sunshineHours,...row})=>row);
  assert.equal(similarity.find({index:index({weatherDaily:proxy}),input}).matches[0].differences.lightKind,"light");
  const unavailable=weatherDaily.map(row=>row.date.startsWith("2025")?{...row,availableAt:"2025-09-21T00:00:00+09:00"}:row);
  assert.equal(similarity.find({index:index({weatherDaily:unavailable}),input}).matches.length,0);
});
