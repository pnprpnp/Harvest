"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const backup=require("../src/scripts/growth-backup.js");
const observations=require("../src/scripts/growth-observations.js");
const management=require("../src/scripts/growth-management.js");
const copy=value=>JSON.parse(JSON.stringify(value));
const NOW=Date.parse("2026-09-27T03:00:00.000Z");
const uuid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const SOURCE_ID="1".repeat(64),MAPPED_ID="a"+"1".repeat(63);
const ready={plantingEventId:123,plantingDate:"2026-09-01",palletKeys:["2-A-1"],readyDate:"2026-09-24"};
const manual=(sourcePredictionId=SOURCE_ID,days=-2)=>({...ready,kind:"manualOffset",date:"2026-09-24",payload:{days,sourcePredictionId}});
const snapshot=version=>({schemaVersion:2,modelVersion:version,createdAt:"2026-09-20T00:00:00Z",trainedAsOf:"2026-09-20T00:00:00Z",method:"legacy",
  parameters:{id:"weather",temperaturePower:1,lightPower:1},coefficients:{farmTarget:30,prior:30,byBuilding:{},byBed:{},bySeason:{},byPosition:{},
    independentCrops:0,anchorCount:0,labelledCount:0,window:{lower:.88,upper:1.12,learned:false},legacyTargets:{},legacyGlobalTarget:30},
  training:{startDate:null,endDate:null,sampleCount:0,features:["temperature"]},validation:{methods:{},selection:{},rows:{legacy:[]}}});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};

function environment(remote=false,overrides={}){
  const data=new Map(),hooks={},events=[];
  let role=remote?"remote-records":"local-records",location="site",sequence=remote?1:0,invalidated=0,safetyCalls=0;
  const getScope=()=>`${role}:${location}`,getRole=()=>role;
  const storage={
    getItem(key){const value=data.has(key)?data.get(key):null;return hooks.read?hooks.read(key,value):value;},
    setItem(key,value){if(hooks.beforeSet)hooks.beforeSet(key,String(value));data.set(key,String(value));events.push(["write",key]);if(hooks.afterSet)hooks.afterSet(key,String(value));},
    removeItem(key){if(hooks.beforeRemove)hooks.beforeRemove(key);data.delete(key);events.push(["remove",key]);},
    readJson(key,fallback){const value=this.getItem(key);return value===null?fallback:JSON.parse(value);},
    writeJson(key,value){this.setItem(key,JSON.stringify(value));}
  };
  const observationFactory=options=>observations.create({...options,uuid:()=>uuid(++sequence)});
  const modelFactory=options=>management.create(options);
  const obs=observationFactory({storage,getRole,now:()=>NOW});
  const models=modelFactory({storage,getRole:getScope,now:()=>NOW});
  if(remote){obs.save(manual());obs.save({...ready,palletKeys:["2-B-1"]});}
  else obs.save(ready);
  models.initialBaseline(snapshot(remote?"remote-legacy":"local-legacy"));
  if(remote){models.registerCandidate(snapshot("remote-adopted"),{eligible:true,dataSignature:"remote-evidence"});models.adopt("remote-adopted",{explicit:true});}
  const obsKey=`${observations.storagePrefix || "harvestnaviGrowthObservations_v1:"}${getRole()}`;
  const modelKey=management.storagePrefix+getScope();
  // Exact rollback must retain original formatting, not just equivalent JSON.
  data.set(obsKey,JSON.stringify(JSON.parse(data.get(obsKey)),null,2));
  data.set(modelKey,JSON.stringify(JSON.parse(data.get(modelKey)),null,2));
  data.set("harvestRecords",'{ "records" : [ { "id" : 10 } ] }');
  data.set("harvestSettings",'{ "location" : "unchanged" }');
  const archives=new Map();let archiveCalls=0;
  const history={async mergeBackup(input,options){
    archiveCalls++;events.push(["archive",options.targetScope]);
    if(hooks.archive)await hooks.archive(input,options);
    const idMap={};
    for(const row of input.rows){const id=row.id===SOURCE_ID?MAPPED_ID:row.id;idMap[row.id]=id;archives.set(id,{...copy(row),id,scope:options.targetScope});}
    return {added:input.rows.length,idMap:hooks.idMap || idMap};
  }};
  const options={storage,history,observationFactory,modelFactory,getScope,getRole,now:()=>NOW,
    ensureSafety:async()=>{safetyCalls++;events.push(["safety"]);if(hooks.safety)await hooks.safety();},invalidate:()=>invalidated++,...overrides};
  const api=backup.create(options);
  const payload=()=>({app:"Harvestnavi",type:"growth-evaluation-backup",schemaVersion:1,scope:getScope(),
    restoration:{schemaVersion:1,history:{schemaVersion:1,scope:getScope(),rows:[{id:SOURCE_ID,schemaVersion:1,scope:getScope(),kind:"prediction",asOf:"2026-09-20",capturedAt:"2026-09-20T01:00:00Z",payload:{predictions:[]}}]},
      observations:obs.backup(),models:models.exportBackup(),location:{latitude:1,longitude:2},adjustments:{2:{temperatureOffsetC:2}}}});
  return {api,payload,data,hooks,events,archives,storage,obs,models,obsKey,modelKey,getScope,getRole,
    create:()=>backup.create(options),setRole:value=>role=value,setLocation:value=>location=value,
    archiveCalls:()=>archiveCalls,safetyCalls:()=>safetyCalls,invalidated:()=>invalidated,
    bytes:()=>({obs:data.get(obsKey),models:data.get(modelKey),records:data.get("harvestRecords"),settings:data.get("harvestSettings")})};
}
const incoming=()=>environment(true).payload();
function unchanged(env,before){assert.deepEqual(env.bytes(),before);}

