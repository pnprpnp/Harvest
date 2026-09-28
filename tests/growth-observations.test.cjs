"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const observations = require("../src/scripts/growth-observations.js");
const copy = value => JSON.parse(JSON.stringify(value));
const DAY = "2026-09-26T03:00:00.000Z";
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const ready = (extra = {}) => ({plantingEventId:123,plantingDate:"2026-09-01",palletKeys:["2-A-1","2-A-2"],readyDate:"2026-09-24",...extra});
const reply = value => ({ok:true,text:async () => JSON.stringify(value)});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise,resolve}; };
function fixture(extra = {}){
  const data = new Map(); let fail = false, role = "farm", number = 0, clock = Date.parse(DAY), fetcher;
  const requests = [];
  const storage = {readJson:(key,fallback) => data.has(key) ? JSON.parse(data.get(key)) : fallback,
    writeJson:(key,value) => { if(fail) throw new Error("quota"); data.set(key,JSON.stringify(value)); }};
  const api = observations.create({storage,getRole:() => role,now:() => clock,uuid:() => id(++number),
    getConfig:() => ({url:"https://example.invalid/script",token:"test"}),
    fetch:async (url,settings) => { const request = JSON.parse(settings.body); requests.push(request); return fetcher(request,settings); },...extra});
  return {api,data,requests,storage,set fail(value){fail = value;},set role(value){role = value;},set now(value){clock=Date.parse(value);},
    set fetch(value){fetcher = value;}};
}
function server(){
  let revision = 0; const rows = new Map();
  return request => {
    const accepted = [], conflicts = [];
    request.mutations.forEach(mutation => {
      const {baseRevision,...row} = mutation, old = rows.get(row.observationId);
      const compare = value => { const item = {...value}; delete item.revision; delete item.syncedAt; return JSON.stringify(item); };
      if(old && compare(old) === compare(row)) accepted.push({observationId:row.observationId,clientUpdatedAt:row.updatedAt,observation:old});
      else if((old?.revision || 0) !== baseRevision) conflicts.push({observationId:row.observationId,server:old || null});
      else {
        const canonical = {...row,revision:++revision,syncedAt:DAY}; rows.set(row.observationId,canonical);
        accepted.push({observationId:row.observationId,clientUpdatedAt:row.updatedAt,observation:canonical});
      }
    });
    const changed = [...rows.values()].filter(row => row.revision > request.cursor).sort((a,b) => a.revision-b.revision);
    const page = changed.slice(0,request.limit);
    return {ok:true,protocolVersion:1,accepted,conflicts,rows:page,nextCursor:page.at(-1)?.revision || request.cursor,hasMore:changed.length > page.length};
  };
}
const kinds = [
  ready(),
  {kind:"ec",building:2,bed:"A",palletKeys:["2-A-1"],date:"2026-09-24",payload:{value:1.83,unit:"mS/cm"}},
  {kind:"condition",building:2,startDate:"2026-09-01",payload:{type:"equipmentFailure"}},
  {kind:"environment",building:3,bed:"F",startDate:"2026-09-01",endDate:"2026-12-01",payload:{temperature:"high",light:"low",humidity:"base",dataPolicy:"downweight"}},
  ready({kind:"manualOffset",date:"2026-09-24",payload:{days:-2,sourcePredictionId:"prediction:1"}}),
  ready({kind:"fieldAssessment",date:"2026-09-24",payload:{size:"normal",quality:{tipburn:"none",elongated:"low"}}})
];

