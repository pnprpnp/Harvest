"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const management = require("../src/scripts/growth-management.js");
const model = require("../src/scripts/growth-model.js");
const copy = value => JSON.parse(JSON.stringify(value));
const snapshot = (version,method = "legacy") => ({schemaVersion:2,modelVersion:version,
  createdAt:"2026-09-20T00:00:00.000Z",trainedAsOf:"2026-09-20T00:00:00.000Z",method,
  parameters:{id:"standard",temperaturePower:1,lightPower:1},
  coefficients:{farmTarget:30,prior:30,byBuilding:{},byBed:{},bySeason:{},byPosition:{},independentCrops:0,
    anchorCount:0,labelledCount:0,window:{lower:.88,upper:1.12,learned:false},legacyTargets:null,legacyGlobalTarget:30},
  training:{startDate:null,endDate:null,sampleCount:0,features:["temperature","sunshineProxy"]},
  validation:{methods:{},selection:{requiresApproval:true},rows:{[method]:[]}}});

function setup(){
  const data = new Map();let role = "admin",time = Date.parse("2026-09-22T00:00:00Z"),writes = 0,fail = false;
  const storage = {readJson:(key,fallback) => data.has(key) ? copy(data.get(key)) : fallback,
    writeJson(key,value){ if(fail) throw new Error("quota"); data.set(key,copy(value)); writes++; }};
  const create = extras => management.create({storage,getRole:() => role,now:() => time,...extras});
  return {registry:create(),data,create,storage,setRole:value => role=value,advance:() => time+=120000,
    failWrites:value => fail=value,getWrites:() => writes};
}
function baseline(registry){ registry.initialBaseline(snapshot("legacy-initial")); }
function candidate(registry,id="candidate-1",eligible=true){ return registry.registerCandidate(snapshot(id,"adaptive"),{eligible,dataSignature:"labels-1"}); }

test("candidate registration and evidence changes never switch the initial legacy model",()=>{
  const {registry}=setup();baseline(registry);
  assert.equal(registry.getActiveSnapshot().method,"legacy");
  candidate(registry);
  registry.recordEvaluation("labels-1",{candidateId:"candidate-1",improved:true});
  assert.equal(registry.needsEvaluation("labels-1"),false);
  assert.equal(registry.needsEvaluation("labels-2"),true);
  assert.equal(registry.getState().activeId,"legacy-initial");
  assert.equal(registry.getState().candidateId,"candidate-1");
  assert.equal(registry.initialBaseline(snapshot("different-legacy")).id,"legacy-initial");
  assert.throws(()=>registry.adopt("candidate-1"),/承認/);
  assert.throws(()=>registry.adopt("candidate-1",{explicit:false}),/承認/);
  registry.adopt("candidate-1",{explicit:true});
  assert.equal(registry.getState().activeId,"candidate-1");
  assert.equal(registry.getState().candidateId,null);
  assert.equal(registry.getState().history.at(-1).type,"adopt");
});

test("unvalidated candidates stay in shadow and cannot bypass the adoption gate via rollback",()=>{
  const {registry}=setup();baseline(registry);candidate(registry,"unvalidated",false);
  registry.setShadowMode(true);
  assert.equal(registry.getState().shadowEnabled,true);
  assert.equal(registry.getCandidateSnapshot().modelVersion,"unvalidated");
  assert.throws(()=>registry.adopt("unvalidated",{explicit:true}),/検証条件/);
  assert.throws(()=>registry.rollback("unvalidated",{explicit:true}),/未採用/);
  assert.equal(registry.getActiveSnapshot().modelVersion,"legacy-initial");
});

test("adoption requires the currently selected candidate and latest recorded teacher-data signature",()=>{
  const {registry}=setup();baseline(registry);candidate(registry,"old-candidate");
  registry.recordEvaluation("labels-1",{accepted:true});
  registry.recordEvaluation("labels-2",{accepted:false});
  assert.throws(()=>registry.adopt("old-candidate",{explicit:true}),/教師データ/);
  assert.equal(registry.getState().activeId,"legacy-initial");
  registry.registerCandidate(snapshot("new-candidate","adaptive"),{eligible:true,dataSignature:"labels-2"});
  assert.throws(()=>registry.adopt("old-candidate",{explicit:true}),/現在の採用候補/);
  registry.adopt("new-candidate",{explicit:true});
  assert.equal(registry.getState().activeId,"new-candidate");
  registry.recordEvaluation("labels-3",{accepted:false});
  registry.rollback("legacy-initial",{explicit:true});
  registry.rollback("new-candidate",{explicit:true});
  assert.equal(registry.getState().activeId,"new-candidate","explicit rollback to an adopted generation is unaffected");
});

