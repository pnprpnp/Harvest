"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const model=require("../src/scripts/growth-model.js"),learning=require("../src/scripts/growth-learning.js"),management=require("../src/scripts/growth-management.js");
const risk=require("../src/scripts/growth-risk.js");
const evidence=require("../src/scripts/growth-evidence.js"),observations=require("../src/scripts/growth-observations.js");
const generationEvaluation=require("../src/scripts/growth-generation-evaluation.js");
const copy=value=>JSON.parse(JSON.stringify(value));
const emptyValidation={methods:{},rows:{},selection:{candidateMethod:"safe",gates:{safe:{accepted:true}},requiresApproval:true},limitations:[],breakdown:{}};
function weather(start,count){return Array.from({length:count},(_,i)=>({date:model.addDays(start,i),source:"observation",meanTemp:20,lightIndex:1}));}
function crops(count,start="2025-09-01"){
  return Array.from({length:count},(_,i)=>{const plantingDate=model.addDays(start,i*4);return {id:`${start}:${i}`,groupId:`h:${start}:${i}`,cropId:`c:${start}:${i}`,plantingEventId:100+i,
    plantingDate,date:model.addDays(plantingDate,30),readyDate:model.addDays(plantingDate,28),sizeRating:"normal",building:2,bed:"A",palletKeys:["2-A-1"],qualityWeight:1};});
}
function paired(samples,activeId,candidateId){
  return samples.map(sample=>{
    const origin=model.addDays(sample.date,-7),prediction={status:"normal",readyStart:model.addDays(sample.readyDate,4),readyEnd:model.addDays(sample.readyDate,9),
      interval:{start:model.addDays(sample.readyDate,3),end:model.addDays(sample.readyDate,5)},confidence:{level:"reference"},basis:{independentCrops:12}};
    return {kind:"prediction",asOf:origin,capturedAt:`${origin}T03:00:00Z`,payload:{asOf:origin,modelVersion:activeId,shadowModelVersion:candidateId,
      modelTrainedAsOf:"2026-01-01T12:00:00+09:00",shadowTrainedAsOf:"2026-01-01T12:00:00+09:00",
      predictions:[{building:sample.building,bed:sample.bed,plantingEventId:sample.plantingEventId,plantingDate:sample.plantingDate,palletKeys:sample.palletKeys,targetDate:sample.date,
        prediction,shadowPrediction:{...prediction,readyStart:sample.readyDate,readyEnd:model.addDays(sample.readyDate,5),interval:{start:sample.readyDate,end:model.addDays(sample.readyDate,2)}}}]}};
  });
}
function setup({auxiliary=false,yieldAuxiliary=false,candidateMethod="safe"}={}){
  const data=new Map(),calls={fit:[],evaluate:[],hydrate:[],fitQuality:[],hydrateQuality:[],generations:[],fitYield:[]};let entries=[],gate=true,generationGate=true,yieldGate=false,current=true,version=0;
  const storage={readJson:(key,fallback)=>data.has(key)?copy(data.get(key)):fallback,writeJson:(key,value)=>data.set(key,copy(value))};
  const registry=management.create({storage,getRole:()=>"test",now:()=>Date.parse("2026-09-26T00:00:00Z")});
  const engine={...model,fit:(samples,options)=>{calls.fit.push({samples:copy(samples),options});return model.fit(samples,options);},
    hydrateModel:(snapshot,options)=>{calls.hydrate.push({snapshot:copy(snapshot),options});return model.hydrateModel(snapshot,options);}};
  const controller=learning.create({engine,registry,evaluate:async(samples,options)=>{calls.evaluate.push({samples:copy(samples),options});return {...copy(emptyValidation),selection:{...copy(emptyValidation.selection),candidateMethod,gates:{safe:{accepted:gate}}}};},
    evaluateGenerations:async options=>{calls.generations.push(copy(options));return {gate:{accepted:generationGate,reason:generationGate?"frozenImprovement":"frozenRegression"}};},
    fitAuxiliary:auxiliary ? (samples,options)=>{calls.fitQuality.push({samples:copy(samples),options});return risk.exportModel(risk.fit(samples,options));} : undefined,
    hydrateAuxiliary:auxiliary ? (snapshot,options)=>{calls.hydrateQuality.push({snapshot:copy(snapshot),options});return risk.hydrateModel(snapshot,options);} : undefined,
    fitYieldAuxiliary:yieldAuxiliary ? options=>{const snapshot={schemaVersion:1,trainedAsOf:options.asOf,model:{schemaVersion:1,rows:[]},training:{independentCrops:0,cropIds:[]}};
      calls.fitYield.push(copy(snapshot));return snapshot;} : undefined,
    evaluateYield:yieldAuxiliary ? async()=>({gate:{blocking:yieldGate,accepted:!yieldGate,reason:yieldGate?"yieldRegression":"insufficientYieldEvidence"}}) : undefined,
    readPredictions:async()=>entries,isCurrent:()=>current,version:()=>`test-generation-${++version}`});
  return {registry,controller,engine,calls,storage,set entries(value){entries=value;},set gate(value){gate=value;},set generationGate(value){generationGate=value;},set yieldGate(value){yieldGate=value;},set current(value){current=value;}};
}
const baseOptions={asOf:"2026-01-01T12:00:00+09:00",weatherDaily:weather("2025-08-01",160),forecastHistory:[],dataSignature:"training:1"};
function runtimeContext(registry,extras={}){
  const notices=[];
  const c=vm.createContext({HarvestGrowthManagement:{create:()=>registry},harvestnaviLocalStorage:{},getDashboardGrowthHistoryScope:()=>"test",
    HarvestGrowthModel:model,HarvestGrowthLearning:learning,HarvestGrowthRisk:risk,HarvestGrowthEvidence:evidence,HarvestGrowthGenerationEvaluation:generationEvaluation,HarvestGrowthHistory:{list:async()=>[]},
    HarvestGrowthObservations:{list:()=>[]},getDashboardGrowthBuildingAdjustments:()=>({}),
    crypto:require("node:crypto").webcrypto,TextEncoder,
    runDashboardGrowthEvaluation:async()=>emptyValidation,ensureProtectedOperationAccess:()=>true,
    getDashboardGrowthSourceState:()=>({samples:[]}),getDashboardGrowthAsOf:()=>"2026-09-26T12:00:00+09:00",formatDateOnlyString:model.dateKey,getDashboardGrowthBuildingAdjustment:()=>({}),
    showToast:value=>notices.push(value),dashboardGrowthPredictionModelCache:null,dashboardRenderedSubtabs:new Set(),renderDashboardGrowthPrediction:()=>{},...extras});
  vm.runInContext(fs.readFileSync(require("node:path").join(__dirname,"../src/scripts/app/growth-runtime.js"),"utf8"),c);
  c.notices=notices;return c;
}