test("another site's restored history and generations retain the source site, with adoption left pending",async()=>{
  const env=environment(false,{resolveTargetScope:(_payload,{role})=>`${role}:other-site`}),before=env.bytes(),payload=incoming();
  const result=await env.api.restore(payload);
  assert.equal(result.targetScope,"local-records:other-site");
  assert.equal(env.data.get(env.modelKey),before.models,"current site's active generation remains untouched");
  assert.equal(env.getScope(),"local-records:site","import does not switch settings");
  const remote=JSON.parse(env.data.get(management.storagePrefix+result.targetScope));
  assert.equal(remote.activeId,null);assert.ok(remote.conflicts.some(item=>item.type==="activeChoice"&&item.detail.incomingId==="remote-adopted"));
  for(const row of env.archives.values())assert.equal(row.scope,result.targetScope);
  assert.equal(result.settings.applied,false);
});

test("cross-site journal recovery restores target model bytes while current-site models stay untouched",async()=>{
  const env=environment(false,{resolveTargetScope:(_payload,{role})=>`${role}:other-site`}),before=env.bytes();
  const targetKey=management.storagePrefix+"local-records:other-site";
  env.hooks.beforeSet=(key,value)=>{if(key===targetKey||key===env.obsKey&&value===before.obs)throw new Error("blocked");};
  await assert.rejects(env.api.restore(incoming()),error=>error.rollbackSucceeded===false);
  assert.equal(env.data.get(env.modelKey),before.models);
  delete env.hooks.beforeSet;assert.equal(env.api.recover().recovered,true);
  assert.equal(env.data.has(targetKey),false);unchanged(env,before);
});

