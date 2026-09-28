"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const safety=require("../src/scripts/growth-safety.js");
const copy=value=>JSON.parse(JSON.stringify(value));
const keys={records:"records:owner",plantingEvents:"planting:owner",settings:"settings",extra:["new-observations:owner","outbox:owner"]};
function fixture(){
  const rawRecords=[{id:1,recordUuid:"uuid-a",type:"fullHarvest",date:"2026-09-01",cases:12,memo:"既存メモ",palletRanges:["2-A-1-2"],plantingRanges:["2-A-1-2"],plantingDate:"2026-09-03",growthDetail:{uneven:false,bedOverrides:{}}},
    {id:2,recordUuid:"uuid-b",type:"partialHarvest",date:"2026-09-02",cases:1.5,targets:[{building:2,bed:"A",start:1,end:2,plantsPerPallet:3}]}];
  const planting=[{eventId:10,plantingDate:"2026-09-03",plantingPalletKeys:["2-A-1","2-A-2"],actualSeedlingTrayCount:1,sourceAllocations:[{harvestRecordId:1,palletKeys:["2-A-1","2-A-2"]}]}];
  const settings={defaultPlantingCount:30,beds:{A:{plant:30,lossRate:0}}};
  let state={records:copy(rawRecords),plantingEvents:copy(planting),settings:copy(settings)};
  state.records[0].palletKeys=["2-A-2","2-A-1"]; state.records[0].plantingPalletKeys=["2-A-1","2-A-2"];
  // Raw and loaded settings may differ due to existing default filling.
  state.settings.seedlingLossRate=0;
  const data=new Map([[keys.records,JSON.stringify(rawRecords,null,2)],[keys.plantingEvents,JSON.stringify(planting)],[keys.settings,JSON.stringify(settings)],["outbox:owner","[1]"]]);
  const reads=[],writes=[]; let beforeWrite=null,beforeRead=null;
  const storage={getItem(key){reads.push(key); if(beforeRead) return beforeRead(key,data); return data.get(key) ?? null;},
    setItem(key,value){if(beforeWrite) beforeWrite(key,value,data); writes.push(key); data.set(key,String(value));},
    removeItem(key){if(beforeWrite) beforeWrite(key,null,data); writes.push(key); data.delete(key);}};
  return {storage,data,reads,writes,get state(){return state;},set state(value){state=value;},
    getState:()=>copy(state),restoreState:value=>{state=copy(value);},set beforeWrite(value){beforeWrite=value;},set beforeRead(value){beforeRead=value;}};
}
function snapshot(f){return safety.ensureSnapshot(f.storage,"owner",keys,{...f.state,now:"2026-09-26T00:00:00Z"});}
function run(f,apply,extra={}){return safety.runMigration(f.storage,"owner",keys,{getState:f.getState,restoreState:f.restoreState,apply,...extra});}
function sources(f){return Object.fromEntries([keys.records,keys.plantingEvents,keys.settings,...keys.extra].map(key=>[key,f.data.get(key) ?? null]));}
function largeFixture(){
  const f=fixture(),raw=JSON.parse(f.data.get(keys.records));
  const palletKeys=Array.from({length:78},(_,index)=>`8-A-${index+1}`);
  for(let id=3;id<=242;id++){
    const row={...copy(raw[0]),id,recordUuid:`uuid-${id}`,memo:"変更前の収穫記録・苗植え記録をそのまま保存 🌱\u0000".repeat(8),
      palletRanges:["8-A-1-78"],plantingRanges:["8-A-1-78"]};
    raw.push(row);f.state.records.push({...copy(row),palletKeys:[...palletKeys],plantingPalletKeys:[...palletKeys]});
  }
  f.data.set(keys.records,JSON.stringify(raw,null,2));
  return f;
}

