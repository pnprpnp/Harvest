"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {createHash} = require("node:crypto");
const plain = value => JSON.parse(JSON.stringify(value));
const uuid = number => `10000000-0000-4000-8000-${String(number).padStart(12,"0")}`;
const observation = (number = 1, extra = {}) => ({ observationId:uuid(number), plantingEventId:1,
  plantingDate:"2026-08-20", palletKeys:["2-A-2","2-A-1"], readyDate:"2026-09-20",
  createdAt:"2026-09-20T01:00:00.000Z", updatedAt:"2026-09-20T01:00:00.000Z", deletedAt:"", baseRevision:0, ...extra });
const request = (mutations = [], extra = {}) => ({ app:"Harvestnavi", action:"syncGrowthObservations",
  protocolVersion:1, mutations, cursor:0, limit:200, ...extra });

function setup(){
  let locked = false, reads = 0, writes = 0, flushed = 0;
  const sheets = new Map();
  class Sheet {
    constructor(name){ this.name = name; this.rows = []; this.columns = 26; }
    getLastRow(){ return this.rows.length; }
    getMaxColumns(){ return this.columns; }
    insertColumnsAfter(_column,count){ this.columns += count; }
    setFrozenRows(){}
    getRange(row,column,height,width){
      const sheet = this;
      return {
        getValues(){
          assert.equal(locked,true,"sheet read must be locked"); reads++;
          return Array.from({length:height},(_,r)=>Array.from({length:width},(_,c)=>sheet.rows[row+r-1]?.[column+c-1]??""));
        },
        setValues(values){
          assert.equal(locked,true,"sheet write must be locked"); writes++;
          values.forEach((values,r)=>{sheet.rows[row+r-1] ||= []; values.forEach((value,c)=>sheet.rows[row+r-1][column+c-1]=value);});
          return this;
        }, setNumberFormat(){ return this; }, setFontWeight(){ return this; }
      };
    }
  }
  const properties = { HARVEST_API_TOKEN:"admin-"+"a".repeat(40), HARVEST_WORKER_API_TOKEN:"worker-"+"b".repeat(40) };
  const c = vm.createContext({ console, Set, Map, Date,
    LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})},
    SpreadsheetApp:{flush(){assert.equal(locked,true);flushed++;}},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key],getProperties:()=>({...properties})})},
    Utilities:{newBlob:text=>({getBytes:()=>Array.from(Buffer.from(text))}), DigestAlgorithm:{SHA_256:"sha256"}, Charset:{UTF_8:"utf8"},
      computeDigest:(_algorithm,text)=>Array.from(createHash("sha256").update(text).digest())},
    isHarvestRevisionFastCheckCandidate:()=>false,
    getSpreadsheet:()=>({ getSheetByName:name=>sheets.get(name)||null,
      insertSheet(name){assert.equal(locked,true);const sheet=new Sheet(name);sheets.set(name,sheet);return sheet;}})
  });
  for(const name of ["01-contract-and-schema.js","03-api-entry.js","04-request-normalization.js","05-write-safety.js","16-growth-observations.js"]){
    vm.runInContext(fs.readFileSync(path.join(__dirname,"../apps-script/src",name),"utf8"),c,{filename:name});
  }
  c.jsonResponse = value=>plain(value);
  return { c, sheets, properties, counters:()=>({reads,writes,flushed,locked}) };
}

test("ready sync uses a separate sheet, monotonic revision and original client clock",()=>{
  const {c,sheets,counters}=setup();
  const result=c.syncGrowthObservations(request([observation()]));
  assert.equal(result.accepted.length,1);
  const saved=result.accepted[0].observation;
  assert.equal(saved.kind,"ready");assert.equal(saved.revision,1);
  assert.equal(saved.updatedAt,observation().updatedAt);
  assert.ok(Date.parse(saved.syncedAt)>Date.parse(saved.updatedAt));
  assert.deepEqual(plain(saved.palletKeys),["2-A-1","2-A-2"]);
  assert.deepEqual([...sheets.keys()],["生育確認"]);
  assert.equal(result.nextCursor,1);assert.equal(result.hasMore,false);
  assert.equal(counters().locked,false);assert.equal(counters().flushed,1);
});

