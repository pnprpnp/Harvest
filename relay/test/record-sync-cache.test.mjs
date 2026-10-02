import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import worker from "../src/worker.mjs";
import {getRelayRecordSync, invalidateRelayRecordSyncCache, cleanupRelayRecordSyncCache, normalizeRelayRecordSyncRequest} from "../src/record-sync-cache.mjs";

const hash = async text => createHash("sha256").update(text).digest("hex");
const sourceUrl = "https://script.google.com/macros/s/record-cache-test/exec";
const token = "record-cache-admin-token-0000000000000000";
const payload = extra => ({app:"Harvestnavi", type:"harvest-sync-all", action:"syncAll", version:1,
  sourceUrl, token, syncRevision:0, limit:1000, plantingLimit:1000, ...extra});
const result = extra => ({ok:true, revisionSync:true, syncRevision:1, nextSyncRevision:1, currentSyncRevision:1,
  records:[{id:1, recordUuid:"11111111-1111-4111-8111-111111111111", memo:"confirmed"}],
  events:[{eventId:1}], deletedRecords:[], deletedRecordUuids:[], deletedRecordIds:[], deletedEventIds:[],
  hasMore:false, plantingHasMore:false, ...extra});

function fixture(){
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../migrations/0003_create_record_sync_cache.sql", import.meta.url), "utf8"));
  const DB = {prepare(sql){
    const statement = sqlite.prepare(sql);
    let values = [];
    return {bind(...args){values=args;return this;}, async first(){return statement.get(...values) || null;},
      async all(){return {results:statement.all(...values)};}, async run(){return {meta:statement.run(...values)};}};
  }, async batch(statements){
    sqlite.exec("BEGIN");
    try{
      const outputs=[];
      for(const statement of statements) outputs.push(await statement.run());
      sqlite.exec("COMMIT");return outputs;
    }catch(error){sqlite.exec("ROLLBACK");throw error;}
  }};
  const env = {DB, APPS_SCRIPT_URL:sourceUrl, RELAY_TOKEN_SHA256:createHash("sha256").update(token).digest("hex"),
    APPS_SCRIPT_TOKEN:"existing-restricted-worker-token-00000000"};
  let clock=Date.parse("2026-10-02T03:00:00Z"), calls=0;
  const dependencies = {hash, now:()=>clock, post:async(_request, accessToken)=>{
    assert.equal(accessToken, token);calls++;return result();
  }};
  return {sqlite, env, dependencies, get calls(){return calls;}, advance:ms=>{clock+=ms;}};
}

test("Google-confirmed pages and the empty head can be read without another Google request", async()=>{
  const f=fixture();
  const first=await getRelayRecordSync(payload(),f.env,f.dependencies);
  assert.equal(first.relayCache.hit,false);assert.equal(f.calls,1);
  const repeated=await getRelayRecordSync(payload(),f.env,f.dependencies);
  assert.equal(repeated.relayCache.hit,true);assert.equal(f.calls,1);
  assert.deepEqual(repeated.records,first.records);assert.deepEqual(repeated.events,first.events);
  const head=await getRelayRecordSync(payload({syncRevision:1}),f.env,f.dependencies);
  assert.equal(head.relayCache.hit,true);assert.equal(f.calls,1);assert.deepEqual(head.records,[]);
  assert.equal(head.nextSyncRevision,1);
  assert.equal(JSON.stringify(f.sqlite.prepare("SELECT * FROM relay_record_sync_pages").all()).includes(token),false);
});

test("expiry, explicit fresh reads and write invalidation bypass cached pages",async()=>{
  const f=fixture();await getRelayRecordSync(payload(),f.env,f.dependencies);
  f.advance(59999);assert.equal((await getRelayRecordSync(payload(),f.env,f.dependencies)).relayCache.hit,true);
  f.advance(1);assert.equal((await getRelayRecordSync(payload(),f.env,f.dependencies)).relayCache.hit,false);
  assert.equal(f.calls,2);
  await getRelayRecordSync(payload({forceFresh:true}),f.env,f.dependencies);assert.equal(f.calls,3);
  await invalidateRelayRecordSyncCache(f.env);
  assert.equal((await getRelayRecordSync(payload(),f.env,f.dependencies)).relayCache.hit,false);assert.equal(f.calls,4);
});