test("large safety snapshots retain every original byte and memory field in a smaller UTF16 envelope",()=>{
  const f=largeFixture(),before=sources(f),memory=copy(f.state),result=snapshot(f);
  const encoded=f.data.get(result.key),envelope=JSON.parse(encoded),saved=safety.readSnapshot(f.storage,"owner");
  assert.equal(envelope.encoding,"lz-string-utf16-v1");
  assert.equal(envelope.originalLength,JSON.stringify(saved).length);
  assert.ok(encoded.length<envelope.originalLength/5);
  assert.deepEqual(saved.raw,before);assert.deepEqual(saved.memory,memory);assert.deepEqual(sources(f),before);
  assert.deepEqual(f.writes,[result.key]);
});
test("compressed snapshots fit limited storage that rejects the same uncompressed baseline",()=>{
  const f=largeFixture(),before=sources(f),sourceLength=[...f.data.values()].reduce((n,value)=>n+value.length,0);
  const budget=sourceLength+64*1024;
  f.beforeWrite=(key,value,data)=>{
    const total=[...data].reduce((n,[item,text])=>n+(item===key?0:text.length),0)+(value?.length||0);
    if(total>budget)throw Object.assign(new Error("quota"),{name:"QuotaExceededError"});
  };
  const result=snapshot(f),saved=safety.readSnapshot(f.storage,"owner");
  assert.ok(sourceLength+JSON.stringify(saved).length>budget);
  assert.ok([...f.data.values()].reduce((n,value)=>n+value.length,0)<=budget);
  assert.deepEqual(sources(f),before);
});
test("compressed bootstrap reuse avoids repeated decompression and still accepts an existing uncompressed baseline",()=>{
  const f=largeFixture(),result=snapshot(f),encoded=f.data.get(result.key),saved=safety.readSnapshot(f.storage,"owner");
  const compression=require("../src/scripts/vendor/lz-string-1.5.0.min.js"),decompress=compression.decompressFromUTF16;
  let decompressCalls=0;
  try{
    compression.decompressFromUTF16=text=>{decompressCalls++;return decompress(text);};
    safety.resetCache(f.storage,"owner");
    assert.equal(snapshot(f).created,false);assert.equal(decompressCalls,1);
    f.reads.length=0;const writes=f.writes.length;
    assert.equal(snapshot(f).created,false);assert.equal(decompressCalls,1);
    assert.deepEqual(f.reads,[result.key]);assert.equal(f.writes.length,writes);assert.equal(f.data.get(result.key),encoded);
    const legacy=JSON.stringify(saved);f.data.set(result.key,legacy);safety.resetCache(f.storage,"owner");
    assert.equal(snapshot(f).created,false);assert.equal(f.data.get(result.key),legacy);
    assert.deepEqual(safety.readSnapshot(f.storage,"owner"),saved);
  }finally{compression.decompressFromUTF16=decompress;}
});
test("damaged or unknown compressed envelopes cannot overwrite originals or the failed safety baseline",()=>{
  for(const damage of [envelope=>{envelope.payload=envelope.payload.slice(0,Math.floor(envelope.payload.length/2));},
    envelope=>{envelope.originalLength++;},envelope=>{envelope.encoding="unknown-compression";}]){
    const f=largeFixture(),before=sources(f),result=snapshot(f),envelope=JSON.parse(f.data.get(result.key));
    damage(envelope);const damaged=JSON.stringify(envelope);f.data.set(result.key,damaged);safety.resetCache(f.storage,"owner");
    const writes=f.writes.length;
    assert.throws(()=>safety.readSnapshot(f.storage,"owner"));assert.throws(()=>snapshot(f));
    assert.deepEqual(sources(f),before);assert.equal(f.data.get(result.key),damaged);assert.equal(f.writes.length,writes);
  }
});
test("failed migrations retain the compressed baseline and restore the exact preceding source bytes and memory",async()=>{
  const f=largeFixture(),result=snapshot(f),encoded=f.data.get(result.key),before=sources(f),memory=copy(f.state);
  await assert.rejects(run(f,()=>{f.storage.setItem(keys.records,"[]");f.state.records=[];throw new Error("cancel");}),error=>error.rollbackSucceeded===true);
  assert.deepEqual(sources(f),before);assert.deepEqual(f.state,memory);assert.equal(f.data.get(result.key),encoded);
  assert.equal(safety.readSnapshot(f.storage,"owner").memory.records.length,242);
});