test("lost response retry is idempotent and stale different edits become conflicts",()=>{
  const {c,counters}=setup();
  c.syncGrowthObservations(request([observation()]));
  const before=counters().writes;
  const repeated=c.syncGrowthObservations(request([observation()]));
  assert.equal(repeated.accepted[0].observation.revision,1);assert.equal(counters().writes,before);
  const conflict=c.syncGrowthObservations(request([observation(1,{readyDate:"2026-09-21",updatedAt:"2026-09-21T01:00:00Z"})]));
  assert.equal(conflict.accepted.length,0);assert.equal(conflict.conflicts[0].server.readyDate,"2026-09-20");
  const missing=c.syncGrowthObservations(request([observation(2,{baseRevision:10})]));
  assert.equal(missing.conflicts[0].server,null);
});

test("CAS updates and tombstones retain history identity without clock-based last-write-wins",()=>{
  const {c}=setup();c.syncGrowthObservations(request([observation(1,{updatedAt:"2026-09-22T01:00:00Z"})]));
  const update=c.syncGrowthObservations(request([observation(1,{baseRevision:1,readyDate:"2026-09-21",updatedAt:"2026-09-21T01:00:00Z"})]));
  assert.equal(update.accepted[0].observation.revision,2,"CAS must not depend on device clock order");
  const removed=c.syncGrowthObservations(request([observation(1,{baseRevision:2,readyDate:"",deletedAt:"2026-09-22T01:00:00Z",updatedAt:"2026-09-22T01:00:00Z"})],{cursor:2}));
  assert.equal(removed.rows[0].revision,3);assert.ok(removed.rows[0].deletedAt);
  const repeat=c.syncGrowthObservations(request([observation(1,{baseRevision:2,readyDate:"",deletedAt:"2026-09-22T01:00:00Z",updatedAt:"2026-09-22T01:00:00Z"})]));
  assert.equal(repeat.accepted[0].observation.revision,3);
});

test("revision pages remain complete when a row is updated after an earlier page",()=>{
  const {c}=setup();c.syncGrowthObservations(request([observation(1),observation(2),observation(3)]));
  const first=c.syncGrowthObservations(request([],{limit:1}));
  assert.equal(first.nextCursor,1);assert.equal(first.hasMore,true);
  c.syncGrowthObservations(request([observation(1,{baseRevision:1,readyDate:"2026-09-21",updatedAt:"2026-09-21T01:00:00Z"})]));
  const rest=c.syncGrowthObservations(request([],{cursor:1}));
  assert.deepEqual(plain(rest.rows.map(row=>row.revision)),[2,3,4]);
  assert.equal(rest.nextCursor,4);assert.equal(rest.hasMore,false);
});

test("complete batch validation rejects malformed dates, keys and revisions before writing",()=>{
  for(const invalid of [
    {plantingEventId:-1},{plantingEventId:"1"},{plantingDate:"2026-02-30"},{readyDate:"2026-08-19"},
    {readyDate:"9999-01-01"},{palletKeys:["2-A-79"]},{palletKeys:["1-A-1"]},{palletKeys:[]},
    {baseRevision:-1},{revision:-1},{updatedAt:"2026-02-30T01:00:00Z"},{createdAt:"2026-09-20T24:00:00Z"},
    {observationId:"x".repeat(1000)},{readyDate:""}
  ]){
    const {c,sheets}=setup();
    assert.throws(()=>c.syncGrowthObservations(request([observation(1),observation(2,invalid)])));
    assert.equal(sheets.size,0);
  }
  const {c}=setup();
  assert.throws(()=>c.syncGrowthObservations(request(Array.from({length:51},(_,i)=>observation(i+1)))));
  assert.throws(()=>c.syncGrowthObservations(request([],{protocolVersion:2})));
  assert.throws(()=>c.syncGrowthObservations(request([],{cursor:-1})));
});