test("initial baseline and frozen shadow candidate remain unchanged when only weather refreshes",async()=>{
  const f=setup(),samples=crops(12),first=await f.controller.prepare({...baseOptions,samples});
  assert.equal(first.fit.selectedMethod,"legacy");assert.equal(first.shadowFit.selectedMethod,"safe");
  assert.equal(f.registry.getState().generations.length,2);assert.equal(f.calls.evaluate.length,1);assert.equal(f.calls.fit.length,2);
  const active=f.registry.getActiveSnapshot(),candidate=f.registry.getCandidateSnapshot();
  const refreshed=await f.controller.prepare({...baseOptions,asOf:"2026-01-02T12:00:00+09:00",weatherDaily:weather("2025-08-01",165),samples});
  assert.equal(f.calls.fit.length,2);assert.equal(f.calls.evaluate.length,1);
  assert.equal(f.calls.generations.length,1,"weather refresh must not rerun frozen-generation evaluation");
  assert.deepEqual(f.registry.getActiveSnapshot(),active);assert.deepEqual(f.registry.getCandidateSnapshot(),candidate);
  assert.equal(refreshed.fit.weatherContext.asOf,"2026-01-02");assert.equal(refreshed.modelVersion,first.modelVersion);
  assert.throws(()=>f.registry.adopt(candidate.modelVersion,{explicit:true}),/検証条件/);
});
test("new labels trigger evaluation but cannot silently refit or adopt either frozen generation",async()=>{
  const f=setup();await f.controller.prepare({...baseOptions,samples:crops(12)});
  const active=f.registry.getActiveSnapshot(),candidate=f.registry.getCandidateSnapshot();
  await f.controller.prepare({...baseOptions,asOf:"2026-02-01",dataSignature:"training:2",samples:crops(16)});
  assert.equal(f.calls.evaluate.length,2);assert.equal(f.calls.fit.length,2);
  assert.deepEqual(f.registry.getActiveSnapshot(),active);assert.deepEqual(f.registry.getCandidateSnapshot(),candidate);
  assert.equal(f.registry.getState().candidateId,candidate.modelVersion);
});
test("initial fit excludes harvest and planting facts unavailable at the training cutoff",async()=>{
  const f=setup(),samples=crops(3);samples[0].availableAt="2026-01-02T00:00:00Z";samples[1].plantingAvailableAt="2026-01-02T00:00:00Z";
  await f.controller.prepare({...baseOptions,samples});
  assert.equal(f.registry.getActiveSnapshot().training.sampleCount,1);assert.equal(f.registry.getCandidateSnapshot().training.sampleCount,1);
});
test("prospective comparisons pair exact generation/crop/date and use earliest eligible saved forecasts",()=>{
  const samples=crops(20,"2026-02-01"),entries=paired(samples,"a","b"),later=copy(entries[0]);
  later.asOf=model.addDays(later.asOf,1);later.capturedAt=later.asOf+"T03:00:00Z";later.payload.asOf=later.asOf;
  later.payload.predictions[0].shadowPrediction.readyStart=model.addDays(samples[0].readyDate,9);
  const result=learning.compareSaved(model,[later,...entries],samples,{activeId:"a",candidateId:"b",asOf:"2026-09-26"});
  assert.equal(result.gate.accepted,true,JSON.stringify(result.gate));assert.equal(result.activeRows.length,20);assert.equal(result.candidateRows[0].readyError,0);
  assert.equal(result.active.readyDateMAE,4);assert.equal(result.candidate.readyDateMAE,0);
  assert.equal(learning.compareSaved(model,entries,samples,{activeId:"different",candidateId:"b",asOf:"2026-09-26"}).activeRows.length,0);
  const incorrect=copy(entries);incorrect.forEach(entry=>entry.payload.predictions[0].plantingEventId++);
  assert.equal(learning.compareSaved(model,incorrect,samples,{activeId:"a",candidateId:"b",asOf:"2026-09-26"}).activeRows.length,0);
});
test("future results/late forecast captures and unavailable observation corrections cannot enter comparisons",()=>{
  const sample=crops(1,"2026-02-01")[0],entries=paired([sample],"a","b"),options={activeId:"a",candidateId:"b",asOf:"2026-09-26T00:00:00Z"};
  for(const changed of [{...sample,availableAt:"2026-09-27T00:00:00Z"},{...sample,date:"2026-09-27"}]){
    assert.equal(learning.compareSaved(model,entries,[changed],options).activeRows.length,0);
  }
  const late=copy(entries);late[0].capturedAt="2026-10-01T00:00:00Z";assert.equal(learning.compareSaved(model,late,[sample],options).activeRows.length,0);
  const fake=copy(entries);fake[0].capturedAt=model.addDays(sample.date,1)+"T00:00:00Z";assert.equal(learning.compareSaved(model,fake,[sample],options).activeRows.length,0);
});
test("class and exact frozen-generation gates must both pass before eligibility, with no automatic adoption",async()=>{
  const f=setup();await f.controller.prepare({...baseOptions,samples:crops(12)});
  const active=f.registry.getActiveSnapshot(),candidate=f.registry.getCandidateSnapshot(),future=crops(20,"2026-02-01");f.entries=paired(future,active.modelVersion,candidate.modelVersion);
  await f.controller.prepare({...baseOptions,asOf:"2026-09-26",samples:crops(12).concat(future),dataSignature:"evaluated:2"});
  const generation=f.registry.getGeneration(f.registry.getState().candidateId);
  assert.equal(generation.eligible,true);assert.deepEqual(generation.modelSnapshot.coefficients,candidate.coefficients);
  assert.equal(f.registry.getState().activeId,active.modelVersion);assert.equal(f.calls.fit.length,2);
});
test("a later failed gate prevents adoption of an earlier eligible candidate after dataset shift",async()=>{
  const f=setup();await f.controller.prepare({...baseOptions,samples:crops(12)});
  const active=f.registry.getActiveSnapshot(),candidate=f.registry.getCandidateSnapshot(),future=crops(20,"2026-02-01");f.entries=paired(future,active.modelVersion,candidate.modelVersion);
  await f.controller.prepare({...baseOptions,asOf:"2026-09-26",samples:crops(12).concat(future),dataSignature:"evaluated:2"});
  assert.equal(f.registry.getGeneration(f.registry.getState().candidateId).eligible,true);
  f.gate=false;
  await f.controller.prepare({...baseOptions,asOf:"2026-09-27",samples:crops(12).concat(future),dataSignature:"shifted:3"});
  const context=runtimeContext(f.registry);
  context.getDashboardGrowthEvidenceSignature=async()=>"shifted:3";
  assert.equal(await context.adoptDashboardGrowthCandidate(f.registry.getState().candidateId),false,"stale eligibility must not authorize adoption after new evidence fails");
  assert.equal(f.registry.getState().activeId,active.modelVersion);
});
test("whole-bed partial signals never count as exact size labels in prospective promotion",()=>{
  const samples=crops(20,"2026-02-01").map(row=>({...row,signalKind:"partial-bed"}));
  const result=learning.compareSaved(model,paired(samples,"a","b"),samples,{activeId:"a",candidateId:"b",asOf:"2026-09-26"});
  assert.equal(result.activeRows.length,0);assert.equal(result.gate.accepted,false);
});
test("stale/role-switched async preparation cannot publish a candidate or evaluation",async()=>{
  let current=true,finish;const wait=new Promise(resolve=>finish=resolve),f=setup();
  const controller=learning.create({engine:f.engine,registry:f.registry,isCurrent:()=>current,version:(()=>{let n=0;return()=>`stale-${++n}`;})(),evaluate:async()=>{await wait;return emptyValidation;}});
  const pending=controller.prepare({...baseOptions,samples:crops(12)});current=false;finish();
  assert.equal(await pending,null);assert.equal(f.registry.getState().generations.length,1);assert.equal(f.registry.getState().candidateId,null);assert.equal(f.registry.getState().evaluation.dataSignature,null);
});
test("runtime total hydration failure reaches the prior instead of throwing from a null fit",async()=>{
  const registry={getActiveSnapshot:()=>({modelVersion:"broken"}),runWithFallback:()=>({value:null,fallback:true})},fits=[];
  const c=runtimeContext(registry,{HarvestGrowthLearning:{create:()=>({prepare:async()=>{throw new Error("evaluation unavailable");}})},
    HarvestGrowthModel:{...model,fit:(samples,options)=>{fits.push(samples);return model.fit(samples,options);}}});
  const result=await c.prepareDashboardGrowthLearning([],{...baseOptions},()=>true);
  assert.ok(result.fit);assert.equal(result.fit.selectedMethod,"legacy");assert.equal(result.runtime.fallback,true);assert.deepEqual(copy(fits),[[]]);
});
test("risk evidence fits once per data signature across weather refreshes and refits after evidence changes",()=>{
  const f=setup(),fits=[],c=runtimeContext(f.registry,{HarvestGrowthRisk:{fit:(samples,options)=>{fits.push({samples,options});return {n:fits.length};}},dashboardGrowthDataRevision:1});
  const a=c.getDashboardGrowthCachedRiskFit([],{dataSignature:"one",weatherDaily:[]});
  const b=c.getDashboardGrowthCachedRiskFit([],{dataSignature:"one",weatherDaily:[{date:"2026-09-26"}]});assert.equal(a,b);assert.equal(fits.length,1);
  c.getDashboardGrowthCachedRiskFit([],{dataSignature:"two",weatherDaily:[]});assert.equal(fits.length,2);
});