test("restore merges real observation/model states, remaps manual prediction IDs and preserves active model and farm bytes",async()=>{
  const env=environment(),before=env.bytes(),payload=incoming(),input=JSON.stringify(payload);
  const result=await env.api.restore(payload);
  assert.equal(result.activeUnchanged,true);assert.equal(result.settings.applied,false);
  assert.equal(env.data.get("harvestRecords"),before.records);assert.equal(env.data.get("harvestSettings"),before.settings);
  const local=JSON.parse(env.data.get(env.obsKey)),models=JSON.parse(env.data.get(env.modelKey));
  assert.equal(local.observations.length,3);
  assert.equal(local.observations.find(row=>row.kind==="manualOffset").payload.sourcePredictionId,MAPPED_ID);
  assert.equal(models.activeId,"local-legacy");assert.ok(models.generations.some(row=>row.id==="remote-adopted"));
  assert.ok(models.conflicts.some(row=>row.type==="activeChoice"&&row.detail.incomingId==="remote-adopted"));
  assert.equal(env.data.has(env.api.journalKey(env.getScope())),false);
  assert.equal(env.safetyCalls(),1);assert.equal(env.archiveCalls(),1);assert.ok(env.invalidated()>0);
  assert.equal(JSON.stringify(payload),input,"import never mutates the supplied backup");
  const order=env.events.map(row=>row[0]);assert.ok(order.indexOf("safety")<order.indexOf("archive"));
});

test("invalid backup schemas and missing manual source predictions fail before journal, IDB or local writes",async()=>{
  for(const mutate of [p=>p.restoration.observations.observations[0].revision="wrong",
    p=>p.restoration.models.schemaVersion=999,p=>p.restoration.history.rows=[],
    p=>p.restoration.observations.observations[0].payload.days=100,p=>p.type="other"]){
    const env=environment(),before=env.bytes(),payload=incoming();mutate(payload);
    await assert.rejects(env.api.restore(payload));unchanged(env,before);
    assert.equal(env.archiveCalls(),0);assert.equal(env.data.has(env.api.journalKey(env.getScope())),false);
  }
});

test("safety or journal capacity failure leaves the local bytes and history untouched",async()=>{
  for(const type of ["safety","quota"]){
    const env=environment(),before=env.bytes();
    if(type==="safety")env.hooks.safety=async()=>{throw new Error("safety unavailable");};
    else env.hooks.beforeSet=key=>{if(key.startsWith("harvestnaviGrowthRestore"))throw new Error("quota");};
    await assert.rejects(env.api.restore(incoming()));unchanged(env,before);assert.equal(env.archiveCalls(),0);
  }
});

test("IDB failure and missing mapped IDs roll back local bytes without touching farm records",async()=>{
  for(const type of ["archive","idMap"]){
    const env=environment(),before=env.bytes();
    if(type==="archive")env.hooks.archive=async()=>{throw new Error("IDB aborted");};
    else env.hooks.idMap={};
    await assert.rejects(env.api.restore(incoming()),error=>error.rollbackSucceeded===true);
    unchanged(env,before);assert.equal(env.data.has(env.api.journalKey(env.getScope())),false);
    if(type==="idMap")assert.ok(env.archives.size>0,"immutable archive can remain for retry");
  }
});

test("local capacity failure restores exact original bytes while retaining the committed immutable archive for retry",async()=>{
  const env=environment(),before=env.bytes();let failed=false;
  env.hooks.beforeSet=key=>{if(key===env.modelKey&&!failed){failed=true;throw new Error("quota");}};
  await assert.rejects(env.api.restore(incoming()),error=>error.rollbackSucceeded===true&&error.archivesRetained===true);
  unchanged(env,before);assert.ok(env.archives.has(MAPPED_ID));
  delete env.hooks.beforeSet;
  await env.api.restore(incoming());assert.equal(JSON.parse(env.data.get(env.obsKey)).observations.length,3);
});

test("local readback mismatch triggers rollback even when setItem itself succeeds",async()=>{
  const env=environment(),before=env.bytes();let mismatch=false,used=false;
  env.hooks.afterSet=key=>{if(key===env.obsKey&&!used)mismatch=true;};
  env.hooks.read=(key,value)=>{if(key===env.obsKey&&mismatch){mismatch=false;used=true;return "readback-mismatch";}return value;};
  await assert.rejects(env.api.restore(incoming()),error=>error.rollbackSucceeded===true);
  unchanged(env,before);assert.ok(env.archives.size>0);
});