test("six typed observations roundtrip locally and through CAS without changing existing farm storage", async () => {
  const f = fixture(), run = server(); f.fetch = request => reply(run(request));
  const before = kinds.map(input => f.api.save(input));
  assert.equal(before[0].kind,"ready"); assert.equal(before[1].payload.value,1.83);
  assert.equal("isAbnormal" in before[1].payload,false);
  assert.equal(before[2].payload.dataPolicy,"exclude"); assert.equal(before[2].endDate,"");
  assert.equal(before[5].payload.quality.uneven,"unknown"); assert.equal(before[5].payload.quality.tipburn,"none");
  assert.equal(f.api.pendingCount(),6); assert.equal(f.requests.length,0);
  assert.deepEqual([...f.data.keys()],["harvestnaviGrowthObservations_v1:farm"]);
  f.api.resetCache(); assert.deepEqual(f.api.list(),before);
  assert.equal((await f.api.sync()).synced,6); assert.equal(f.api.pendingCount(),0);
  f.api.resetCache(); assert.equal(f.api.list().length,6);
  assert.ok(f.api.list().every(row => row.revision > 0));
  assert.equal(f.requests[0].action,"syncGrowthObservations"); assert.equal(f.requests[0].protocolVersion,1);
});

test("validation keeps missing observations unknown and rejects invalid typed data before storage", () => {
  const f = fixture();
  const invalid = [
    ready({readyDate:"2026-09-31"}),ready({readyDate:"2026-09-27"}),ready({readyDate:"2026-08-31"}),
    ready({plantingEventId:0}),ready({palletKeys:[]}),ready({palletKeys:["2-A-79"]}),ready({palletKeys:["2-A-01"]}),
    ready({palletKeys:["1-A-1"]}),ready({kind:"weight"}),
    {...kinds[1],payload:{value:Infinity,unit:"mS/cm"}}, {...kinds[1],payload:{value:"2",unit:"mS/cm"}},
    {...kinds[1],payload:{value:51,unit:"mS/cm"}}, {...kinds[1],payload:{value:2,unit:"ppm"}},
    {...kinds[1],payload:{value:2,unit:"mS/cm",isAbnormal:"yes"}}, {...kinds[1],palletKeys:["2-B-1"]},
    {...kinds[2],payload:{type:"other",dataPolicy:"normal"}}, {...kinds[2],endDate:"2026-08-31"},
    {...kinds[3],payload:{temperature:"high",light:"low",dataPolicy:"normal"}},
    {...kinds[4],payload:{days:1.5,sourcePredictionId:"a"}}, {...kinds[4],payload:{days:31,sourcePredictionId:"a"}},
    {...kinds[4],payload:{days:1,sourcePredictionId:" "}}, {...kinds[5],payload:{size:"normal",quality:{uneven:"present"}}},
    {...kinds[5],payload:{size:"normal",quality:{unknownField:"none"}}}, {...kinds[1],payload:{value:2,unit:"mS/cm",unrecognized:true}}
  ];
  invalid.forEach(input => assert.throws(() => f.api.save(input)));
  assert.equal(f.api.list().length,0); assert.equal(f.data.size,0);
  const row=f.api.save(ready({palletKeys:["2-A-10","2-A-2","2-A-2"]}));
  assert.deepEqual(row.palletKeys,["2-A-2","2-A-10"]);
});

test("edits preserve immutable crop/position/date identity and allow ready date or payload corrections", () => {
  const f=fixture(), row=f.api.save(ready());
  for(const change of [{plantingEventId:124},{plantingDate:"2026-09-02"},{palletKeys:["2-A-1"]},{kind:"manualOffset",date:"2026-09-24",payload:{days:1,sourcePredictionId:"p"}}]){
    assert.throws(() => f.api.save({...row,...change}),/変更できません/);
  }
  const edited=f.api.save({...row,readyDate:"2026-09-23"});
  assert.equal(edited.createdAt,row.createdAt); assert.ok(edited.updatedAt > row.updatedAt);
  const ec=f.api.save(kinds[1]); assert.throws(() => f.api.save({...ec,date:"2026-09-23"}));
  assert.equal(f.api.save({...ec,payload:{value:2,unit:"mS/cm",isAbnormal:false}}).payload.isAbnormal,false);
});

