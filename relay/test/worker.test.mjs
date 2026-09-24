import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import worker, {
  buildJmaForecastDaily,
  canAttemptGrowthWeatherRefresh,
  getGrowthWeatherRetryDelayMs,
  getJmaLightIndexFromSunshineHours,
  parseJmaPastDailyCsv,
  parseJmaPrefectureOptions,
  parseJmaStationOptions,
  relayTokenMatches,
  tokensMatch,
  validateBatchPayload,
  validateGrowthWeatherPayload,
  validateStatusPayload
} from "../src/worker.mjs";

class MemoryStatement {
  constructor(database, sql){
    this.database = database;
    this.sql = sql.replace(/\s+/g, " ").trim();
    this.args = [];
  }

  bind(...args){
    this.args = args;
    return this;
  }

  async first(){
    if(this.sql.includes("FROM relay_batches") && this.sql.includes("WHERE batch_id = ?1")){
      const row = this.database.rows.get(this.args[0]);
      return row ? { ...row } : null;
    }
    throw new Error("Unsupported first SQL: " + this.sql);
  }

  async all(){
    if(this.sql.includes("SELECT batch_id FROM relay_batches")){
      const rows = [...this.database.rows.values()]
        .filter(row => ["queued", "retry", "forwarding"].includes(row.status))
        .sort((left, right) => left.accepted_at.localeCompare(right.accepted_at))
        .slice(0, 10)
        .map(row => ({ batch_id:row.batch_id }));
      return { results:rows };
    }
    throw new Error("Unsupported all SQL: " + this.sql);
  }

  async run(){
    if(this.sql.startsWith("INSERT OR IGNORE INTO relay_batches")){
      const [batchId, fingerprint, payloadJson, now] = this.args;
      if(!this.database.rows.has(batchId)){
        this.database.rows.set(batchId, {
          batch_id:batchId,
          fingerprint,
          payload_json:payloadJson,
          result_json:null,
          status:"queued",
          accepted_at:now,
          updated_at:now,
          forwarded_at:null,
          completed_at:null,
          attempts:0,
          last_error:null
        });
        return { meta:{ changes:1 } };
      }
      return { meta:{ changes:0 } };
    }

    const batchId = this.args[0];
    const row = this.database.rows.get(batchId);
    if(this.sql.includes("SET status = 'forwarding', attempts = attempts + 1")){
      if(!row || !["queued", "retry", "forwarding"].includes(row.status)){
        return { meta:{ changes:0 } };
      }
      row.status = "forwarding";
      row.attempts++;
      row.updated_at = this.args[1];
      row.last_error = null;
      return { meta:{ changes:1 } };
    }
    if(this.sql.includes("SET status = ?2, forwarded_at = COALESCE")){
      row.status = this.args[1];
      row.forwarded_at ||= this.args[2];
      row.updated_at = this.args[2];
      row.last_error = null;
      if(row.status === "completed"){
        row.completed_at = this.args[2];
        row.result_json = this.args[3];
        row.payload_json = null;
      }
      return { meta:{ changes:1 } };
    }
    if(this.sql.includes("SET status = ?2, last_error = ?3")){
      row.status = this.args[1];
      row.last_error = this.args[2];
      row.updated_at = this.args[3];
      return { meta:{ changes:1 } };
    }
    if(this.sql.includes("SET status = 'queued', payload_json = ?2")){
      row.status = "queued";
      row.payload_json = this.args[1];
      row.result_json = null;
      row.last_error = null;
      row.updated_at = this.args[2];
      return { meta:{ changes:1 } };
    }
    if(this.sql.includes("SET status = 'completed', completed_at = ?2")){
      row.status = "completed";
      row.completed_at = this.args[1];
      row.result_json = this.args[2];
      row.payload_json = null;
      row.last_error = null;
      row.updated_at = this.args[1];
      return { meta:{ changes:1 } };
    }
    if(this.sql.includes("SET status = 'retry', updated_at = ?2")){
      row.status = "retry";
      row.updated_at = this.args[1];
      return { meta:{ changes:1 } };
    }
    if(this.sql.startsWith("DELETE FROM relay_batches")){
      return { meta:{ changes:0 } };
    }
    throw new Error("Unsupported run SQL: " + this.sql);
  }
}

class MemoryD1 {
  constructor(){
    this.rows = new Map();
  }

  prepare(sql){
    return new MemoryStatement(this, sql);
  }
}