test("candidate selection stays mandatory when no evaluation signature has been stored yet",()=>{
  const {registry}=setup();baseline(registry);candidate(registry,"a");candidate(registry,"b");
  assert.throws(()=>registry.adopt("a",{explicit:true}),/現在の採用候補/);
  registry.adopt("b",{explicit:true});
  assert.equal(registry.getState().activeId,"b");
});

test("rollback needs approval, preserves every model, and records adoption intervals without a reason",()=>{
  const env=setup(),{registry}=env;baseline(registry);candidate(registry);env.advance();
  registry.adopt("candidate-1",{explicit:true});env.advance();
  assert.throws(()=>registry.rollback("legacy-initial"),/承認/);
  registry.rollback("legacy-initial",{explicit:true});
  const state=registry.getState();assert.equal(state.generations.length,2);
  const initial=state.generations.find(row=>row.id==="legacy-initial");
  assert.equal(initial.activePeriods.length,2);assert.ok(initial.activePeriods[0].to);
  assert.equal(initial.activePeriods[1].to,null);
  assert.deepEqual(Object.keys(state.history.at(-1)).sort(),["at","from","id","to","type"]);
  assert.equal(state.history.at(-1).from,"candidate-1");assert.equal(state.history.at(-1).to,"legacy-initial");
});

test("runtime failure falls back to last successful then legacy and automatically retries the adopted version",()=>{
  const env=setup(),{registry}=env;baseline(registry);
  registry.runWithFallback(s=>({version:s.modelVersion}));
  candidate(registry,"a");registry.adopt("a",{explicit:true});env.advance();
  registry.runWithFallback(s=>({version:s.modelVersion}));
  candidate(registry,"b");registry.adopt("b",{explicit:true});env.advance();
  const attempted=[];
  const fallback=registry.runWithFallback(s=>{attempted.push(s.modelVersion);if(s.modelVersion==="b")throw new Error("broken coefficients");return {version:s.modelVersion};});
  assert.deepEqual(attempted,["b","a"]);assert.equal(fallback.fallback,true);
  assert.equal(fallback.label,"現在フォールバック中");assert.equal(fallback.modelId,"a");
  assert.equal(registry.getState().activeId,"b");
  const legacy=registry.runWithFallback(s=>{if(s.method!=="legacy")throw new Error("engine");return {version:s.modelVersion};});
  assert.equal(legacy.modelId,"legacy-initial");assert.equal(registry.getState().activeId,"b");
  const recovered=registry.runWithFallback(s=>({version:s.modelVersion}));
  assert.equal(recovered.modelId,"b");assert.equal(recovered.fallback,false);
  const failed=registry.runWithFallback(()=>{throw new Error("unavailable");});
  assert.equal(failed.value,null);assert.ok(failed.lastWorkingAt);assert.equal(registry.getState().activeId,"b");
});

test("runtime success is usable even if storage fails and repeated inference does not rewrite the registry",()=>{
  const env=setup(),{registry}=env;baseline(registry);
  registry.runWithFallback(()=>({value:1}));const writes=env.getWrites();
  for(let i=0;i<48;i++) registry.runWithFallback(()=>({value:i}));
  assert.equal(env.getWrites(),writes);
  env.advance();env.failWrites(true);
  const result=registry.runWithFallback(()=>({value:2}));
  assert.equal(result.value.value,2);assert.equal(result.storageError,"quota");
  assert.equal(registry.getState().activeId,"legacy-initial");
});

test("model identity is immutable, returned objects are defensive and raw records are rejected",()=>{
  const {registry}=setup();baseline(registry);candidate(registry);
  const changed=snapshot("candidate-1","adaptive");changed.coefficients.farmTarget=100;
  assert.throws(()=>registry.registerCandidate(changed,{eligible:true}),/同じモデル版/);
  const out=registry.getActiveSnapshot();out.coefficients.farmTarget=999;
  assert.equal(registry.getActiveSnapshot().coefficients.farmTarget,30);
  assert.throws(()=>registry.registerCandidate({...snapshot("with-weather"),weatherDaily:[]}),/構造/);
  const invalid=snapshot("nested-records");invalid.validation.sourceRecords=[];
  assert.throws(()=>registry.registerCandidate(invalid),/元記録/);
  invalid.validation={};invalid.coefficients.farmTarget=Infinity;
  assert.throws(()=>registry.registerCandidate(invalid),/有限/);
});