test("write failures leave cached state, pending queue and revision unchanged for save/delete/merge", () => {
  const f=fixture(), row=f.api.save(ready()), before=f.api.backup(), bytes=[...f.data.values()][0];
  const incoming=fixture({uuid:() => id(90)}); incoming.api.save(ready());
  f.fail=true;
  assert.throws(() => f.api.save({...row,readyDate:"2026-09-25"}),/quota/);
  assert.throws(() => f.api.remove(row.observationId),/quota/);
  assert.throws(() => f.api.mergeBackup(incoming.api.backup()),/quota/);
  assert.deepEqual(f.api.backup(),before); assert.equal([...f.data.values()][0],bytes);
  f.fail=false; const deleted=f.api.remove(row.observationId.toUpperCase());
  assert.ok(deleted.deletedAt); assert.equal(f.api.list().length,0); assert.equal(f.api.list({includeDeleted:true}).length,1);
  assert.throws(() => f.api.save({...row,readyDate:"2026-09-25"}),/削除済み/);
});

test("matching uses exact planting event/date and overlapping pallets, with conservative historical availability", () => {
  const f=fixture(), row=f.api.save(ready());
  const query={plantingEventId:123,plantingDate:"2026-09-01",palletKeys:["2-A-2"]};
  assert.equal(f.api.match(query).length,1); assert.equal(f.api.match({...query,plantingEventId:124}).length,0);
  assert.equal(f.api.match({...query,plantingDate:"2026-09-02"}).length,0);
  assert.equal(f.api.match({...query,palletKeys:["2-A-3"]}).length,0);
  assert.equal(f.api.match({...query,asOf:"2026-09-25"}).length,0);
  f.api.save(kinds[5]); assert.equal(f.api.match(query).length,1);
  f.now="2026-09-27T00:00:00Z"; f.api.save({...row,readyDate:"2026-09-23"});
  assert.equal(f.api.match({...query,asOf:"2026-09-26"}).length,0);
  f.api.remove(row.observationId); assert.equal(f.api.match(query).length,0);
});

test("only one sync runs and an in-flight response stays in its original role", async () => {
  const f=fixture(), row=f.api.save(ready()), wait=deferred(), run=server();
  f.fetch=async request => { await wait.promise; return reply(run(request)); };
  const first=f.api.sync(); assert.equal(f.api.sync(),first); assert.equal(f.requests.length,1);
  f.role="other"; assert.equal(f.api.list().length,0); const other=f.api.save(ready({readyDate:"2026-09-22"}));
  wait.resolve(); await first; assert.equal(f.api.pendingCount(),1); assert.equal(f.api.list()[0].observationId,other.observationId);
  f.role="farm"; assert.equal(f.api.pendingCount(),0); assert.equal(f.api.list()[0].observationId,row.observationId);
});

test("editing, deleting and creating during sync preserves newer pending work and advances CAS base", async () => {
  for(const action of ["edit","remove"]){
    const f=fixture(), old=f.api.save(ready()), wait=deferred(), run=server();
    f.fetch=async request => { await wait.promise; return reply(run(request)); };
    const syncing=f.api.sync();
    const changed=action === "edit" ? f.api.save({...old,readyDate:"2026-09-23"}) : f.api.remove(old.observationId);
    const fresh=f.api.save(ready({palletKeys:["2-B-1"]}));
    wait.resolve(); await syncing;
    const current=f.api.list({includeDeleted:true}).find(row => row.observationId === old.observationId);
    assert.equal(current.updatedAt,changed.updatedAt); assert.equal(current.deletedAt,changed.deletedAt);
    assert.equal(f.api.pendingCount(),2); assert.equal(f.api.backup().pending[old.observationId].baseRevision,1);
    f.fetch=request => reply(run(request)); await f.api.sync();
    assert.equal(f.requests[1].mutations.find(row => row.observationId===old.observationId).baseRevision,1);
    assert.ok(f.requests[1].mutations.find(row => row.observationId===fresh.observationId));
    assert.equal(f.api.pendingCount(),0);
  }
});