test("concurrent local edits are preserved and retained journals refuse to overwrite them on recovery",async()=>{
  const env=environment(),before=env.bytes();let concurrent;
  env.hooks.archive=async()=>{const state=JSON.parse(before.models);state.localRevision+=99;concurrent=JSON.stringify(state);env.data.set(env.modelKey,concurrent);};
  await assert.rejects(env.api.restore(incoming()),error=>error.rollbackSucceeded===false);
  assert.equal(env.data.get(env.modelKey),concurrent);assert.equal(env.data.get(env.obsKey),before.obs);
  assert.throws(()=>env.api.recover());assert.equal(env.data.get(env.modelKey),concurrent);
  assert.equal(env.data.get("harvestRecords"),before.records);
});

test("role or site changes during the async archive phase cancel local restore in the original scope",async()=>{
  for(const change of [env=>env.setRole("other-role"),env=>env.setLocation("other-site")]){
    const env=environment(),before=env.bytes(),oldScope=env.getScope();
    env.hooks.archive=async()=>change(env);
    await assert.rejects(env.api.restore(incoming()),error=>error.rollbackSucceeded===true);
    unchanged(env,before);assert.ok(env.archives.size>0);
    assert.equal(env.data.has(env.api.journalKey(oldScope)),false);
    assert.equal(env.data.has(management.storagePrefix+env.getScope()),false);
  }
});

test("changes during the safety preflight stop before any immutable archive append",async()=>{
  for(const kind of ["role","bytes"]){
    const env=environment(),before=env.bytes();let concurrent;
    env.hooks.safety=async()=>{
      if(kind==="role")env.setRole("other-role");
      else {const state=JSON.parse(before.obs);state.localRevision+=100;concurrent=JSON.stringify(state);env.data.set(env.obsKey,concurrent);}
    };
    await assert.rejects(env.api.restore(incoming()));assert.equal(env.archiveCalls(),0);
    assert.equal(env.data.get(env.modelKey),before.models);
    assert.equal(env.data.get(env.obsKey),kind==="bytes"?concurrent:before.obs);
    assert.equal(env.data.get("harvestRecords"),before.records);
  }
});

test("one controller rejects overlapping restores and another cannot replace an in-flight journal",async()=>{
  const env=environment(),blocked=deferred();env.hooks.archive=async()=>blocked.promise;
  const first=env.api.restore(incoming());await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(env.api.restore(incoming()),/進行中/);
  await assert.rejects(env.create().restore(incoming()),/復旧|復元/);
  blocked.resolve();await first;
  assert.equal(env.archiveCalls(),1);
});

test("two preflight controllers cannot overwrite each other's journal after awaiting safety",async()=>{
  const env=environment(),a=deferred(),b=deferred(),archive=deferred();let calls=0;
  env.hooks.safety=async()=>++calls===1?a.promise:b.promise;
  env.hooks.archive=async()=>archive.promise;
  const first=env.api.restore(incoming()),second=env.create().restore(incoming());
  a.resolve();await new Promise(resolve=>setImmediate(resolve));
  const journal=env.data.get(env.api.journalKey(env.getScope()));assert.ok(journal);
  b.resolve();await assert.rejects(second,/復元|復旧/);
  assert.equal(env.data.get(env.api.journalKey(env.getScope())),journal);
  archive.resolve();await first;assert.equal(env.archiveCalls(),1);
});

test("failed rollback is recoverable from the prepared journal after storage becomes writable",async()=>{
  const env=environment(),before=env.bytes();
  env.hooks.beforeSet=(key,value)=>{if(key===env.modelKey||key===env.obsKey&&value===before.obs)throw new Error("storage blocked");};
  await assert.rejects(env.api.restore(incoming()),error=>error.rollbackSucceeded===false);
  assert.ok(env.data.has(env.api.journalKey(env.getScope())));assert.notEqual(env.data.get(env.obsKey),before.obs);
  delete env.hooks.beforeSet;
  const result=env.api.recover();assert.equal(result.recovered,true);assert.equal(result.archivesRetained,true);
  unchanged(env,before);assert.equal(env.data.has(env.api.journalKey(env.getScope())),false);
  assert.deepEqual(env.api.recover(),{recovered:false});
});