test("bootstrap saves original bytes, real raw/memory inventory and reads back before declaring success",()=>{
  const f=fixture(),before=sources(f),result=snapshot(f),saved=safety.readSnapshot(f.storage,"owner");
  assert.equal(result.created,true);assert.deepEqual(saved.raw,before);assert.deepEqual(sources(f),before);
  assert.deepEqual(saved.memory,f.state);assert.equal(saved.rawInventory.recordCount,2);assert.equal(saved.rawInventory.fullHarvestCount,1);
  assert.equal(saved.rawInventory.partialHarvestCount,1);assert.equal(saved.rawInventory.plantingEventCount,1);
  assert.equal(saved.rawInventory.harvestPalletCount,2);assert.equal(saved.rawInventory.partialPalletCount,2);assert.equal(saved.rawInventory.plantingPalletCount,2);
  assert.equal(saved.rawInventory.palletsFingerprint,saved.memoryInventory.palletsFingerprint);
  assert.notEqual(saved.rawInventory.settingsFingerprint,saved.memoryInventory.settingsFingerprint,"existing settings defaults are recorded separately, not rewritten");
  assert.deepEqual(f.writes,[safety.storageKey("owner")]);assert.ok(f.reads.filter(key=>key===safety.storageKey("owner")).length>=2);
});
test("repeat bootstrap remains idempotent after normal app edits and avoids rescanning source history",()=>{
  const f=fixture(); snapshot(f);const bytes=f.data.get(safety.storageKey("owner")),writes=f.writes.length;
  f.state.records.push({...f.state.records[1],id:3});f.data.set(keys.records,JSON.stringify(f.state.records));f.reads.length=0;
  const result=snapshot(f);assert.equal(result.created,false);assert.equal(f.data.get(safety.storageKey("owner")),bytes);assert.equal(f.writes.length,writes);
  assert.deepEqual(f.reads,[safety.storageKey("owner")]);
  safety.resetCache(f.storage,"owner");assert.equal(snapshot(f).created,false);assert.equal(f.data.get(safety.storageKey("owner")),bytes);
});
test("separate roles have independent snapshots and expose a precise rollback key",()=>{
  const f=fixture();snapshot(f);const nextKeys={records:"records:worker",plantingEvents:"planting:worker",settings:"settings",extra:[]};
  safety.ensureSnapshot(f.storage,"worker",nextKeys,{records:[],plantingEvents:[],settings:f.state.settings});
  assert.notEqual(safety.storageKey("worker"),safety.storageKey("owner"));assert.deepEqual(safety.rollbackKeys("owner"),[safety.storageKey("owner")]);
  assert.equal(safety.readSnapshot(f.storage,"worker").rawInventory.recordCount,0);assert.equal(safety.readSnapshot(f.storage,"owner").rawInventory.recordCount,2);
});
test("mismatched counts, changed pallet identities and silent quantity loss block bootstrap before any write",()=>{
  for(const change of [f=>f.state.records.pop(),f=>f.state.plantingEvents.splice(0,1),
    f=>{f.state.records[0].palletRanges=[];f.state.records[0].palletKeys=["2-A-1","2-A-3"];},
    f=>{f.state.records[1].targets[0].plantsPerPallet=2;},f=>{f.state.records[0].cases=11;}]){
    const f=fixture(),before=sources(f);change(f);assert.throws(()=>snapshot(f),/一致しません/);assert.equal(f.writes.length,0);assert.deepEqual(sources(f),before);
  }
});
test("bad raw JSON, duplicate IDs and unknown snapshot schemas never overwrite farm data",()=>{
  for(const change of [f=>f.data.set(keys.records,"{bad"),f=>{const rows=JSON.parse(f.data.get(keys.records));rows.push(rows[0]);f.data.set(keys.records,JSON.stringify(rows));},
    f=>f.data.set(safety.storageKey("owner"),JSON.stringify({schemaVersion:99}))]){
    const f=fixture();change(f);const before=sources(f);assert.throws(()=>snapshot(f));assert.deepEqual(sources(f),before);assert.equal(f.writes.length,0);
  }
});
test("quota or readback failure cannot change originals or authorize a migration",async()=>{
  for(const mode of ["quota","readback"]){
    const f=fixture(),before=sources(f);let applied=false;
    if(mode==="quota") f.beforeWrite=key=>{if(key===safety.storageKey("owner"))throw new Error("quota");};
    else f.beforeRead=(key,map)=>key===safety.storageKey("owner")&&map.has(key)?"corrupt":map.get(key)??null;
    await assert.rejects(run(f,()=>{applied=true;}));assert.equal(applied,false);assert.deepEqual(sources(f),before);
  }
});
test("a concurrent source writer during initial snapshot is detected without reverting its records",()=>{
  const f=fixture();let changed;
  f.beforeWrite=(key,value,map)=>{if(key===safety.storageKey("owner")){const data=JSON.parse(map.get(keys.records));data[0].cases=13;changed=JSON.stringify(data);map.set(keys.records,changed);}};
  assert.throws(()=>snapshot(f),/安全保存中/);assert.equal(f.data.get(keys.records),changed);assert.equal(f.data.has(safety.storageKey("owner")),false);
});
test("stored snapshot corruption and changed scope keys are detected on reuse",()=>{
  const f=fixture();snapshot(f);const saved=JSON.parse(f.data.get(safety.storageKey("owner")));saved.raw[keys.records]=JSON.stringify([]);
  f.data.set(safety.storageKey("owner"),JSON.stringify(saved));assert.throws(()=>snapshot(f),/一致しません/);
  const valid=fixture();snapshot(valid);assert.throws(()=>safety.ensureSnapshot(valid.storage,"owner",{...keys,extra:[]},valid.state),/対象が変わ/);
});
test("a conservative additive migration preserves source counts/pallets/settings and verifies memory and persisted data",async()=>{
  const f=fixture(); const result=await run(f,()=>{
    const stored=JSON.parse(f.data.get(keys.records));stored[0].growthDetail.schemaVersion=3;stored[0].growthDetail.readyDateMode="auto";
    f.storage.setItem(keys.records,JSON.stringify(stored));f.state.records[0].growthDetail.schemaVersion=3;f.state.records[0].growthDetail.readyDateMode="auto";
    f.storage.setItem("new-observations:owner",JSON.stringify({schemaVersion:1,observations:[]}));return "done";
  });
  assert.equal(result.verified,true);assert.equal(result.result,"done");assert.deepEqual(result.before,result.after);
  assert.equal(f.state.records[0].growthDetail.schemaVersion,3);assert.equal(safety.readSnapshot(f.storage,"owner").memory.records[0].growthDetail.schemaVersion,undefined);
});
test("failed migrations restore the immediately preceding raw and memory state, not the old bootstrap baseline",async()=>{
  const f=fixture();snapshot(f);
  const latest=JSON.parse(f.data.get(keys.records));latest[0].memo="新しい既存メモ";f.data.set(keys.records,JSON.stringify(latest));f.state.records[0].memo="新しい既存メモ";
  const before=sources(f),memory=f.getState();
  await assert.rejects(run(f,()=>{f.storage.setItem(keys.records,"[]");f.storage.setItem("new-observations:owner","{}");f.state.records=[];throw new Error("cancel");}),error=>error.rollbackSucceeded===true);
  assert.deepEqual(sources(f),before);assert.deepEqual(f.state,memory);assert.equal(f.data.has("new-observations:owner"),false);
});
test("count-preserving data loss and setting/pallet changes roll back even when a caller permits field changes",async()=>{
  for(const modify of [(f,rows)=>{delete rows[0].memo;delete f.state.records[0].memo;},
    (f,rows)=>{rows[0].palletRanges=["2-A-1-1"];f.state.records[0].palletRanges=[];f.state.records[0].palletKeys=["2-A-1"];},
    (f)=>{f.storage.setItem(keys.settings,JSON.stringify({defaultPlantingCount:20}));f.state.settings.defaultPlantingCount=20;}]){
    const f=fixture(),before=sources(f),memory=f.getState();
    await assert.rejects(run(f,()=>{const rows=JSON.parse(f.data.get(keys.records));modify(f,rows);f.storage.setItem(keys.records,JSON.stringify(rows));}),error=>error.rollbackSucceeded===true);
    assert.deepEqual(sources(f),before);assert.deepEqual(f.state,memory);
  }
  const f=fixture(),before=sources(f);
  await assert.rejects(run(f,()=>{const rows=JSON.parse(f.data.get(keys.records));rows[0].cases=1;f.storage.setItem(keys.records,JSON.stringify(rows));f.state.records[0].cases=1;},{allowChange:()=>true}),error=>error.rollbackSucceeded===true);
  assert.deepEqual(sources(f),before);
});
test("restore callback side effects are followed by a final exact-byte restoration",async()=>{
  const f=fixture(),before=sources(f);
  await assert.rejects(run(f,()=>{f.storage.setItem(keys.records,"[]");f.state.records=[];throw new Error("fail");},{restoreState:value=>{f.restoreState(value);f.storage.setItem("outbox:owner","[99]");}}),error=>error.rollbackSucceeded===true);
  assert.deepEqual(sources(f),before);
});
test("unrecoverable rollback failures are explicit and retain the original safety snapshot",async()=>{
  const f=fixture();let broken=false;
  f.beforeWrite=(key)=>{if(broken&&key===keys.records)throw new Error("disk unavailable");};
  await assert.rejects(run(f,()=>{f.storage.setItem(keys.records,"[]");f.state.records=[];broken=true;throw new Error("fail");}),error=>{
    assert.equal(error.rollbackSucceeded,false);assert.deepEqual(error.failedKeys,[keys.records]);return true;
  });
  assert.equal(safety.readSnapshot(f.storage,"owner").rawInventory.recordCount,2);assert.equal(f.state.records.length,2);
});
test("same-role migration calls cannot overlap and the lock is released after failure",async()=>{
  const f=fixture();let release;const wait=new Promise(resolve=>{release=resolve;});
  const first=run(f,async()=>{await wait;throw new Error("fail");});
  await assert.rejects(run(f,()=>{}),/進行中/);release();await assert.rejects(first);
  assert.equal((await run(f,()=>{})).verified,true);
});
test("empty first-run storage backs up nulls faithfully while preserving in-memory default settings",()=>{
  const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  const initial={records:[],plantingEvents:[],settings:{defaultPlantingCount:30}};
  safety.ensureSnapshot(storage,"empty",keys,initial);const saved=safety.readSnapshot(storage,"empty");
  assert.ok(Object.values(saved.raw).every(value=>value===null));assert.deepEqual(saved.memory,initial);
  assert.equal(saved.rawInventory.recordCount,0);assert.equal(data.size,1);
});