test("old server, incomplete acknowledgements and malformed canonical responses cannot discard pending records", async () => {
  for(const corrupt of [
    () => ({error:"unknownAction"}), value => ({...value,accepted:[]}),
    value => ({...value,accepted:value.accepted.map(item => ({...item,clientUpdatedAt:"other"}))}),
    value => ({...value,accepted:value.accepted.map(item => ({...item,observation:{...item.observation,readyDate:"2026-09-22"}}))}),
    value => ({...value,nextCursor:0}), value => ({...value,rows:[{...value.rows[0],createdAt:"2026-02-30T12:00:00Z"}]}),
    value => ({...value,hasMore:"yes"})
  ]){
    const f=fixture(), run=server(); f.api.save(ready()); const before=f.api.backup();
    f.fetch=request => reply(corrupt(run(request)));
    await assert.rejects(f.api.sync()); assert.deepEqual(f.api.backup(),before);
  }
});

test("timeout aborts request without losing local state or applying a late acknowledgement", async () => {
  const f=fixture(), wait=deferred(), run=server(); f.api.save(ready()); let signal;
  f.fetch=async (request,settings) => { signal=settings.signal; await wait.promise; return reply(run(request)); };
  await assert.rejects(f.api.sync({timeoutMs:5}),/タイムアウト/); assert.equal(signal.aborted,true);
  wait.resolve(); await new Promise(done => setImmediate(done)); assert.equal(f.api.pendingCount(),1); assert.equal(f.api.backup().cursor,0);
});

test("a storage failure after server acceptance retries idempotently without losing the queue", async () => {
  const f=fixture(), run=server(); f.api.save(ready()); const before=f.api.backup();
  f.fetch=request => reply(run(request)); f.fail=true;
  await assert.rejects(f.api.sync(),/quota/); assert.deepEqual(f.api.backup(),before);
  f.fail=false; await f.api.sync(); assert.equal(f.api.pendingCount(),0); assert.equal(f.api.list()[0].revision,1);
});

test("concurrent devices preserve a true conflict until an explicit local/server choice", async () => {
  for(const choice of ["local","server"]){
    const run=server(), a=fixture(), b=fixture(); a.fetch=b.fetch=request => reply(run(request));
    const original=a.api.save(ready()); await a.api.sync(); await b.api.sync();
    a.api.save({...original,readyDate:"2026-09-22"}); b.api.save({...original,readyDate:"2026-09-23"});
    await a.api.sync(); await b.api.sync(); assert.equal(b.api.conflicts().length,1); assert.equal(b.api.pendingCount(),1);
    assert.equal(b.api.list()[0].readyDate,"2026-09-23");
    await b.api.sync(); assert.equal(b.requests.at(-1).mutations.length,0);
    b.api.resolveConflict(original.observationId,choice);
    assert.equal(b.api.conflicts().length,0);
    if(choice === "local") { assert.equal(b.api.pendingCount(),1); await b.api.sync(); assert.equal(b.requests.at(-1).mutations[0].baseRevision,2); }
    assert.equal(b.api.pendingCount(),0); assert.equal(b.api.list()[0].readyDate,choice === "local" ? "2026-09-23" : "2026-09-22");
  }
});

test("remote tombstones are pulled while unrelated unsent observations survive", async () => {
  const run=server(), a=fixture(), b=fixture({uuid:()=>id(50)}); a.fetch=b.fetch=request=>reply(run(request));
  const row=a.api.save(ready()); await a.api.sync(); await b.api.sync(); a.api.remove(row.observationId); await a.api.sync();
  b.api.save(ready({palletKeys:["2-B-1"]})); await b.api.sync();
  assert.equal(b.api.list().length,1); assert.equal(b.api.list({includeDeleted:true}).length,2);
});