function createPayload(type = "harvest-day-batch-inbox"){
  return type === "harvest-day-batch-inbox"
    ? {
        app:"Harvestnavi",
        type,
        action:"enqueueDayBatch",
        version:1,
        token:"relay-test-token-0000000000000000000000",
        batchId:"day-relay-test",
        syncRevision:0,
        records:[{ id:1, recordUuid:"11111111-1111-4111-8111-111111111111" }],
        plantingEvents:[]
      }
    : {
        app:"Harvestnavi",
        type,
        action:"checkDayBatchInboxStatus",
        version:1,
        token:"relay-test-token-0000000000000000000000",
        batchId:"day-relay-test"
      };
}

function createEnv(){
  const relayToken = "relay-test-token-0000000000000000000000";
  return {
    DB:new MemoryD1(),
    RELAY_TOKEN_SHA256:createHash("sha256").update(relayToken).digest("hex"),
    APPS_SCRIPT_URL:"https://script.google.com/macros/s/relay-test/exec",
    APPS_SCRIPT_TOKEN:"apps-script-token-000000000000000000000"
  };
}

test("tokens and request envelopes are validated", async () => {
  assert.equal(tokensMatch("same-token", "same-token"), true);
  assert.equal(tokensMatch("same-token", "other-token"), false);
  assert.equal(
    await relayTokenMatches(
      "relay-test-token-0000000000000000000000",
      createEnv().RELAY_TOKEN_SHA256
    ),
    true
  );
  assert.equal(await relayTokenMatches("wrong-token", createEnv().RELAY_TOKEN_SHA256), false);
  assert.equal(validateBatchPayload(createPayload()), "day-relay-test");
  assert.equal(
    validateStatusPayload(createPayload("harvest-day-batch-inbox-status")),
    "day-relay-test"
  );
});

test("the relay durably accepts before Apps Script finishes", async () => {
  const env = createEnv();
  const pending = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.token, env.APPS_SCRIPT_TOKEN);
    return new Response(JSON.stringify({
      ok:true,
      accepted:true,
      processed:false,
      queueStatus:"queued",
      batchId:payload.batchId,
      acceptedAt:"2026-09-17T00:00:00.000Z"
    }));
  };
  try{
    const response = await worker.fetch(new Request("https://relay.test/", {
      method:"POST",
      headers:{ "Content-Type":"text/plain;charset=utf-8" },
      body:JSON.stringify(createPayload())
    }), env, { waitUntil:promise => pending.push(promise) });
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.equal(result.relayAccepted, true);
    assert.equal(result.queueStatus, "queued");
    assert.equal(env.DB.rows.get("day-relay-test").payload_json.includes("relay-test-token"), false);

    await Promise.allSettled(pending);
    assert.equal(env.DB.rows.get("day-relay-test").status, "forwarded");
  }finally{
    globalThis.fetch = originalFetch;
  }
});

test("status is completed through the existing Apps Script inbox", async () => {
  const env = createEnv();
  const pending = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    if(payload.type === "harvest-day-batch-inbox"){
      return new Response(JSON.stringify({
        ok:true,
        accepted:true,
        processed:false,
        queueStatus:"queued",
        batchId:payload.batchId
      }));
    }
    return new Response(JSON.stringify({
      ok:true,
      accepted:true,
      processed:true,
      queueStatus:"completed",
      batchId:payload.batchId,
      previousSyncRevision:0,
      syncRevision:1,
      recordResults:[{ index:0, ok:true, record:{ id:1 } }],
      plantingResults:[]
    }));
  };
  try{
    await worker.fetch(new Request("https://relay.test/", {
      method:"POST",
      body:JSON.stringify(createPayload())
    }), env, { waitUntil:promise => pending.push(promise) });
    await Promise.allSettled(pending);
    assert.equal(env.DB.rows.get("day-relay-test").status, "forwarded");

    const response = await worker.fetch(new Request("https://relay.test/", {
      method:"POST",
      body:JSON.stringify(createPayload("harvest-day-batch-inbox-status"))
    }), env, { waitUntil:promise => pending.push(promise) });
    const result = await response.json();
    assert.equal(result.processed, true);
    assert.equal(result.queueStatus, "completed");
    assert.equal(env.DB.rows.get("day-relay-test").status, "completed");
    assert.equal(env.DB.rows.get("day-relay-test").payload_json, null);
  }finally{
    globalThis.fetch = originalFetch;
  }
});

