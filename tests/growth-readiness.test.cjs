"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {resolve} = require("../src/scripts/growth-readiness.js");
const scope = {plantingEventId:10,plantingDate:"2026-09-01",palletKeys:["2-A-1","2-A-2","2-A-3"],harvestDate:"2026-09-25"};
const row = (id,keys,date,extra={}) => ({observationId:id,kind:"ready",plantingEventId:10,plantingDate:"2026-09-01",
  palletKeys:keys,readyDate:date,createdAt:"2026-09-20T01:00:00Z",updatedAt:"2026-09-20T01:00:00Z",deletedAt:"",revision:1,...extra});

test("different observed ready dates and unknown pallets remain separate instead of a median",()=>{
  const result=resolve({...scope,observations:[row("a",["2-A-1"],"2026-09-18"),row("b",["2-A-2"],"2026-09-20")]});
  assert.deepEqual(result.map(group=>[group.palletKeys,group.readyDate]),[[["2-A-1"],"2026-09-18"],[["2-A-2"],"2026-09-20"],[["2-A-3"],""]]);
  assert.deepEqual(result[0].observationIds,["a"]); assert.equal(result[0].availableAt,"2026-09-20T01:00:00.000Z");
});
test("the exact planting event and date prevent inheritance from earlier crops or neighbouring pallets",()=>{
  const result=resolve({...scope,observations:[row("a",["2-A-1"],"2026-09-20",{plantingEventId:9}),
    row("b",["2-A-2"],"2026-09-20",{plantingDate:"2026-08-31"}),row("c",["2-B-1"],"2026-09-20"),
    row("d",["2-A-3"],"2026-09-20",{kind:"fieldAssessment"})]});
  assert.deepEqual(result,[{palletKeys:scope.palletKeys,readyDate:"",availableAt:"",observationIds:[]}]);
});
test("manual takes precedence, none suppresses inheritance, auto uses independent observations",()=>{
  const input={...scope,observations:[row("a",scope.palletKeys,"2026-09-20")]};
  const manual={mode:"manual",date:"2026-09-22",availableAt:"2026-09-26T03:00:00+09:00"};
  assert.equal(resolve({...input,manual})[0].readyDate,"2026-09-22");
  assert.equal(resolve({...input,manual})[0].availableAt,"2026-09-25T18:00:00.000Z");
  assert.equal(resolve({...input,manual:{mode:"none"}})[0].readyDate,"");
  assert.equal(resolve({...input,manual:{mode:"auto",date:"2026-09-22"}})[0].readyDate,"2026-09-20");
  for(const date of ["","2026-09-31","2026-08-31","2026-09-26"]){ assert.equal(resolve({...input,manual:{...manual,date}})[0].readyDate,""); }
  assert.equal(resolve({...input,manual:{...manual,availableAt:""}})[0].readyDate,"");
});
test("group availability is the last observation update, not the backdated ready date",()=>{
  const observations=[row("a",["2-A-1"],"2026-09-19"),row("b",["2-A-2"],"2026-09-19",{updatedAt:"2026-09-23T15:30:00Z"})];
  const latest=resolve({...scope,observations}); assert.deepEqual(latest[0].palletKeys,["2-A-1","2-A-2"]);
  assert.equal(latest[0].availableAt,"2026-09-23T15:30:00.000Z"); assert.deepEqual(latest[0].observationIds,["a","b"]);
  const past=resolve({...scope,observations,asOf:"2026-09-23"}); assert.deepEqual(past[0].palletKeys,["2-A-1"]);
  assert.deepEqual(past[1].palletKeys,["2-A-2","2-A-3"]);
});
test("deleted/modified current rows cannot recreate a historical ready observation",()=>{
  const old=row("a",scope.palletKeys,"2026-09-19");
  const removed={...old,revision:2,updatedAt:"2026-09-25T00:00:00Z",deletedAt:"2026-09-25T00:00:00Z"};
  assert.equal(resolve({...scope,observations:[removed],asOf:"2026-09-23"})[0].readyDate,"");
  assert.equal(resolve({...scope,observations:[old,removed],asOf:"2026-09-23"})[0].readyDate,"");
  assert.equal(resolve({...scope,observations:[removed,old],asOf:"2026-09-23"})[0].readyDate,"");
  const corrected={...removed,deletedAt:"",readyDate:"2026-09-21"};
  assert.equal(resolve({...scope,observations:[old,corrected],asOf:"2026-09-23"})[0].readyDate,"");
});
test("a later explicit observation wins per pallet, while equal-time disagreements remain unknown",()=>{
  const a=row("a",["2-A-1","2-A-2"],"2026-09-18"), b=row("b",["2-A-2"],"2026-09-20",{updatedAt:"2026-09-21T01:00:00Z"});
  const result=resolve({...scope,observations:[a,b]});
  assert.deepEqual(result.map(group=>[group.palletKeys,group.readyDate]),[[["2-A-1"],"2026-09-18"],[["2-A-2"],"2026-09-20"],[["2-A-3"],""]]);
  const conflict=resolve({...scope,observations:[a,{...b,updatedAt:a.updatedAt}]});
  assert.deepEqual(conflict.find(group=>!group.readyDate).palletKeys,["2-A-2","2-A-3"]);
});
test("input remains unchanged, boundaries are validated and every selected pallet appears once",()=>{
  const input={...scope,palletKeys:["2-A-3","2-A-1","2-A-1"],observations:[row("a",["2-A-1","2-A-2","2-A-1"],"2026-09-20")]};
  const before=JSON.stringify(input), result=resolve(input); assert.equal(JSON.stringify(input),before);
  assert.deepEqual(result.flatMap(group=>group.palletKeys),["2-A-1","2-A-3"]);
  assert.deepEqual(resolve({...scope,palletKeys:[]}),[]);
  assert.throws(()=>resolve({...scope,asOf:"garbage"})); assert.throws(()=>resolve({...scope,palletKeys:["2-A-79"]}));
  assert.throws(()=>resolve({...scope,harvestDate:"2026-08-31"}));
  assert.equal(resolve({...scope,observations:[row("a",scope.palletKeys,"2026-09-26")]})[0].readyDate,"");
  assert.equal(resolve({...scope,observations:[row("a",scope.palletKeys,"2026-09-21")],asOf:"2026-09-20"})[0].readyDate,"");
});