test("prospective evidence follows unchanged coefficients across promotion aliases without training again",async()=>{
  const f=setup();await f.controller.prepare({...baseOptions,samples:crops(12)});
  const active=f.registry.getActiveSnapshot(),trial=f.registry.getCandidateSnapshot(),future=crops(20,"2026-02-01");f.entries=paired(future,active.modelVersion,trial.modelVersion);
  await f.controller.prepare({...baseOptions,asOf:"2026-09-26",samples:future,dataSignature:"eligible:2"});
  const promoted=f.registry.getCandidateSnapshot();assert.notEqual(promoted.modelVersion,trial.modelVersion);
  await f.controller.prepare({...baseOptions,asOf:"2026-09-27",samples:future,dataSignature:"eligible:3"});
  const current=f.registry.getGeneration(f.registry.getState().candidateId);
  assert.equal(current.eligible,true);assert.equal(current.evaluationSignature,"eligible:3");
  assert.equal(current.settings.shadowOf,trial.modelVersion);assert.deepEqual(current.modelSnapshot.coefficients,trial.coefficients);assert.equal(f.calls.fit.length,2);
  assert.equal(f.registry.getState().evaluation.summary.prospective.gate.accepted,true);
});
test("an exact prospective win cannot bypass a failing gate for the frozen candidate's method",async()=>{
  const f=setup();await f.controller.prepare({...baseOptions,samples:crops(12)});
  const active=f.registry.getActiveSnapshot(),trial=f.registry.getCandidateSnapshot(),future=crops(20,"2026-02-01");f.entries=paired(future,active.modelVersion,trial.modelVersion);f.gate=false;
  await f.controller.prepare({...baseOptions,asOf:"2026-09-26",samples:future,dataSignature:"class-failed:2"});
  assert.equal(f.registry.getState().evaluation.summary.prospective.gate.accepted,true);
  assert.equal(f.registry.getGeneration(trial.modelVersion).eligible,false);assert.equal(f.registry.getState().activeId,active.modelVersion);
});
test("saved forecasts made before their declared models were trained are excluded",()=>{
  const samples=crops(20,"2026-02-01"),entries=paired(samples,"a","b");
  for(const entry of entries) entry.payload.shadowTrainedAsOf="2026-09-25T00:00:00Z";
  const result=learning.compareSaved(model,entries,samples,{activeId:"a",candidateId:"b",asOf:"2026-09-26"});
  assert.equal(result.activeRows.length,0);assert.equal(result.gate.accepted,false);
});