test("a committed journal with partially rolled-back bytes is recovered instead of silently discarded",async()=>{
  const env=environment(),before=env.bytes(),journalKey=env.api.journalKey(env.getScope());let marker=false,readback=false;
  env.hooks.afterSet=(key,value)=>{if(key===journalKey&&JSON.parse(value).phase==="committed")marker=true;};
  env.hooks.read=(key,value)=>{if(key===journalKey&&marker&&!readback){readback=true;return "bad-marker-readback";}return value;};
  env.hooks.beforeSet=(key,value)=>{if(marker&&key===env.obsKey&&value===before.obs)throw new Error("rollback blocked");};
  await assert.rejects(env.api.restore(incoming()),error=>error.rollbackSucceeded===false);
  assert.equal(JSON.parse(env.data.get(journalKey)).phase,"committed");
  delete env.hooks.beforeSet;delete env.hooks.afterSet;delete env.hooks.read;
  assert.equal(env.api.recover().recovered,true);unchanged(env,before);
});

test("a committed journal left after cleanup failure is cleared only after verifying committed bytes",async()=>{
  const env=environment(),key=env.api.journalKey(env.getScope());
  env.hooks.beforeRemove=name=>{if(name===key)throw new Error("cleanup blocked");};
  await env.api.restore(incoming());const restored=env.bytes();assert.ok(env.data.has(key));
  delete env.hooks.beforeRemove;
  assert.equal(env.api.recover().completed,true);unchanged(env,restored);assert.equal(env.data.has(key),false);
});

test("backup conflicts retain local manual changes and remap the incoming conflicting prediction reference",async()=>{
  const env=environment();env.obs.save(manual("b".repeat(64),3));
  await env.api.restore(incoming());
  const state=JSON.parse(env.data.get(env.obsKey)),local=state.observations.find(row=>row.observationId===uuid(2));
  assert.equal(local.payload.days,3);assert.equal(local.payload.sourcePredictionId,"b".repeat(64));
  assert.equal(state.conflicts[uuid(2)].server.payload.sourcePredictionId,MAPPED_ID);
  assert.equal(state.conflicts[uuid(2)].server.payload.days,-2);
  assert.equal(JSON.parse(env.data.get(env.modelKey)).activeId,"local-legacy");
});

test("recovery rejects journals that name existing farm record keys or belong to another role",()=>{
  for(const edit of [journal=>{journal.before.harvestRecords="old";journal.after.harvestRecords="new";},journal=>journal.role="different"]){
    const env=environment(),before=env.bytes(),key=env.api.journalKey(env.getScope());
    const journal={schemaVersion:1,scope:env.getScope(),role:env.getRole(),phase:"prepared",before:{[env.obsKey]:before.obs},after:{[env.obsKey]:before.obs}};
    edit(journal);env.data.set(key,JSON.stringify(journal));
    assert.throws(()=>env.api.recover());unchanged(env,before);assert.ok(env.data.has(key));
  }
});

test("recovery rejects malformed journal containers and after-only keys without discarding recovery evidence",()=>{
  for(const edit of [
    journal=>journal.before=[],
    journal=>journal.after=[],
    journal=>journal.before="invalid",
    journal=>journal.after="invalid",
    journal=>{journal.before={};journal.after={unexpected:"value"};},
    (journal,env)=>{journal.before={};journal.after={[env.obsKey]:"replacement"};},
    (journal,env)=>{journal.phase="committed";journal.before={};journal.after={[env.obsKey]:"replacement"};}
  ]){
    const env=environment(),before=env.bytes(),key=env.api.journalKey(env.getScope());
    const journal={schemaVersion:1,scope:env.getScope(),role:env.getRole(),phase:"prepared",
      before:{[env.obsKey]:before.obs},after:{[env.obsKey]:before.obs}};
    edit(journal,env);const raw=JSON.stringify(journal);env.data.set(key,raw);
    assert.throws(()=>env.api.recover());unchanged(env,before);
    assert.equal(env.data.get(key),raw,"malformed recovery evidence must remain for inspection");
  }
});