test("requests batch at 50 and fetching advances the cursor through additional pages", async () => {
  const f=fixture(), run=server(); f.fetch=request=>reply(run(request));
  for(let n=0;n<103;n++) f.api.save(ready());
  assert.equal((await f.api.sync()).synced,103); assert.deepEqual(f.requests.map(row=>row.mutations.length),[50,50,3]);
  const remote=f.api.list().map((row,index)=>({...row,revision:index+1})); const other=fixture();
  other.fetch=request => {const page=remote.filter(row=>row.revision>request.cursor).slice(0,35);return reply({ok:true,protocolVersion:1,accepted:[],conflicts:[],rows:page,nextCursor:page.at(-1)?.revision || request.cursor,hasMore:page.at(-1)?.revision<103});};
  await other.api.sync(); assert.equal(other.requests.length,3); assert.equal(other.api.list().length,103); assert.equal(other.api.backup().cursor,103);
});

test("backup merges independent records without replacing local data and preserves unresolved conflicts", async () => {
  const a=fixture(), b=fixture({uuid:()=>id(60)}), row=a.api.save(ready()); b.api.save(ready({palletKeys:["3-A-1"]}));
  assert.deepEqual(a.api.mergeBackup(b.api.backup()),{imported:1,skipped:0,conflicts:0});
  assert.equal(a.api.list().length,2); assert.equal(a.api.mergeBackup(b.api.backup()).skipped,1);
  const divergent=a.api.backup(); divergent.observations[0].readyDate="2026-09-22";
  a.api.mergeBackup(divergent); assert.equal(a.api.list()[0].readyDate,row.readyDate); assert.equal(a.api.conflicts().length,1);
  const restored=fixture(); restored.api.restore(a.api.backup()); assert.equal(restored.api.conflicts().length,1);
  a.api.resolveConflict(row.observationId,"server"); assert.equal(a.api.list()[0].readyDate,"2026-09-22");
  assert.equal(a.api.pendingCount(),2); // Choosing a backup is still unsent, not a server acknowledgement.
  const run=server(); a.fetch=request=>reply(run(request)); await a.api.sync(); assert.equal(a.api.pendingCount(),0);
});

test("backup selection respects immutable identity and corrupted snapshots fail atomically", () => {
  const f=fixture(), row=f.api.save(ready()), incoming=f.api.backup(); incoming.observations[0].plantingEventId=99;
  f.api.mergeBackup(incoming); assert.throws(()=>f.api.resolveConflict(row.observationId,"server"),/置き換え/);
  f.api.resolveConflict(row.observationId,"local"); assert.equal(f.api.list()[0].plantingEventId,123);
  const before=f.api.backup(), corrupted=copy(before); corrupted.observations.push({...row,observationId:id(90),readyDate:"garbage"});
  assert.throws(()=>f.api.mergeBackup(corrupted)); assert.deepEqual(f.api.backup(),before);
  const conflict=copy(before); conflict.conflicts[row.observationId]={server:{...row,observationId:id(80)}};
  assert.throws(()=>f.api.restore(conflict)); assert.deepEqual(f.api.backup(),before);
});

test("timestamps normalize to UTC on import and validation rejects impossible timestamp dates", () => {
  const f=fixture(), row=f.api.save(ready()), backup=f.api.backup(), second=fixture();
  backup.observations[0].createdAt=backup.observations[0].updatedAt="2026-09-26T12:00:00+09:00";
  second.api.mergeBackup(backup); assert.equal(second.api.list()[0].createdAt,DAY);
  for(const bad of ["2026-02-30T00:00:00Z","2026-09-26T24:00:00Z","2026-09-26","2026-09-26T03:00:00"]){
    const value=copy(backup); value.observations[0].updatedAt=bad; assert.throws(()=>second.api.mergeBackup(value));
  }
  assert.equal(second.api.list()[0].observationId,row.observationId);
});