test("quality coefficients freeze with each generation across weather refreshes and contradictory new labels",async()=>{
  const f=setup({auxiliary:true}),poor=crops(12).map(row=>({...row,symptoms:{elongated:"many",uneven:"slight",tipburn:"many"}}));
  const first=await f.controller.prepare({...baseOptions,samples:poor});
  const active=copy(f.registry.getActiveSnapshot().coefficients.quality),trial=copy(f.registry.getCandidateSnapshot().coefficients.quality);
  assert.equal(f.calls.fitQuality.length,2);assert.equal(active.buildings[2].tipburn.confirmedCount,12);assert.equal(active.buildings[2].tipburn.presentCount,12);
  assert.deepEqual(first.riskFit.buildings,active.buildings);assert.deepEqual(first.shadowRiskFit.buildings,trial.buildings);
  const hotter=weather("2025-08-01",165).map(day=>({...day,meanTemp:30,maxTemp:35,minTemp:20}));
  const refreshed=await f.controller.prepare({...baseOptions,samples:poor,asOf:"2026-01-02",weatherDaily:hotter});
  assert.equal(f.calls.fitQuality.length,2);assert.deepEqual(refreshed.riskFit.buildings,active.buildings);
  const newLabels=crops(16,"2026-02-01").map(row=>({...row,symptoms:{elongated:"none",uneven:"none",tipburn:"none"}}));
  const updated=await f.controller.prepare({...baseOptions,asOf:"2026-09-26",samples:poor.concat(newLabels),dataSignature:"quality-changed:2"});
  assert.equal(f.calls.fitQuality.length,2);assert.equal(f.calls.evaluate.length,2);
  assert.deepEqual(updated.riskFit.buildings,active.buildings);assert.deepEqual(updated.shadowRiskFit.buildings,trial.buildings);
  assert.equal(updated.riskFit.buildings[2].tipburn.presentCount,12,"new negative observations must not silently replace an approved quality generation");
  assert.deepEqual(f.registry.getActiveSnapshot().coefficients.quality,active);assert.deepEqual(f.registry.getCandidateSnapshot().coefficients.quality,trial);
});
test("nested quality snapshot survives registry reload and JSON roundtrip, preserving counts and epoch timestamps",async()=>{
  const f=setup({auxiliary:true}),rows=crops(4).map((row,i)=>({...row,symptoms:{elongated:["unknown","none","slight","present"][i],uneven:"unknown",tipburn:["unknown","none","many","present"][i]}}));
  await f.controller.prepare({...baseOptions,samples:rows});
  const reload=management.create({storage:f.storage,getRole:()=>"test"}),saved=copy(reload.getActiveSnapshot().coefficients.quality);
  const hydrated=risk.hydrateModel(JSON.parse(JSON.stringify(saved)),{asOf:"2026-01-02",weatherDaily:[]});
  assert.deepEqual(hydrated.buildings,saved.buildings);assert.equal(hydrated.buildings[2].tipburn.confirmedCount,3);assert.equal(hydrated.buildings[2].tipburn.presentCount,2);
  assert.equal(hydrated.buildings[2].uneven.confirmedCount,0);assert.equal(hydrated.buildings[2].tipburn.association.excluded.unknown,1);
  assert.equal(saved.trainedAt,Date.parse(baseOptions.asOf));assert.equal(typeof saved.trainedAt,"number");
  const epoch={...saved,trainedAt:0,trainedAsOf:"1970-01-01"};assert.equal(risk.hydrateModel(epoch,{asOf:"2026-01-02",weatherDaily:[]}).restored,true);
  assert.throws(()=>risk.hydrateModel({...saved,trainedAt:false},{asOf:"2026-01-02",weatherDaily:[]}));
  hydrated.buildings[2].tipburn.confirmedCount=999;assert.equal(reload.getActiveSnapshot().coefficients.quality.buildings[2].tipburn.confirmedCount,3);
  assert.equal("weatherDaily" in saved,false);assert.equal("weatherInput" in saved,false);
});
test("paired saved quality scores use severity errors while unknown/legacy/out-of-forecast values remain unscored",()=>{
  const sample={...crops(1,"2026-02-01")[0],symptoms:{elongated:"many",uneven:"none",tipburn:"slight"}},entries=paired([sample],"a","b");
  const pair=entries[0].payload.predictions[0];
  pair.risk={elongated:{severity:"slight"},uneven:{severity:"unknown"},tipburn:{severity:"many",outOfForecast:true}};
  pair.shadowRisk={elongated:{severity:"many"},uneven:{severity:"none"},tipburn:{severity:"none"}};
  const result=learning.compareSaved(model,entries,[sample],{activeId:"a",candidateId:"b",asOf:"2026-09-26"});
  assert.deepEqual(result.activeRows[0].qualityErrors,{elongated:1,uneven:null,tipburn:null});
  assert.deepEqual(result.candidateRows[0].qualityErrors,{elongated:0,uneven:0,tipburn:1});
  const legacy={...sample,symptoms:{elongated:"present",uneven:"unknown",tipburn:"legacy-present"}};
  const unknown=learning.score(pair.shadowPrediction,legacy,entries[0].asOf,sample.date,pair.shadowRisk);
  assert.deepEqual(unknown.qualityErrors,{elongated:null,uneven:null,tipburn:null});
  const wrongDate=learning.score(pair.shadowPrediction,sample,entries[0].asOf,model.addDays(sample.date,1),pair.shadowRisk);
  assert.deepEqual(wrongDate.qualityErrors,{elongated:null,uneven:null,tipburn:null});
});
test("a ready-date improvement cannot conceal worse known quality severity in the same paired forecasts",()=>{
  const samples=crops(20,"2026-02-01").map(row=>({...row,symptoms:{elongated:"many",uneven:"none",tipburn:"none"}})),entries=paired(samples,"a","b");
  entries.forEach(entry=>{const pair=entry.payload.predictions[0];pair.risk={elongated:{severity:"many"}};pair.shadowRisk={elongated:{severity:"none"}};});
  const result=learning.compareSaved(model,entries,samples,{activeId:"a",candidateId:"b",asOf:"2026-09-26"});
  assert.equal(result.candidate.readyDateMAE,0);assert.equal(result.active.readyDateMAE,4);
  assert.equal(result.gate.accepted,false);assert.equal(result.gate.reason,"qualityRegression");assert.equal(result.gate.symptom,"elongated");
});
test("production learning wires real auxiliary training and hydration into the persisted generation",async()=>{
  const f=setup(),calls=[],c=runtimeContext(f.registry,{HarvestGrowthRisk:{...risk,fit:(rows,options)=>{calls.push(rows.length);return risk.fit(rows,options);}}});
  const rows=crops(5).map(row=>({...row,symptoms:{tipburn:"many"}}));
  const initial=await c.prepareDashboardGrowthLearning(rows,baseOptions,()=>true);
  assert.ok(initial.riskFit);assert.ok(initial.shadowRiskFit);assert.deepEqual(calls,[5,5]);
  const snapshot=f.registry.getActiveSnapshot();assert.equal(snapshot.coefficients.quality.buildings[2].tipburn.presentCount,5);
  await c.prepareDashboardGrowthLearning(rows,{...baseOptions,asOf:"2026-01-02",weatherDaily:[]},()=>true);
  assert.deepEqual(calls,[5,5]);assert.deepEqual(f.registry.getActiveSnapshot().coefficients.quality,snapshot.coefficients.quality);
});