test("all typed observation kinds round-trip through the same CAS protocol",()=>{
  const {c}=setup();const common={createdAt:observation().createdAt,updatedAt:observation().updatedAt,deletedAt:"",baseRevision:0};
  const scope={building:2,bed:"A",palletKeys:[]};
  const values=[
    {...common,...scope,observationId:uuid(1),kind:"ec",date:"2026-09-20",payload:{value:1.4,unit:"mS/cm"}},
    {...common,...scope,observationId:uuid(2),kind:"condition",startDate:"2026-09-20",endDate:"",payload:{type:"equipmentFailure",dataPolicy:"exclude",note:"ポンプ停止"}},
    {...common,...scope,observationId:uuid(3),kind:"environment",startDate:"2026-09-20",endDate:"2027-01-01",payload:{temperature:"high",light:"low",humidity:"base",dataPolicy:"downweight"}},
    observation(4,{kind:"manualOffset",date:"2026-09-20",payload:{days:-2,sourcePredictionId:"prediction-1"}}),
    observation(5,{kind:"fieldAssessment",date:"2026-09-20",payload:{size:"small",quality:{tipburn:"none",uneven:"high"}}})
  ];
  const saved=c.syncGrowthObservations(request(values));assert.equal(saved.accepted.length,5);
  const rows=c.syncGrowthObservations(request()).rows;
  assert.deepEqual(plain(rows.map(row=>row.kind)),["ec","condition","environment","manualOffset","fieldAssessment"]);
  assert.equal(Object.hasOwn(rows[0].payload,"isAbnormal"),false);
  assert.equal(rows[4].payload.quality.elongated,"unknown");
  assert.equal(rows[2].endDate,"2027-01-01");
  assert.throws(()=>c.syncGrowthObservations(request([{...values[0],baseRevision:1,building:3}])));
});

test("typed scope and payload validation rejects missing environment traits and unsafe values",()=>{
  const {c}=setup();const base={...observation(),kind:"environment",building:2,bed:"A",startDate:"2026-09-20",endDate:"",payload:{temperature:"high",light:"low",humidity:"base",dataPolicy:"normal"}};
  for(const invalid of [
    {...base,payload:{temperature:"high",light:"low",dataPolicy:"normal"}},
    {...base,bed:"B"}, {...base,endDate:"2026-09-19"},
    {...base,kind:"ec",date:"2026-09-20",payload:{value:null,unit:"mS/cm"}},
    {...base,kind:"ec",date:"2026-09-20",payload:{value:51,unit:"mS/cm"}},
    {...base,payload:{...base.payload,unknown:true}},
    {...base,kind:"condition",payload:{type:"other",dataPolicy:"normal"}},
    {...base,kind:"condition",payload:{type:"other",dataPolicy:"exclude",note:"x".repeat(301)}}
  ]) assert.throws(()=>c.syncGrowthObservations(request([invalid])));
});

test("admin and worker existing tokens both authorize this API and invalid tokens never open a sheet",()=>{
  const {c,sheets,properties}=setup();
  for(const token of [properties.HARVEST_API_TOKEN,properties.HARVEST_WORKER_API_TOKEN]){
    const result=c.doPost({postData:{contents:JSON.stringify({...request(),token})}});
    assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.protocolVersion,1);
  }
  const isolated=setup();
  const result=isolated.c.doPost({postData:{contents:JSON.stringify({...request(),token:"wrong"})}});
  assert.equal(result.ok,false);assert.equal(isolated.sheets.size,0);assert.equal(sheets.size,1);
});

test("malformed sheet headers fail safely and lock is always released",()=>{
  const {c,sheets,counters}=setup();c.syncGrowthObservations(request());
  sheets.get("生育確認").rows[0][0]="unrelated";
  assert.throws(()=>c.syncGrowthObservations(request([observation()])));
  assert.equal(counters().locked,false);assert.equal(sheets.get("生育確認").rows.length,1);
});