test("role namespaces and failed writes preserve prior durable and cached state",()=>{
  const env=setup(),{registry}=env;baseline(registry);candidate(registry);env.failWrites(true);
  assert.throws(()=>registry.adopt("candidate-1",{explicit:true}),/quota/);
  assert.equal(registry.getState().activeId,"legacy-initial");
  env.failWrites(false);env.setRole("worker");assert.equal(registry.getActiveSnapshot(),null);
  registry.initialBaseline(snapshot("worker-legacy"));
  env.setRole("admin");assert.equal(registry.getActiveSnapshot().modelVersion,"legacy-initial");
  assert.equal(env.create().getActiveSnapshot().modelVersion,"legacy-initial");
});

test("generation merge preserves local active choice and requires explicit conflict resolution",()=>{
  const a=setup(),b=setup();baseline(a.registry);
  const imported=b.registry.mergeBackup(a.registry.exportBackup());
  assert.deepEqual(imported.added,["legacy-initial"]);assert.equal(b.registry.getActiveSnapshot(),null);
  const index=b.registry.getState().conflicts.findIndex(row=>row.type==="activeChoice");
  assert.throws(()=>b.registry.resolveActiveConflict(index,{}));
  b.registry.resolveActiveConflict(index,{explicit:true});
  assert.equal(b.registry.getActiveSnapshot().modelVersion,"legacy-initial");
  candidate(a.registry);a.registry.adopt("candidate-1",{explicit:true});
  b.registry.mergeBackup(a.registry.exportBackup());
  assert.equal(b.registry.getState().activeId,"legacy-initial");
  assert.equal(b.registry.getState().generations.length,2);
  const pending=b.registry.getState().conflicts.findIndex(row=>row.type==="activeChoice"&&!row.resolvedAt);
  b.registry.resolveActiveConflict(pending,{explicit:true,keepLocal:true});
  assert.equal(b.registry.getState().activeId,"legacy-initial");
});

test("same-version divergent backup snapshots remain visible conflicts and never overwrite",()=>{
  const a=setup(),b=setup();baseline(a.registry);baseline(b.registry);
  candidate(a.registry);const other=snapshot("candidate-1","adaptive");other.coefficients.farmTarget=31;
  b.registry.registerCandidate(other,{eligible:true,dataSignature:"labels-1"});
  const result=a.registry.mergeBackup(b.registry.exportBackup());
  assert.equal(result.conflicts.filter(row=>row.type==="generation").length,1);
  assert.equal(a.registry.getGeneration("candidate-1").modelSnapshot.coefficients.farmTarget,30);
  assert.throws(()=>a.registry.adopt("candidate-1",{explicit:true}),/競合/);
  a.registry.mergeBackup(b.registry.exportBackup());
  assert.equal(a.registry.getState().conflicts.filter(row=>row.type==="generation").length,1);
});

test("exported coefficients hydrate through runtime without learning or storing source weather",()=>{
  const env=setup();baseline(env.registry);
  const trained=model.fit([],{asOf:"2026-09-22",weatherDaily:[],validation:false,selectedMethod:"safe"});
  const saved=model.exportModel(trained,{modelVersion:"exported-safe"});
  env.registry.registerCandidate(saved,{eligible:true,dataSignature:"empty-fixture"});
  env.registry.adopt(saved.modelVersion,{explicit:true});
  const result=env.registry.runWithFallback(s=>model.hydrateModel(s,{asOf:"2026-09-23",weatherDaily:[]}));
  assert.equal(result.fallback,false);assert.equal(result.value.restored,true);
  assert.deepEqual(result.value.samples,[]);assert.equal(result.modelVersion,"exported-safe");
  assert.equal(JSON.stringify(env.registry.exportBackup()).includes("weatherDaily"),false);
});

test("capacity errors do not delete earlier generations or activate a candidate",()=>{
  const env=setup();baseline(env.registry);
  const restricted=env.create({maxRegistryCharacters:JSON.stringify(env.registry.exportBackup()).length+10});
  assert.throws(()=>candidate(restricted),/保存容量/);
  assert.equal(restricted.getState().generations.length,1);assert.equal(restricted.getState().activeId,"legacy-initial");
});