function observationFixture(){
  const data=new Map();let sequence=0;
  return observations.create({storage:{readJson:(key,fallback)=>data.has(key)?copy(data.get(key)):fallback,writeJson:(key,value)=>data.set(key,copy(value))},
    getRole:()=>"test",now:()=>Date.parse("2026-09-20T00:00:00Z"),uuid:()=>`20000000-0000-4000-8000-${String(++sequence).padStart(12,"0")}`});
}
test("runtime annotation at different asOf times keeps the same teacher signature without mutating the source",async()=>{
  const f=setup(),obs=observationFixture(),c=runtimeContext(f.registry,{HarvestGrowthObservations:obs});
  const sample=crops(1,"2026-08-20")[0],source={samples:[{...sample,plantingDate:new Date(sample.plantingDate+"T00:00:00+09:00"),date:new Date(sample.date+"T00:00:00+09:00")}]};
  obs.save({kind:"environment",building:2,bed:"A",startDate:"2026-08-20",endDate:"",payload:{temperature:"high",light:"base",humidity:"base",dataPolicy:"normal"}});
  const before=JSON.stringify(source),originalDate=source.samples[0].plantingDate;
  const first=c.getDashboardGrowthEngineSamples(source,"2026-09-25T12:00:00+09:00"),second=c.getDashboardGrowthEngineSamples(source,"2026-09-26T12:00:00+09:00");
  assert.equal(first[0].environmentRegimes.length,1);assert.notEqual(first[0].growthEvidence.asOf,second[0].growthEvidence.asOf);
  assert.equal(await c.getDashboardGrowthEvidenceSignature(first),await c.getDashboardGrowthEvidenceSignature(second));
  assert.equal(JSON.stringify(source),before);assert.equal(source.samples[0].plantingDate,originalDate);
  assert.equal("growthEvidence" in source.samples[0],false);assert.equal("environmentRegimes" in source.samples[0],false);
  assert.equal(first[0].plantingDate,sample.plantingDate);assert.equal(first[0].date,sample.date);
});
test("manual offsets, field opinions and EC never alter teacher hashes, while matched environment/exclusions do",async()=>{
  const f=setup(),obs=observationFixture(),c=runtimeContext(f.registry,{HarvestGrowthObservations:obs});
  const sample=crops(1,"2026-08-20")[0],source={samples:[sample]},asOf="2026-09-26T12:00:00+09:00";
  const signature=()=>c.getDashboardGrowthEvidenceSignature(c.getDashboardGrowthEngineSamples(source,asOf));
  const baseline=await signature();
  const crop={plantingEventId:sample.plantingEventId,plantingDate:sample.plantingDate,palletKeys:sample.palletKeys,date:"2026-09-10"};
  obs.save({...crop,kind:"manualOffset",payload:{days:2,sourcePredictionId:"prediction-1"}});assert.equal(await signature(),baseline);
  obs.save({...crop,kind:"fieldAssessment",payload:{size:"large",quality:{tipburn:"high"}}});assert.equal(await signature(),baseline);
  obs.save({kind:"ec",building:2,bed:"A",date:"2026-09-10",payload:{value:2.1,unit:"mS/cm",isAbnormal:true}});assert.equal(await signature(),baseline);
  const annotated=c.getDashboardGrowthEngineSamples(source,asOf)[0];
  assert.equal(annotated.growthEvidence.manualOffsets.length,1);assert.equal(annotated.growthEvidence.fieldAssessments.length,1);assert.equal(annotated.growthEvidence.ec.length,1);
  obs.save({kind:"environment",building:2,bed:"A",startDate:"2026-08-20",payload:{temperature:"low",light:"high",humidity:"base",dataPolicy:"normal"}});
  const environmentHash=await signature();assert.notEqual(environmentHash,baseline);
  obs.save({kind:"condition",building:2,bed:"A",startDate:"2026-09-10",payload:{type:"equipmentFailure",dataPolicy:"exclude"}});
  const excluded=c.getDashboardGrowthEngineSamples(source,asOf)[0];assert.equal(excluded.excludedFromTraining,true);assert.notEqual(await signature(),environmentHash);
});
test("risk direct rebuild selects the named frozen generation and falls back only to an empty prior",async()=>{
  const f=setup({auxiliary:true}),poor=crops(5).map(row=>({...row,symptoms:{tipburn:"many"}}));await f.controller.prepare({...baseOptions,samples:poor});
  const active=f.registry.getActiveSnapshot(),other=copy(f.registry.getCandidateSnapshot());other.modelVersion="other-quality-generation";
  const otherRows=crops(9).map(row=>({...row,symptoms:{tipburn:"none"}}));other.coefficients.quality=risk.exportModel(risk.fit(otherRows,baseOptions));
  f.registry.registerCandidate(other,{eligible:false,dataSignature:"quality-fixture"});
  const fitCalls=[],c=runtimeContext(f.registry,{HarvestGrowthRisk:{...risk,fit:(rows,options)=>{fitCalls.push(copy(rows));return risk.fit(rows,options);}}});
  const options={...baseOptions,asOf:"2026-09-26",samples:otherRows};
  const current=c.getDashboardGrowthFrozenRiskFit(options);assert.equal(current.buildings[2].tipburn.presentCount,5);
  const explicit=c.getDashboardGrowthFrozenRiskFit(options,other.modelVersion);assert.equal(explicit.buildings[2].tipburn.presentCount,0);assert.equal(explicit.buildings[2].tipburn.confirmedCount,9);
  assert.deepEqual(fitCalls,[]);assert.equal(f.registry.getActiveSnapshot().modelVersion,active.modelVersion);
  const missing=c.getDashboardGrowthFrozenRiskFit(options,"missing-version");assert.deepEqual(copy(missing.buildings),{});assert.deepEqual(fitCalls,[[]]);
  const broken=copy(other);broken.modelVersion="broken-quality-generation";broken.coefficients.quality.schemaVersion=99;
  f.registry.registerCandidate(broken,{eligible:false,dataSignature:"quality-fixture"});
  const corrupted=c.getDashboardGrowthFrozenRiskFit(options,broken.modelVersion);assert.deepEqual(copy(corrupted.buildings),{});assert.deepEqual(fitCalls,[[],[]]);
});
test("evaluation failure keeps the frozen risk snapshot even when newer teacher data is supplied",async()=>{
  const f=setup({auxiliary:true}),original=crops(5).map(row=>({...row,symptoms:{tipburn:"many"}}));await f.controller.prepare({...baseOptions,samples:original});
  const calls=[],c=runtimeContext(f.registry,{HarvestGrowthLearning:{create:()=>({prepare:async()=>{throw new Error("offline evaluation");}})},
    HarvestGrowthRisk:{...risk,fit:(rows,options)=>{calls.push(copy(rows));return risk.fit(rows,options);}}});
  const newer=crops(25,"2026-02-01").map(row=>({...row,symptoms:{tipburn:"none"}}));
  const result=await c.prepareDashboardGrowthLearning(newer,{...baseOptions,asOf:"2026-09-26",dataSignature:"new-labels"},()=>true);
  assert.equal(result.runtime.fallback,true);assert.equal(result.riskFit.buildings[2].tipburn.presentCount,5);assert.deepEqual(calls,[]);
  assert.equal(result.modelVersion,f.registry.getActiveSnapshot().modelVersion);
});
test("observation building index covers explicit house scopes and each crop house once without modifying records",()=>{
  const f=setup(),obs=observationFixture(),c=runtimeContext(f.registry,{HarvestGrowthObservations:obs});
  const crop=obs.save({kind:"ready",plantingEventId:1,plantingDate:"2026-08-20",palletKeys:["2-A-1","2-A-2","3-B-1"],readyDate:"2026-09-18"});
  const house=obs.save({kind:"ec",building:4,date:"2026-09-18",payload:{value:1.9,unit:"mS/cm"}});
  const before=obs.backup(),index=c.getDashboardGrowthObservationsByBuilding();
  assert.deepEqual(copy([...index.keys()].sort()),[2,3,4]);assert.equal(index.get(2).length,1);assert.equal(index.get(3).length,1);
  assert.equal(index.get(2)[0].observationId,crop.observationId);assert.equal(index.get(4)[0].observationId,house.observationId);assert.deepEqual(obs.backup(),before);
});