test("old in-flight responses cannot repopulate a cache invalidated by a new write",async()=>{
  const f=fixture();let release,entered;
  const gate=new Promise(resolve=>{release=resolve;});const started=new Promise(resolve=>{entered=resolve;});
  const pending=getRelayRecordSync(payload(),f.env,{...f.dependencies,post:async()=>{entered();await gate;return result();}});
  await started;await invalidateRelayRecordSyncCache(f.env);release();await pending;
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM relay_record_sync_pages").get().n,0);
  assert.equal((await getRelayRecordSync(payload(),f.env,f.dependencies)).relayCache.hit,false);
});

test("a slower older read cannot replace a more recently confirmed page",async()=>{
  const f=fixture();let release,entered;
  const gate=new Promise(resolve=>{release=resolve;});const started=new Promise(resolve=>{entered=resolve;});
  const older=getRelayRecordSync(payload(),f.env,{...f.dependencies,post:async()=>{entered();await gate;return result();}});
  await started;f.advance(1);
  const newer=result({syncRevision:2,nextSyncRevision:2,currentSyncRevision:2,records:[{id:1,memo:"newer"}]});
  await getRelayRecordSync(payload(),f.env,{...f.dependencies,post:async()=>newer});
  release();await older;
  const cached=await getRelayRecordSync(payload(),f.env,f.dependencies);
  assert.equal(cached.relayCache.hit,true);assert.equal(cached.currentSyncRevision,2);
  assert.equal(cached.records[0].memo,"newer");
});

test("the periodic cleanup removes expired copies without touching recent responses",async()=>{
  const f=fixture();await getRelayRecordSync(payload(),f.env,f.dependencies);
  const time=Date.parse("2026-10-02T03:00:00Z");
  await cleanupRelayRecordSyncCache(f.env,time+119999);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM relay_record_sync_pages").get().n,2);
  await cleanupRelayRecordSyncCache(f.env,time+120001);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM relay_record_sync_pages").get().n,0);
});

test("source, token, legacy planting conditions and cursors have isolated cache entries",async()=>{
  const f=fixture();await getRelayRecordSync(payload(),f.env,f.dependencies);
  for(const extra of [{fallbackSeedlingLossRate:7},{fallbackSeedlingPattern:[120,60,60]},
    {fallbackPlantingCountsByBed:{A:[20,21]}},{cursor:{updatedAt:"2026-10-01T00:00:00Z",recordUuid:"11111111-1111-4111-8111-111111111111"}},
    {plantingCursor:{updatedAt:"2026-10-01T00:00:00Z",eventId:1}},{limit:500}]){
    assert.equal((await getRelayRecordSync(payload(extra),f.env,f.dependencies)).relayCache.hit,false);
  }
  assert.equal(f.calls,7);
  await assert.rejects(getRelayRecordSync(payload({sourceUrl:sourceUrl+"-other"}),f.env,f.dependencies),/接続先/);
  const otherToken="other-admin-token-0000000000000000000000";
  let checked=false;
  await assert.rejects(getRelayRecordSync(payload({token:otherToken}),f.env,{...f.dependencies,post:async()=>{
    checked=true;throw new Error("Google access denied");
  }}),/access denied/);
  assert.equal(checked,true,"a different token must not hit an administrator's cached response");
});

test("paged full sync and deletions retain Google's cursors and never invent a completed head",async()=>{
  const f=fixture();
  const cursor={updatedAt:"2026-10-01T00:00:00Z",recordUuid:"11111111-1111-4111-8111-111111111111"};
  const full=result({revisionReset:true, hasMore:true, nextCursor:cursor,
    deletedRecords:[{id:2,deletedAt:"2026-10-01T00:00:00Z"}],deletedEventIds:[2]});
  let calls=0;const dependencies={...f.dependencies,post:async()=>{calls++;return full;}};
  await getRelayRecordSync(payload({syncRevision:null}),f.env,dependencies);
  const cached=await getRelayRecordSync(payload({syncRevision:null}),f.env,dependencies);
  assert.equal(cached.relayCache.hit,true);assert.deepEqual(cached.nextCursor,cursor);
  assert.deepEqual(cached.deletedEventIds,[2]);assert.deepEqual(cached.deletedRecords,full.deletedRecords);
  await getRelayRecordSync(payload({syncRevision:1}),f.env,dependencies);assert.equal(calls,2);
});