test("invalid relay token is rejected", async () => {
  const env = createEnv();
  const payload = { ...createPayload(), token:"wrong-token" };
  const response = await worker.fetch(new Request("https://relay.test/", {
    method:"POST",
    body:JSON.stringify(payload)
  }), env, { waitUntil(){} });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).ok, false);
});

test("JMA past daily CSV is converted to observation growth inputs", () => {
  const daily = parseJmaPastDailyCsv([
    "downloaded header",
    ",,,header,header",
    "2026,9,20,26.7,0.3",
    "2026,9,21,25.7,6.2,0",
    "2026,9,22,,2.5"
  ].join("\r\n"));
  assert.deepEqual(daily, [{
    date:"2026-09-20",
    meanTemp:26.7,
    sunshineHours:0.3,
    lightIndex:0.3,
    source:"observation"
  }, {
    date:"2026-09-21",
    meanTemp:25.7,
    sunshineHours:6.2,
    lightIndex:0.775,
    source:"observation"
  }]);
  assert.equal(getJmaLightIndexFromSunshineHours(9.6), 1.2);
});

test("JMA station HTML and forecast area ordering resolve the representative station", () => {
  assert.deepEqual(parseJmaPrefectureOptions(
    '<div class="prefecture" id="pr86">熊本<input type="hidden" name="prid" value="86"></div>'
  ), [{ name:"熊本", code:"86" }]);
  assert.deepEqual(parseJmaStationOptions([
    '<input type="hidden" name="stid" value="s47819"><input type="hidden" name="stname" value="熊本">',
    '<input type="hidden" name="stid" value="a0846"><input type="hidden" name="stname" value="八代">'
  ].join("")), [{ id:"s47819", name:"熊本" }, { id:"a0846", name:"八代" }]);

  const location = {
    officeCode:"430000",
    forecastAreaCode:"430030",
    class20Code:"4321200",
    name:"上天草市",
    admin1:"熊本県",
    forecastAreaName:"天草・芦北地方"
  };
  const forecast = buildJmaForecastDaily([{
    timeSeries:[{
      timeDefines:["2026-09-24T00:00:00+09:00"],
      areas:[
        { area:{ code:"430010" }, weatherCodes:["100"] },
        { area:{ code:"430030" }, weatherCodes:["300"] }
      ]
    }, {
      timeDefines:["2026-09-24T00:00:00+09:00", "2026-09-24T09:00:00+09:00"],
      areas:[
        { area:{ code:"86141", name:"熊本" }, temps:["21", "30"] },
        { area:{ code:"86491", name:"牛深" }, temps:["23", "31"] }
      ]
    }]
  }, {
    timeSeries:[],
    tempAverage:{ areas:[{ min:"18", max:"28" }] }
  }], location);
  assert.deepEqual(forecast.station, { amedasCode:"86491", name:"牛深" });
  assert.equal(forecast.daily[0].weatherCode, 300);
  assert.equal(forecast.daily[0].meanTemp, 27);
});

test("growth weather requests validate location and clamp excessive history", () => {
  const request = validateGrowthWeatherPayload({
    app:"Harvestnavi",
    type:"growth-weather",
    action:"getGrowthWeather",
    location:{
      officeCode:"430000",
      forecastAreaCode:"430010",
      class20Code:"4320211",
      name:"八代市西部",
      admin1:"熊本県"
    },
    requestedStartDate:"2000-01-01"
  }, new Date("2026-09-24T00:00:00Z"));
  assert.equal(request.locationKey, "430000:430010");
  assert.equal(request.requestedStartDate, "2021-09-25");
});

test("growth weather retries use staged backoff", () => {
  assert.deepEqual(
    [1, 2, 3, 4].map(getGrowthWeatherRetryDelayMs),
    [5, 15, 60, 60].map(minutes => minutes * 60 * 1000)
  );
  const now = new Date("2026-09-24T06:00:00.000Z");
  assert.equal(canAttemptGrowthWeatherRefresh({
    status:"retry",
    next_attempt_at:"2026-09-24T06:05:00.000Z"
  }, now), false);
  assert.equal(canAttemptGrowthWeatherRefresh({
    status:"retry",
    next_attempt_at:"2026-09-24T05:59:59.000Z"
  }, now), true);
  assert.equal(canAttemptGrowthWeatherRefresh({ status:"ready" }, now), true);
});