test("position scopes are stable sets of explicit observation IDs without ready or broad-house records",()=>{
  const f=setup(),obs=observationFixture(),c=runtimeContext(f.registry,{HarvestGrowthObservations:obs});
  obs.save({kind:"ready",plantingEventId:1,plantingDate:"2026-08-20",palletKeys:["2-A-1","2-A-3"],readyDate:"2026-09-18"});
  obs.save({kind:"environment",building:2,bed:"A",startDate:"2026-09-01",payload:{temperature:"high",light:"base",humidity:"base",dataPolicy:"normal"}});
  const local=obs.save({kind:"environment",building:2,bed:"A",palletKeys:["2-A-1","2-A-2"],startDate:"2026-09-01",payload:{temperature:"low",light:"high",humidity:"base",dataPolicy:"normal"}});
  const condition=obs.save({kind:"condition",building:2,bed:"A",palletKeys:["2-A-2"],startDate:"2026-09-10",payload:{type:"equipmentFailure",dataPolicy:"exclude"}});
  const multiHouse=obs.save({kind:"manualOffset",plantingEventId:1,plantingDate:"2026-08-20",palletKeys:["2-A-2","3-B-2"],date:"2026-09-18",payload:{days:1,sourcePredictionId:"prediction-1"}});
  const before=obs.backup(),index=c.getDashboardGrowthObservationsByBuilding(),scopes=c.getDashboardGrowthObservationScopes(index);
  assert.equal(scopes.get("2-A-1"),local.observationId);
  assert.equal(scopes.get("2-A-2"),[local.observationId,condition.observationId,multiHouse.observationId].sort().join(","));
  assert.equal(scopes.get("3-B-2"),multiHouse.observationId,"cross-house indexing must not duplicate an observation in its position signature");
  assert.equal(scopes.has("2-A-3"),false,"ready observations and broad scopes do not split unrelated pallets");
  const reversed=new Map([...index].reverse().map(([building,rows])=>[building,rows.slice().reverse()]));
  const reordered=c.getDashboardGrowthObservationScopes(reversed);
  assert.deepEqual(copy([...reordered].sort()),copy([...scopes].sort()));
  assert.deepEqual(obs.backup(),before);
});

test("a same-day harvest changes the teacher signature when it first becomes eligible the next day",async()=>{
  const f=setup(),c=runtimeContext(f.registry),sample={...crops(1,"2026-08-27")[0],availableAt:"2026-09-26T09:00:00+09:00"};
  assert.equal(sample.date,"2026-09-26");
  const today="2026-09-26T12:00:00+09:00",tomorrow="2026-09-27T12:00:00+09:00";
  const todaySamples=c.getDashboardGrowthEngineSamples({samples:[sample]},today);
  const nextSamples=c.getDashboardGrowthEngineSamples({samples:[sample]},tomorrow);
  const todayHash=await c.getDashboardGrowthEvidenceSignature(todaySamples,today),tomorrowHash=await c.getDashboardGrowthEvidenceSignature(nextSamples,tomorrow);
  assert.equal(todayHash,await c.getDashboardGrowthEvidenceSignature([],today));
  assert.notEqual(tomorrowHash,todayHash,"the next-day evaluation must discover the newly usable harvest");
  const later="2026-09-27T18:00:00+09:00";
  assert.equal(await c.getDashboardGrowthEvidenceSignature(c.getDashboardGrowthEngineSamples({samples:[sample]},later),later),tomorrowHash);
  assert.equal(await c.getDashboardGrowthEvidenceSignature(c.getDashboardGrowthEngineSamples({samples:[sample]},"2026-09-28"),"2026-09-28"),tomorrowHash);
});
test("late-entered outcome availability changes a teacher signature only after its actual update cutoff",async()=>{
  const f=setup(),c=runtimeContext(f.registry),sample={...crops(1,"2026-08-20")[0],availableAt:"2026-09-26T13:00:00+09:00"};
  const before="2026-09-26T12:00:00+09:00",after="2026-09-26T14:00:00+09:00";
  assert.equal(await c.getDashboardGrowthEvidenceSignature([sample],before),await c.getDashboardGrowthEvidenceSignature([],before));
  assert.notEqual(await c.getDashboardGrowthEvidenceSignature([sample],before),await c.getDashboardGrowthEvidenceSignature([sample],after));
  assert.equal(sample.availableAt,"2026-09-26T13:00:00+09:00");
});

test("saved comparisons score both correct and incorrect cohorts without counting one crop twice",()=>{
  const sample={...crops(1,"2026-02-01")[0],palletKeys:["2-A-1","2-A-2"]},entries=paired([sample],"a","b");
  sample.readyDate="";
  const first=entries[0].payload.predictions[0];first.palletKeys=["2-A-1"];
  const second=copy(first);second.palletKeys=["2-A-2"];second.prediction.status="small";second.shadowPrediction.status="large";
  entries[0].payload.predictions.push(second);
  const result=learning.compareSaved(model,entries,[sample],{activeId:"a",candidateId:"b",asOf:"2026-09-26"});
  assert.equal(result.activeRows.length,2);assert.equal(result.candidateRows.length,2);
  assert.deepEqual(result.activeRows.map(row=>row.ordinalError),[0,1]);assert.deepEqual(result.candidateRows.map(row=>row.ordinalError),[0,1]);
  assert.equal(new Set(result.activeRows.map(row=>row.id)).size,2);
  assert.equal(new Set(result.activeRows.map(row=>row.cropId)).size,1);assert.equal(new Set(result.activeRows.map(row=>row.groupId)).size,1);
  assert.equal(result.active.independentCrops,1);assert.equal(result.candidate.independentCrops,1);
  assert.equal(result.active.accuracy,0.5);assert.equal(result.candidate.accuracy,0.5);
  assert.equal(result.active.ordinalMAE,0.5);assert.equal(result.gate.accepted,false);
});
test("incomplete pallet coverage or planting knowledge unavailable at capture yields no prospective scores",()=>{
  const sample={...crops(1,"2026-02-01")[0],palletKeys:["2-A-1","2-A-2"]},entries=paired([sample],"a","b");
  const options={activeId:"a",candidateId:"b",asOf:"2026-09-26"};
  entries[0].payload.predictions[0].palletKeys=["2-A-1"];
  assert.equal(learning.compareSaved(model,entries,[sample],options).activeRows.length,0);
  entries[0].payload.predictions[0].palletKeys=sample.palletKeys.slice();
  const captured=entries[0].capturedAt;
  for(const plantingAvailableAt of [captured,new Date(Date.parse(captured)+1).toISOString()]){
    const result=learning.compareSaved(model,entries,[{...sample,plantingAvailableAt}],options);
    assert.equal(result.activeRows.length,0);assert.equal(result.candidateRows.length,0);
  }
  assert.equal(learning.compareSaved(model,entries,[{...sample,plantingAvailableAt:new Date(Date.parse(captured)-1).toISOString()}],options).activeRows.length,1);
});
test("quality-only outcomes remain paired rows without inventing size or ready-date correctness",()=>{
  const sample={...crops(1,"2026-02-01")[0],sizeRating:"unknown",readyDate:"",symptoms:{elongated:"unknown",uneven:"unknown",tipburn:"many"}};
  // Build the dated fixture before removing the independent ready-date label.
  const entries=paired([{...sample,readyDate:model.addDays(sample.date,-2)}],"a","b"),pair=entries[0].payload.predictions[0];
  pair.prediction.status="unknown";pair.shadowPrediction.status="unknown";
  pair.risk={tipburn:{severity:"none"}};pair.shadowRisk={tipburn:{severity:"many"}};
  const result=learning.compareSaved(model,entries,[sample],{activeId:"a",candidateId:"b",asOf:"2026-09-26"});
  assert.equal(result.activeRows.length,1);assert.equal(result.candidateRows.length,1);
  assert.equal(result.activeRows[0].ordinalError,null);assert.equal(result.activeRows[0].readyError,null);
  assert.deepEqual(result.activeRows[0].qualityErrors,{elongated:null,uneven:null,tipburn:2});
  assert.deepEqual(result.candidateRows[0].qualityErrors,{elongated:null,uneven:null,tipburn:0});
  assert.equal(result.active.labelledCount,0);assert.equal(result.active.readyDateCount,0);assert.equal(result.active.accuracy,null);
  assert.equal(result.gate.accepted,false,"quality-only evidence cannot manufacture readiness validation");
});