test("malformed source responses are rejected; oversized pages and failed cache writes keep successful reads usable",async()=>{
  const f=fixture();
  await assert.rejects(getRelayRecordSync(payload(),f.env,{...f.dependencies,post:async()=>result({revisionSync:false})}),/応答/);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM relay_record_sync_pages").get().n,0);
  const large=result({records:[{id:1,memo:"あ".repeat(400000)}]});
  assert.equal((await getRelayRecordSync(payload(),f.env,{...f.dependencies,post:async()=>large})).records[0].memo.length,400000);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM relay_record_sync_pages").get().n,1,"only the small empty head should be stored");
  f.env.DB.batch=async()=>{throw new Error("free quota reached");};
  const received=await getRelayRecordSync(payload(),f.env,f.dependencies);assert.equal(received.ok,true);
  assert.equal(received.relayCache.hit,false);
});

test("the cache is bounded to 64 pages, including derived empty heads",async()=>{
  const f=fixture();
  for(let i=0;i<70;i++){
    f.advance(1);await getRelayRecordSync(payload({fallbackSeedlingLossRate:i}),f.env,f.dependencies);
  }
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM relay_record_sync_pages").get().n,64);
});

test("the HTTP read route validates relay authentication and forwards the caller's Google token",async()=>{
  const f=fixture(),originalFetch=globalThis.fetch,pending=[];let requests=0;
  globalThis.fetch=async(url,init)=>{
    requests++;assert.equal(url,sourceUrl);const body=JSON.parse(init.body);
    assert.equal(body.token,token);assert.equal(body.action,"syncAll");assert.equal(body.sourceUrl,undefined);
    return Response.json(result());
  };
  const send=body=>worker.fetch(new Request("https://relay.test/records",{method:"POST",body:JSON.stringify(body)}),
    f.env,{waitUntil:promise=>pending.push(promise)});
  try{
    assert.equal((await send(payload({token:"invalid"}))).status,403);assert.equal(requests,0);
    assert.equal((await (await send(payload())).json()).relayCache.hit,false);assert.equal(requests,1);
    assert.equal((await (await send(payload())).json()).relayCache.hit,true);assert.equal(requests,1);
    assert.equal((await send(payload({sourceUrl:sourceUrl+"-other"}))).status,503);assert.equal(requests,1);
    await Promise.allSettled(pending);
  }finally{globalThis.fetch=originalFetch;}
});

test("write, monitor and worker-snapshot envelopes cannot use the full-history cache",()=>{
  for(const extra of [{type:"harvest-day-batch-inbox"},{action:"deleteRecord"},{type:"harvest-worker-snapshot"},
    {syncRevision:-1},{syncRevision:"1"},{limit:1001}]){
    assert.throws(()=>normalizeRelayRecordSyncRequest(payload(extra),sourceUrl));
  }
});

test("a completed inbox write invalidates both previously cached records and the empty head",async()=>{
  const f=fixture();f.sqlite.exec(readFileSync(new URL("../migrations/0001_create_relay_batches.sql",import.meta.url),"utf8"));
  await getRelayRecordSync(payload(),f.env,f.dependencies);
  const originalFetch=globalThis.fetch,pending=[];
  globalThis.fetch=async(_url,init)=>{
    const body=JSON.parse(init.body);assert.equal(body.token,f.env.APPS_SCRIPT_TOKEN);
    return Response.json({ok:true,accepted:true,processed:true,queueStatus:"completed",batchId:body.batchId,
      recordResults:[],plantingResults:[],previousSyncRevision:1,syncRevision:2});
  };
  try{
    const response=await worker.fetch(new Request("https://relay.test/",{method:"POST",body:JSON.stringify({
      app:"Harvestnavi",type:"harvest-day-batch-inbox",action:"enqueueDayBatch",version:1,token,
      batchId:"invalidation-test",records:[{id:1}],plantingEvents:[]
    })}),f.env,{waitUntil:promise=>pending.push(promise)});
    assert.equal(response.status,200);await Promise.all(pending);
    assert.equal((await getRelayRecordSync(payload({syncRevision:1}),f.env,f.dependencies)).relayCache.hit,false);
    assert.equal(f.sqlite.prepare("SELECT generation FROM relay_record_sync_state").get().generation,2);
  }finally{globalThis.fetch=originalFetch;}
});