test("same-method coefficient updates become eligible only after frozen-generation and prospective gates pass",async()=>{
  const f=setup({candidateMethod:null}),daily=weather("2025-05-01",550);
  const priorRows=crops(4,"2025-06-01").map(row=>({...row,date:model.addDays(row.plantingDate,42),readyDate:model.addDays(row.plantingDate,40)}));
  const baseline=model.exportModel(model.fit(priorRows,{...baseOptions,weatherDaily:daily,selectedMethod:"legacy",validation:emptyValidation}),{modelVersion:"older-legacy-coefficients"});
  f.registry.initialBaseline(baseline,{dataSignature:"prior-training"});
  const newer=crops(12);f.gate=false;
  await f.controller.prepare({...baseOptions,weatherDaily:daily,samples:newer});
  const trial=f.registry.getCandidateSnapshot();assert.equal(trial.method,"legacy");
  assert.notEqual(trial.coefficients.legacyGlobalTarget,baseline.coefficients.legacyGlobalTarget);
  assert.equal(f.registry.getGeneration(trial.modelVersion).eligible,false,"a successful frozen gate alone cannot promote a trial");
  const future=crops(20,"2026-02-01");f.entries=paired(future,baseline.modelVersion,trial.modelVersion);
  await f.controller.prepare({...baseOptions,asOf:"2026-09-26",weatherDaily:daily,samples:newer.concat(future),dataSignature:"same-method-validated"});
  const promoted=f.registry.getGeneration(f.registry.getState().candidateId);
  assert.equal(promoted.eligible,true);assert.equal(promoted.modelSnapshot.method,"legacy");
  assert.deepEqual(promoted.modelSnapshot.coefficients,trial.coefficients);assert.deepEqual(f.registry.getActiveSnapshot(),baseline);
  assert.equal(f.registry.getState().evaluation.summary.generations.sameMethod,true);
  assert.equal(f.registry.getState().evaluation.summary.generations.gate.accepted,true);
  assert.equal(f.registry.getState().evaluation.summary.prospective.gate.accepted,true);
  assert.equal(f.calls.fit.length,1,"promotion must not refit the already validated coefficients");
});
test("a failing frozen-generation gate prevents eligibility despite a successful prospective comparison",async()=>{
  const f=setup({candidateMethod:null});await f.controller.prepare({...baseOptions,samples:crops(12)});
  const active=f.registry.getActiveSnapshot(),trial=f.registry.getCandidateSnapshot(),future=crops(20,"2026-02-01");
  f.entries=paired(future,active.modelVersion,trial.modelVersion);f.generationGate=false;
  await f.controller.prepare({...baseOptions,asOf:"2026-09-26",samples:crops(12).concat(future),dataSignature:"frozen-failed"});
  const state=f.registry.getState();assert.equal(state.evaluation.summary.prospective.gate.accepted,true);
  assert.equal(state.evaluation.summary.generations.gate.accepted,false);assert.equal(f.registry.getGeneration(state.candidateId).eligible,false);
  assert.throws(()=>f.registry.adopt(state.candidateId,{explicit:true}),/検証条件/);assert.deepEqual(f.registry.getActiveSnapshot(),active);
});
test("an initial 0-to-7 crop candidate refreshes once at eight independent crops while the active model stays frozen",async()=>{
  for(const initialCount of [0,7]){
    const f=setup({auxiliary:true}),all=crops(9);await f.controller.prepare({...baseOptions,samples:all.slice(0,initialCount)});
    const active=f.registry.getActiveSnapshot(),seed=f.registry.getCandidateSnapshot();
    assert.equal(seed.training.independentCrops,initialCount);
    await f.controller.prepare({...baseOptions,samples:all.slice(0,7),dataSignature:`seven:${initialCount}`});
    assert.equal(f.registry.getCandidateSnapshot().modelVersion,seed.modelVersion);assert.equal(f.calls.fit.length,2);
    await f.controller.prepare({...baseOptions,samples:all.slice(0,8),dataSignature:`eight:${initialCount}`});
    const warmed=f.registry.getCandidateSnapshot();assert.notEqual(warmed.modelVersion,seed.modelVersion);assert.equal(warmed.training.independentCrops,8);
    assert.equal(f.registry.getGeneration(warmed.modelVersion).settings.reason,"initial-evidence-milestone");
    assert.equal(f.registry.getGeneration(warmed.modelVersion).eligible,false);assert.deepEqual(f.registry.getGeneration(seed.modelVersion).modelSnapshot,seed);
    assert.deepEqual(f.registry.getActiveSnapshot(),active);assert.equal(f.calls.fit.length,3);assert.equal(f.calls.fitQuality.length,3);
    await f.controller.prepare({...baseOptions,samples:all,asOf:"2026-01-02",dataSignature:`nine:${initialCount}`});
    assert.equal(f.registry.getCandidateSnapshot().modelVersion,warmed.modelVersion);assert.equal(f.calls.fit.length,3);
    assert.deepEqual(f.registry.getActiveSnapshot(),active);
    await f.controller.prepare({...baseOptions,samples:all,asOf:"2026-01-03",weatherDaily:weather("2025-08-01",170),dataSignature:`nine:${initialCount}`});
    assert.equal(f.calls.fit.length,3);assert.equal(f.calls.fitQuality.length,3);
  }
});
test("a sufficiently evaluated unsuccessful trial is replaced only after enough new evidence, keeping old generations",async()=>{
  const f=setup(),daily=weather("2025-08-01",460),initial=crops(8),future=crops(16,"2026-02-01");
  await f.controller.prepare({...baseOptions,weatherDaily:daily,samples:initial});
  const active=f.registry.getActiveSnapshot(),trial=f.registry.getCandidateSnapshot();assert.equal(trial.training.independentCrops,8);
  const failures=paired(future,active.modelVersion,trial.modelVersion);
  failures.forEach(entry=>entry.payload.predictions[0].shadowPrediction=copy(entry.payload.predictions[0].prediction));
  f.entries=failures.slice(0,15);
  await f.controller.prepare({...baseOptions,weatherDaily:daily,asOf:"2026-09-25",samples:initial.concat(future.slice(0,15)),dataSignature:"fifteen-tested"});
  assert.equal(f.registry.getCandidateSnapshot().modelVersion,trial.modelVersion,"15 crops are not enough to retire a trial");
  assert.equal(f.calls.fit.length,2);
  f.entries=failures;
  await f.controller.prepare({...baseOptions,weatherDaily:daily,asOf:"2026-09-26",samples:initial.concat(future),dataSignature:"sixteen-tested"});
  const updated=f.registry.getCandidateSnapshot(),state=f.registry.getState();assert.notEqual(updated.modelVersion,trial.modelVersion);
  assert.equal(updated.training.independentCrops,24);assert.ok(updated.training.independentCrops>=trial.training.independentCrops+8);
  assert.equal(state.evaluation.summary.prospective.gate.accepted,false);assert.equal(state.evaluation.summary.prospective.gate.independentCrops,16);
  assert.ok(state.evaluation.summary.prospective.gate.spanDays>=42);assert.equal(f.registry.getGeneration(updated.modelVersion).settings.reason,"failed-trial-with-new-evidence");
  assert.equal(f.registry.getGeneration(updated.modelVersion).eligible,false);assert.deepEqual(f.registry.getGeneration(trial.modelVersion).modelSnapshot,trial);
  assert.deepEqual(f.registry.getActiveSnapshot(),active);assert.equal(f.calls.fit.length,3);assert.equal(state.generations.length,3);
  await f.controller.prepare({...baseOptions,weatherDaily:daily.map(day=>({...day,meanTemp:21})),asOf:"2026-09-27",samples:initial.concat(future),dataSignature:"sixteen-tested"});
  assert.equal(f.calls.fit.length,3);assert.equal(f.registry.getCandidateSnapshot().modelVersion,updated.modelVersion);
});

test("restored model choice awaiting approval uses the imported baseline without refitting or activating it",async()=>{
  const source=setup({auxiliary:true});await source.controller.prepare({...baseOptions,samples:crops(12)});
  const restored=setup({auxiliary:true});restored.registry.mergeBackup(source.registry.exportBackup());
  const before=restored.registry.getState();assert.equal(before.activeId,null);assert.ok(before.baselineId);
  assert.ok(before.conflicts.some(item=>item.type==="activeChoice"&&!item.resolvedAt));
  const result=await restored.controller.prepare({...baseOptions,asOf:"2026-01-02",samples:crops(18),dataSignature:"restored-new-labels"});
  const after=restored.registry.getState();
  assert.equal(result.runtime.fallback,true);assert.equal(result.runtime.activeId,null);assert.equal(result.modelVersion,before.baselineId);
  assert.equal(result.fit.selectedMethod,"legacy");assert.equal(result.fit.restored,true);assert.ok(result.riskFit);
  assert.equal(after.activeId,null);assert.equal(after.candidateId,before.candidateId);
  assert.deepEqual(after.generations,before.generations);assert.deepEqual(after.conflicts,before.conflicts);
  assert.deepEqual(after.evaluation,before.evaluation);assert.deepEqual(after.history,before.history);
  assert.equal(restored.calls.fit.length,0);assert.equal(restored.calls.fitQuality.length,0);
  assert.equal(restored.calls.evaluate.length,0);assert.equal(restored.calls.generations.length,0);
  // A successful fallback may record its diagnostic lastWorking timestamp; it
  // cannot resolve the imported active-choice conflict or adopt a generation.
  assert.equal(after.lastWorking.id,before.baselineId);
});

test("yield coefficients freeze with each generation and insufficient quantity evidence does not block proven growth improvement",async()=>{
  const f=setup({yieldAuxiliary:true});await f.controller.prepare({...baseOptions,samples:crops(12)});
  const active=copy(f.registry.getActiveSnapshot()),candidate=copy(f.registry.getCandidateSnapshot());
  assert.ok(active.coefficients.yield);assert.equal(f.calls.fitYield.length,2);
  await f.controller.prepare({...baseOptions,asOf:"2026-01-02",samples:crops(12)});
  assert.equal(f.calls.fitYield.length,2);
  const future=crops(20,"2026-02-01");f.entries=paired(future,active.modelVersion,candidate.modelVersion);
  await f.controller.prepare({...baseOptions,asOf:"2026-09-26",samples:crops(12).concat(future),dataSignature:"quantity-evidence"});
  const eligible=f.registry.getGeneration(f.registry.getState().candidateId);
  assert.equal(eligible.eligible,true);assert.deepEqual(eligible.modelSnapshot.coefficients.yield,candidate.coefficients.yield);
  assert.deepEqual(f.registry.getActiveSnapshot(),active);assert.equal(f.calls.fitYield.length,2);
  assert.equal(f.registry.getState().evaluation.summary.yield.gate.reason,"insufficientYieldEvidence");
});

test("quantity regression can block eligibility but quantity alone never bypasses higher-priority validation",async()=>{
  for(const growthPass of [false,true]){
    const f=setup({yieldAuxiliary:true});await f.controller.prepare({...baseOptions,samples:crops(12)});
    const active=f.registry.getActiveSnapshot(),candidate=f.registry.getCandidateSnapshot(),future=crops(20,"2026-02-01");
    f.entries=paired(future,active.modelVersion,candidate.modelVersion);f.generationGate=growthPass;f.yieldGate=growthPass;
    await f.controller.prepare({...baseOptions,asOf:"2026-09-26",samples:crops(12).concat(future),dataSignature:"quantity-gate"});
    assert.equal(f.registry.getGeneration(f.registry.getState().candidateId).eligible,false);
    assert.equal(f.registry.getState().activeId,active.modelVersion);
  }
});

test("adding yield creates a new shadow generation and leaves old active and candidate snapshots intact",async()=>{
  const f=setup();await f.controller.prepare({...baseOptions,samples:crops(12)});
  const active=copy(f.registry.getActiveSnapshot()),old=copy(f.registry.getCandidateSnapshot());let n=0;
  const controller=learning.create({engine:f.engine,registry:f.registry,evaluate:async()=>emptyValidation,
    version:()=>`yield-migration-${++n}`,fitYieldAuxiliary:options=>({schemaVersion:1,trainedAsOf:options.asOf,model:{schemaVersion:1,rows:[]},training:{independententCrops:0,cropIds:[]}})});
  await controller.prepare({...baseOptions,samples:crops(12),dataSignature:"schema:yield"});
  const candidate=f.registry.getCandidateSnapshot();assert.notEqual(candidate.modelVersion,old.modelVersion);
  assert.ok(candidate.coefficients.yield);assert.equal(f.registry.getGeneration(candidate.modelVersion).eligible,false);
  assert.equal(f.registry.getGeneration(candidate.modelVersion).settings.reason,"yield-auxiliary-added");
  assert.deepEqual(f.registry.getActiveSnapshot(),active);assert.deepEqual(f.registry.getGeneration(old.modelVersion).modelSnapshot,old);
});
